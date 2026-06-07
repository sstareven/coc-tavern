/**
 * scripts/backfill-scenario-pools.ts
 * 一次性 Node 脚本 — 为 8 个内置剧本(__free 除外)批量生成
 *   customOccupations / customSkills / skillBlacklist
 * 三个时代化字段,产物写到 scripts/.backfill-output/<scn-id>.json,
 * 人工 paste 回 src/data/scenarios/<scn>.ts。
 *
 * 用法:
 *   tsx scripts/backfill-scenario-pools.ts                # 默认 --all
 *   tsx scripts/backfill-scenario-pools.ts --all
 *   tsx scripts/backfill-scenario-pools.ts --scenario=rome-cthulhu
 *   tsx scripts/backfill-scenario-pools.ts --field=occupations
 *   tsx scripts/backfill-scenario-pools.ts --field=skills
 *   tsx scripts/backfill-scenario-pools.ts --field=blacklist
 *   tsx scripts/backfill-scenario-pools.ts --scenario=gaslight --field=skills
 *   tsx scripts/backfill-scenario-pools.ts --dry-run        # 仅生成 JSON 不写回 src/
 *
 * 流程(对每个 scn ∈ BUILTIN_SCENARIOS && scn.id !== '__free'):
 *   并行调用三个 LLM 命令:
 *     occ        = generateCustomOccupations(meta, [], 10)
 *     skills     = generateCustomSkills(meta, [], 6)
 *     blacklist  = proposeSkillBlacklist(meta, [])
 *   合入产物 → scripts/.backfill-output/<scn-id>.json
 *   失败重试 ×2;仍失败 → 写空 + 追加 failures.log
 *
 * 性能预估: 8 剧本 × 3 子调用 = 24 次 LLM(单剧本并行,跨剧本串行,约 2-3 分钟)
 *
 * 安全护栏:
 * - 输出目录 scripts/.backfill-output/ 已 gitignore,不直接覆盖 src/
 * - 收尾步骤是人工 paste 回剧本文件
 * - __free 不回填(无时代约束本质就是空字段)
 *
 * 见 docs/specs/2026-06-06-scenario-section-1-design.md §7.1
 */
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_SCENARIOS } from '../src/data/builtin-scenarios';
import {
  generateCustomOccupations,
  generateCustomSkills,
  proposeSkillBlacklist,
} from '../src/scenario/scenario-llm';
import type { ScenarioDoc } from '../src/types/scenario';
import type { Occupation } from '../src/sillytavern/coc-data';
import type { ScenarioCustomSkill } from '../src/types/scenario';

// ---- 路径解析(脚本可从任意 cwd 调起) ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = resolve(__dirname, '.backfill-output');
const FAILURES_LOG = resolve(OUTPUT_DIR, 'failures.log');

// ---- CLI flag 解析(简易 parseArgs,不引第三方库) ----
type FieldKind = 'occupations' | 'skills' | 'blacklist' | 'all';
interface CliArgs {
  all: boolean;
  scenario: string | null; // 单剧本 id;null = 全部
  field: FieldKind; // 默认 'all'
  dryRun: boolean;
}

function parseCli(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, scenario: null, field: 'all', dryRun: false };
  for (const raw of argv) {
    if (raw === '--all') args.all = true;
    else if (raw === '--dry-run') args.dryRun = true;
    else if (raw.startsWith('--scenario=')) args.scenario = raw.slice('--scenario='.length);
    else if (raw.startsWith('--field=')) {
      const v = raw.slice('--field='.length);
      if (v === 'occupations' || v === 'skills' || v === 'blacklist') args.field = v;
      else throw new Error(`未知 --field 值: ${v} (允许 occupations|skills|blacklist)`);
    } else if (raw === '--help' || raw === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${raw}`);
    }
  }
  // 默认 --all 行为:未指定 --scenario 时按全集走
  if (!args.scenario) args.all = true;
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`用法: tsx scripts/backfill-scenario-pools.ts [flags]
  --all                                全 8 剧本(默认)
  --scenario=<id>                      单剧本 id(如 rome-cthulhu)
  --field=occupations|skills|blacklist 仅生成单字段(默认三字段都生成)
  --dry-run                            只生成 JSON 不写回 src/
  --help, -h                           显示本帮助`);
}

// ---- 产物 schema ----
interface BackfillOutput {
  scenarioId: string;
  generatedAt: string; // ISO 时间戳
  customOccupations: Occupation[];
  customSkills: ScenarioCustomSkill[];
  skillBlacklist: string[];
  suggestedNewSkills: string[]; // 来自 generateCustomOccupations 副产品
  suggestedBlacklist: string[]; // 来自 generateCustomSkills 副产品
  reasonMap: Record<string, string>; // 来自 proposeSkillBlacklist 副产品
  failures: string[]; // 单字段失败标签(occupations/skills/blacklist)
}

// ---- 带重试包装(2 次重试 = 共 3 次尝试) ----
async function withRetry<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<{ value: T; failed: boolean }> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const value = await fn();
      return { value, failed: false };
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.warn(`[backfill ${label}] 第 ${attempt}/${MAX_ATTEMPTS} 次尝试失败: ${stringifyErr(err)}`);
    }
  }
  // eslint-disable-next-line no-console
  console.error(`[backfill ${label}] 三次尝试全部失败,使用 fallback 空值: ${stringifyErr(lastErr)}`);
  return { value: fallback, failed: true };
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ---- 单剧本回填 ----
async function backfillScenario(scn: ScenarioDoc, args: CliArgs): Promise<BackfillOutput> {
  const wantOcc = args.field === 'all' || args.field === 'occupations';
  const wantSkill = args.field === 'all' || args.field === 'skills';
  const wantBlack = args.field === 'all' || args.field === 'blacklist';

  // 三个调用对同一剧本并行(Promise.all)
  const [occRes, skillRes, blackRes] = await Promise.all([
    wantOcc
      ? withRetry(
          `${scn.id}/occupations`,
          () => generateCustomOccupations(scn.meta, [], 10),
          { upsertOccupations: [] as Occupation[], suggestedNewSkills: [] as string[] },
        )
      : Promise.resolve({ value: { upsertOccupations: [] as Occupation[], suggestedNewSkills: [] as string[] }, failed: false }),
    wantSkill
      ? withRetry(
          `${scn.id}/skills`,
          () => generateCustomSkills(scn.meta, [], 6),
          { upsertCustomSkills: [] as ScenarioCustomSkill[], suggestedBlacklist: [] as string[] },
        )
      : Promise.resolve({ value: { upsertCustomSkills: [] as ScenarioCustomSkill[], suggestedBlacklist: [] as string[] }, failed: false }),
    wantBlack
      ? withRetry(
          `${scn.id}/blacklist`,
          () => proposeSkillBlacklist(scn.meta, []),
          { addToBlacklist: [] as string[], removeFromBlacklist: [] as string[], reasonMap: {} as Record<string, string> },
        )
      : Promise.resolve({
          value: { addToBlacklist: [] as string[], removeFromBlacklist: [] as string[], reasonMap: {} as Record<string, string> },
          failed: false,
        }),
  ]);

  const failures: string[] = [];
  if (wantOcc && occRes.failed) failures.push('occupations');
  if (wantSkill && skillRes.failed) failures.push('skills');
  if (wantBlack && blackRes.failed) failures.push('blacklist');

  return {
    scenarioId: scn.id,
    generatedAt: new Date().toISOString(),
    customOccupations: occRes.value.upsertOccupations ?? [],
    customSkills: skillRes.value.upsertCustomSkills ?? [],
    skillBlacklist: blackRes.value.addToBlacklist ?? [],
    suggestedNewSkills: occRes.value.suggestedNewSkills ?? [],
    suggestedBlacklist: skillRes.value.suggestedBlacklist ?? [],
    reasonMap: blackRes.value.reasonMap ?? {},
    failures,
  };
}

// ---- 输出落盘 ----
async function ensureOutputDir(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function writeOutput(out: BackfillOutput, args: CliArgs): Promise<void> {
  if (args.dryRun) {
    // eslint-disable-next-line no-console
    console.log(`[backfill ${out.scenarioId}] --dry-run: 跳过落盘,JSON 内容如下:\n${JSON.stringify(out, null, 2)}`);
    return;
  }
  const path = resolve(OUTPUT_DIR, `${out.scenarioId}.json`);
  await writeFile(path, JSON.stringify(out, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[backfill ${out.scenarioId}] 已写出 ${path}`);
}

async function logFailures(out: BackfillOutput, args: CliArgs): Promise<void> {
  if (args.dryRun || out.failures.length === 0) return;
  const line = `[${out.generatedAt}] ${out.scenarioId}: ${out.failures.join(',')}\n`;
  await appendFile(FAILURES_LOG, line, 'utf8');
}

// ---- 主流程 ----
async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  await ensureOutputDir();

  // 过滤目标剧本: __free 永不回填;--scenario 指定时只跑该 id
  const targets = BUILTIN_SCENARIOS.filter((scn) => {
    if (scn.id === '__free') return false;
    if (args.scenario) return scn.id === args.scenario;
    return true; // --all 默认
  });

  if (targets.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`未找到目标剧本(--scenario=${args.scenario ?? 'all'})`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill] 目标剧本 ${targets.length} 个,字段=${args.field},dry-run=${args.dryRun}`);

  // 单剧本串行(防 LLM rate limit),三字段并行
  for (const scn of targets) {
    // eslint-disable-next-line no-console
    console.log(`[backfill] 开始 ${scn.id} (${scn.meta.name})`);
    const out = await backfillScenario(scn, args);
    await writeOutput(out, args);
    await logFailures(out, args);
  }

  // eslint-disable-next-line no-console
  console.log('[backfill] 完成');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backfill] 致命错误:', err);
  process.exit(1);
});
