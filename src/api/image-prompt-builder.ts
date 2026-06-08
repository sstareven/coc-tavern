// 从 BookPage + store snapshots 构造 ImageRenderContext → resolveImageGen → 最终 SD prompt。
// 纯函数,零 LLM 子调用,零 store 副作用 — 全部 input 显式传入便于单测。
//
// 设计:
// - sceneInfo 5 字段直接映射(location/time/weather);
// - leftContent 截前 120 字作为 sceneBrief(去 markdown/换行/关键词标签 <kw></kw>);
// - characters 取本回合 npcUpdates 中 importance ∈ {核心,重要} 且 isPresent=true 的前 2 个 name;
// - san 取本回合 sheetSnapshot.secondary.san.current(若有);
// - 全部 input 都是 optional / 不存在时填空字符串 → 占位符替空,不孤立残留。

import type { BookPage } from '../types';
import type { ScenarioDoc } from '../types/scenario';
import type { CharacterSheet } from '../types';
import {
  resolveImageGen,
  type ImageRenderContext,
  type ResolvedImageGenSpec,
  type SettingsImageDefaults,
} from './image-gen-merge';

const SCENE_BRIEF_MAX_CHARS = 120;

/** 从 leftContent 提炼前 N 字:去 <kw>tag</kw> 包裹、去换行、去多余空白。 */
export function distillSceneBrief(leftContent: string, maxChars = SCENE_BRIEF_MAX_CHARS): string {
  if (!leftContent) return '';
  // 1. 去 <kw>X</kw> 保留 X
  let s = leftContent.replace(/<kw>([^<]+)<\/kw>/g, '$1');
  // 2. 去其他自闭合 / 行内标签(<san id="p1"/> 等)
  s = s.replace(/<[^>]+\/>/g, '');
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  // 3. 合并空白
  s = s.replace(/\s+/g, ' ').trim();
  // 4. 截前 N 字(中文按字符)
  return Array.from(s).slice(0, maxChars).join('');
}

/** 从本回合 npcUpdates 拿在场重要角色名(去重保序,最多 N 个)。 */
export function pickPresentImportantNpcNames(
  page: BookPage,
  maxCount = 2,
): string[] {
  if (!page.npcUpdates || page.npcUpdates.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of page.npcUpdates) {
    if (!u.name) continue;
    if (u.isPresent === false) continue;
    if (u.importance && u.importance !== '核心' && u.importance !== '重要') continue;
    const k = u.name.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= maxCount) break;
  }
  return out;
}

/** 从 BookPage + scenarioDoc + settings 构造 ImageRenderContext。 */
export function buildImageRenderContext(
  page: BookPage,
  sheetSnapshot?: CharacterSheet,
): ImageRenderContext {
  const sceneInfo = page.sceneInfo;
  return {
    location: sceneInfo?.location ?? '',
    time: sceneInfo?.time ?? '',
    weather: sceneInfo?.weather ?? '',
    characters: pickPresentImportantNpcNames(page, 2),
    san: sheetSnapshot?.secondary?.san?.current,
    sceneBrief: distillSceneBrief(page.leftContent ?? ''),
  };
}

/**
 * 主入口:从 BookPage 拼出最终生图入参。
 * @returns 若 enabled=false 返回 null(调用方据此跳过 fetch)
 */
export function buildImageSpecFromPage(
  page: BookPage,
  scenarioDoc: ScenarioDoc | undefined,
  settingsBase: SettingsImageDefaults,
  settingsEnabled: boolean,
  sheetSnapshot?: CharacterSheet,
): ResolvedImageGenSpec {
  const ctx = buildImageRenderContext(page, sheetSnapshot);
  return resolveImageGen(settingsBase, scenarioDoc?.imageGen, ctx, settingsEnabled);
}
