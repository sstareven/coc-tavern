import { create } from 'zustand';
import type { GameVariable } from '../types';
import { useCharSheetStore } from './useCharSheetStore';
import { useBookStore } from './useBookStore';
import {
  createVariable,
  extractAllVariables,
  mergeVariables,
  parseStatChanges,
  stripVariableMarkup,
  buildSubstitutionMap,
} from '../sillytavern/variables';
import { applyMvuPatch, extractJsonPatchBlocks, type MvuOpError, type MvuPatchReport } from '../sillytavern/mvu-jsonpatch';
import { isCharsheetPath, isNumericCharsheetTarget, applyCharsheetRedirect, isKnownOptionalCharsheetPath } from '../sillytavern/mvu-charsheet-redirect';
import { COC_MVU_SCHEMA } from '../sillytavern/mvu-schema';
import { flattenStatData } from '../sillytavern/mvu-flatten';

interface VariableStore {
  // All game variables (legacy flat map: <var>/{{set:}}, manual, locked, hpChange aliases)
  variables: Record<string, GameVariable>;
  // MVU ZOD nested narrative-state tree (世界.* / 剧情.* / NPC / flags). NOT 调查员.* (char sheet owns those).
  statData: Record<string, unknown>;

  // Actions
  setVariable: (name: string, value: string, source?: GameVariable['source']) => void;
  deleteVariable: (name: string) => void;
  toggleLock: (name: string) => void;

  // Process LLM response — extract variables, return cleaned text + 结构化变量更新失败清单
  processResponse: (text: string) => {
    cleanedText: string;
    extracted: Record<string, string>;
    patchReport: MvuPatchReport;
  };

  // 在当前已提交的 statData 上叠加一批修正 op（用于失败回灌自纠），返回残余失败清单。
  applyCorrectiveOps: (ops: unknown[]) => MvuOpError[];

  // Build the full substitution map (variables + statData + character sheet)
  buildFullSubstitutionMap: () => Record<string, string>;

  // statData direct access (persistence + initvar seeding)
  setStatData: (tree: Record<string, unknown>) => void;

  // Bulk import/export
  importVariables: (json: string) => boolean;
  exportVariables: () => string;
  replaceAll: (variables: Record<string, GameVariable>) => void;
  clearAll: () => void;
}

/**
 * 把一批 MVU ops 应用到给定 statData 树（原地修改），处理 调查员.* 角色卡改道与轻量 schema 校验，
 * 并把角色卡变更提交回 useCharSheetStore。返回结构化失败清单 + 本批次累计 sanDelta（A2.4 evaluator 用）。
 * processResponse（首次应用）与 applyCorrectiveOps（自纠叠加）共用此逻辑，避免两处分叉。
 */
function applyMvuOpsToTree(tree: Record<string, unknown>, ops: unknown[]): { failed: MvuOpError[]; sanDelta: number } {
  const errors: MvuOpError[] = [];
  let sheet = useCharSheetStore.getState().sheet;
  let sheetChanged = false;
  let sanDeltaAcc = 0;
  applyMvuPatch(tree, ops, {
    schema: COC_MVU_SCHEMA,
    redirect: (dotPath, op, value) => {
      if (!isCharsheetPath(dotPath)) return false;
      const updated = applyCharsheetRedirect(sheet, dotPath, op, value);
      if (updated) {
        // A2.3：redirect 返回 RedirectResult；取 .sheet 落回引用。
        // A2.4：累计 updated.sanDelta（仅 SAN 当前值分支带出），后续 evaluator 据此触发 INT/不定/永久疯狂判定。
        sheet = updated.sheet;
        sheetChanged = true;
        if (typeof updated.sanDelta === 'number') sanDeltaAcc += updated.sanDelta;
        return true;
      }
      // applyCharsheetRedirect 返回 null 的两种语义：
      //   (a) 数值字段收到非数字 → 真实失败，已分支报错；
      //   (b) 不被支持的子路径（身份字段等）→ 良性「不写入」。
      // G2 修复：把 (b) 中【非白名单】的子路径也视作真实失败上报，
      // 防止 LLM 写错路径(`调查员.xxx.yyy`)被静默吞掉。
      if (isNumericCharsheetTarget(dotPath) && (op === 'replace' || op === 'delta')) {
        // 数值目标(HP/SAN/MP/幸运/技能)收到非数字值——真实失败，上报供自纠；
        errors.push({
          op,
          path: dotPath,
          value,
          reason: `角色卡数值字段 ${dotPath} 拒绝非数字值: ${JSON.stringify(value)}`,
          rawOp: { op, path: dotPath, value },
        });
      } else if (!isKnownOptionalCharsheetPath(dotPath)) {
        errors.push({
          op,
          path: dotPath,
          value,
          reason: `unknown charsheet path: ${dotPath}`,
          rawOp: { op, path: dotPath, value },
        });
      }
      // Always consume 调查员.* here so statData never stores a char-sheet leaf,
      // even when the specific field wasn't writable (avoids parallel source of truth).
      return true;
    },
    onOpError: (err) => errors.push(err),
  });
  if (sheetChanged) useCharSheetStore.getState().setSheet(sheet);
  return { failed: errors, sanDelta: sanDeltaAcc };
}

export const useVariableStore = create<VariableStore>((set, get) => ({
  variables: {},
  statData: {},

  setVariable: (name, value, source = 'manual') => {
    set((s) => {
      const existing = s.variables[name];
      if (existing?.locked) return s;
      return {
        variables: {
          ...s.variables,
          [name]: createVariable(name, value, source, existing?.locked ?? false),
        },
      };
    });
  },

  deleteVariable: (name) => {
    set((s) => {
      const vars = { ...s.variables };
      delete vars[name];
      return { variables: vars };
    });
  },

  toggleLock: (name) => {
    set((s) => {
      const v = s.variables[name];
      if (!v) return s;
      return { variables: { ...s.variables, [name]: { ...v, locked: !v.locked } } };
    });
  },

  processResponse: (text) => {
    // ── Legacy flat path: <var>/{{set:}} + narrative stat regex (kept for back-compat) ──
    const extracted = extractAllVariables(text);
    const statChanges = parseStatChanges(text);
    const allExtracted = { ...extracted, ...statChanges };
    // 调查员.* 属角色卡(单源真理)：legacy <var> 提取出的 调查员.* 不进 flat map，
    // 防扁平表留下平行真理叶子(其真值改由角色卡 + buildFullSubstitutionMap 注入提供)。
    const flatExtracted: Record<string, string> = {};
    for (const [k, v] of Object.entries(allExtracted)) {
      if (!isCharsheetPath(k)) flatExtracted[k] = v;
    }
    const st = get();
    const merged = mergeVariables(st.variables, flatExtracted, 'llm');

    // ── MVU ZOD path: <UpdateVariable><JSONPatch> applied to the statData tree ──
    const ops = extractJsonPatchBlocks(text);
    let nextStatData = st.statData;
    let failed: MvuOpError[] = [];
    let sanDelta = 0;
    if (ops.length > 0) {
      nextStatData = structuredClone(st.statData);
      // redirect 调查员.* → 角色卡；schema 校验 + 结构化失败收集统一在 applyMvuOpsToTree 内处理。
      const res = applyMvuOpsToTree(nextStatData, ops);
      failed = res.failed;
      sanDelta = res.sanDelta;
    }

    set({ variables: merged, statData: nextStatData });

    const patchReport: MvuPatchReport = {
      applied: ops.length - failed.length,
      failed,
    };
    // A2.4：仅当本回合捕获到 SAN 旁路增减时才挂 charSheetDeltas，避免给 evaluator 一个永远存在但都为 0 的字段。
    // episodeId = pageIndex + ':' + 时间戳，做 fingerprint dedupe key（同一事件不重复弹 INT 检定）。
    if (sanDelta !== 0) {
      let pageIdx = -1;
      try { pageIdx = useBookStore.getState().pageIndex; } catch { /* test 环境无 book store 时降级 */ }
      patchReport.charSheetDeltas = { sanDelta, episodeId: `${pageIdx}:${Date.now()}` };
    }

    return {
      cleanedText: stripVariableMarkup(text),
      extracted: allExtracted,
      patchReport,
    };
  },

  applyCorrectiveOps: (ops) => {
    if (!ops || ops.length === 0) return [];
    const next = structuredClone(get().statData);
    const res = applyMvuOpsToTree(next, ops);
    set({ statData: next });
    return res.failed;
  },

  setStatData: (tree) => set({ statData: { ...tree } }),

  buildFullSubstitutionMap: () => {
    const st = get();
    const map = buildSubstitutionMap(st.variables);

    // MVU statData (narrative 世界.*/剧情.* tree) flattened to dotted keys, OVER flat vars
    // (JSON Patch 真值优先；仅 locked manual flat var 不被覆盖) — char-sheet 调查员.* injection
    // below still wins for 调查员.* (statData never contains those — redirected to the sheet).
    const flatStat = flattenStatData(st.statData);
    for (const [key, value] of Object.entries(flatStat)) {
      // statData(JSON Patch 真值)优先于历史 flat var；仅 locked flat(手动锁定)不被覆盖。
      if (!st.variables[key]?.locked) map[key] = value;
    }

    // Auto-inject character sheet data
    const sheet = useCharSheetStore.getState().sheet;
    const chars = Object.entries(sheet.characteristics)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (!st.variables.charName?.locked) map.charName = sheet.identity.name;
    if (!st.variables.charOccupation?.locked) map.charOccupation = sheet.identity.occupation;
    if (!st.variables.charAge?.locked) map.charAge = String(sheet.identity.age);
    if (!st.variables.charGender?.locked) map.charGender = sheet.identity.gender;
    if (!st.variables.charHP?.locked) map.charHP = `${sheet.secondary.hp.current}/${sheet.secondary.hp.max}`;
    if (!st.variables.charSAN?.locked) map.charSAN = `${sheet.secondary.san.current}/${sheet.secondary.san.max}`;
    if (!st.variables.charMP?.locked) map.charMP = `${sheet.secondary.mp.current}/${sheet.secondary.mp.max}`;
    if (!st.variables.charLuck?.locked) map.charLuck = String(sheet.secondary.luck);
    if (!st.variables.charCharacteristics?.locked) map.charCharacteristics = chars;
    // ── Nested ZOD path entries (调查员.生命值.当前 etc.) ──
    if (!st.variables['调查员.生命值.当前']?.locked) map['调查员.生命值.当前'] = String(sheet.secondary.hp.current);
    if (!st.variables['调查员.生命值.最大']?.locked) map['调查员.生命值.最大'] = String(sheet.secondary.hp.max);
    if (!st.variables['调查员.理智值.当前']?.locked) map['调查员.理智值.当前'] = String(sheet.secondary.san.current);
    if (!st.variables['调查员.理智值.最大']?.locked) map['调查员.理智值.最大'] = String(sheet.secondary.san.max);
    if (!st.variables['调查员.魔法值.当前']?.locked) map['调查员.魔法值.当前'] = String(sheet.secondary.mp.current);
    if (!st.variables['调查员.魔法值.最大']?.locked) map['调查员.魔法值.最大'] = String(sheet.secondary.mp.max);
    if (!st.variables['调查员.姓名']?.locked) map['调查员.姓名'] = sheet.identity.name;
    if (!st.variables['调查员.职业']?.locked) map['调查员.职业'] = sheet.identity.occupation;
    if (!st.variables['调查员.年龄']?.locked) map['调查员.年龄'] = String(sheet.identity.age);
    if (!st.variables['调查员.性别']?.locked) map['调查员.性别'] = sheet.identity.gender;
    if (!st.variables['调查员.幸运']?.locked) map['调查员.幸运'] = String(sheet.secondary.luck);
    // ── Posture & status conditions ──
    if (!st.variables['调查员.姿态']?.locked) map['调查员.姿态'] = sheet.posture || '站立';
    if (!st.variables['调查员.状态条件']?.locked) {
      map['调查员.状态条件'] = sheet.statusConditions.length
        ? sheet.statusConditions.map((c) => `${c.name}(${c.severity})：${c.description}`).join('；')
        : '无';
    }
    // ── Insanity state (A2.7 lore EJS reads via getvar) ──
    // 临时疯狂 / 不定性疯狂 / 永久疯狂:angular paths 暴露给世界书 EJS 模板与状态栏 stat 显示。
    if (!st.variables['调查员.临时疯狂.active']?.locked) {
      map['调查员.临时疯狂.active'] = sheet.temporaryInsanity?.active ? 'true' : 'false';
    }
    if (!st.variables['调查员.临时疯狂.roundsLeft']?.locked) {
      map['调查员.临时疯狂.roundsLeft'] = String(sheet.temporaryInsanity?.roundsLeft ?? 0);
    }
    if (!st.variables['调查员.临时疯狂.bout.entry']?.locked) {
      const entry = sheet.temporaryInsanity?.bout?.entry;
      map['调查员.临时疯狂.bout.entry'] = entry === undefined || entry === null ? '' : String(entry);
    }
    if (!st.variables['调查员.不定性疯狂.active']?.locked) {
      map['调查员.不定性疯狂.active'] = sheet.indefiniteInsanity?.active ? 'true' : 'false';
    }
    if (!st.variables['调查员.不定性疯狂.daysLeft']?.locked) {
      map['调查员.不定性疯狂.daysLeft'] = String(sheet.indefiniteInsanity?.daysLeft ?? 0);
    }
    if (!st.variables['调查员.永久疯狂']?.locked) {
      map['调查员.永久疯狂'] = sheet.permanentInsanity ? 'true' : 'false';
    }
    // ── Skill entries ──
    for (const [name, skill] of Object.entries(sheet.skills)) {
      const key = `调查员.技能.${name}`;
      if (!st.variables[key]?.locked) {
        map[key] = String(skill.current);
      }
    }

    return map;
  },

  importVariables: (json) => {
    try {
      const data = JSON.parse(json);
      const vars: Record<string, GameVariable> = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.name) {
            vars[item.name] = createVariable(
              item.name,
              String(item.value ?? ''),
              item.source ?? 'manual',
              item.locked ?? false,
            );
          }
        }
      } else if (typeof data === 'object') {
        for (const [name, value] of Object.entries(data)) {
          vars[name] = createVariable(name, String(value), 'manual');
        }
      }
      set((s) => ({ variables: { ...s.variables, ...vars } }));
      return true;
    } catch (err) {
      console.warn('[useVariableStore] importVariables JSON 解析失败:', err);
      return false;
    }
  },

  exportVariables: () => {
    return JSON.stringify(Object.values(get().variables), null, 2);
  },

  replaceAll: (variables) => {
    set({ variables: { ...variables } });
  },

  clearAll: () => {
    set({ variables: {}, statData: {} });
  },
}));
