import { getTreePath } from './mvu-var-access';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TimeDelta {
  days: number;
  hours: number;
  minutes: number;
}

/* ------------------------------------------------------------------ */
/*  parseTimeDelta                                                     */
/* ------------------------------------------------------------------ */

export function parseTimeDelta(raw: unknown): TimeDelta | null {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const days = Math.max(0, Number(obj.days) || 0);
  const hours = Math.max(0, Number(obj.hours) || 0);
  const minutes = Math.max(0, Number(obj.minutes) || 0);
  if (days === 0 && hours === 0 && minutes === 0) return null;
  return { days, hours, minutes };
}

/* ------------------------------------------------------------------ */
/*  formatEpochDisplay                                                 */
/* ------------------------------------------------------------------ */

export function formatEpochDisplay(startDate: string, epochMinutes: number): string {
  const base = new Date(startDate);
  if (isNaN(base.getTime())) return '';
  const ts = base.getTime() + epochMinutes * 60_000;
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hh}:${mm}`;
}

/* ------------------------------------------------------------------ */
/*  accumulateTime                                                     */
/* ------------------------------------------------------------------ */

export function accumulateTime(
  statData: Record<string, unknown>,
  delta: TimeDelta,
): { newEpoch: number; display: string } {
  const prevEpoch = Number(getTreePath(statData, '世界.时间.epoch')) || 0;
  const startDate = String(getTreePath(statData, '世界.时间.startDate') ?? '');
  const deltaMinutes = delta.days * 1440 + delta.hours * 60 + delta.minutes;
  const newEpoch = prevEpoch + deltaMinutes;
  const display = formatEpochDisplay(startDate, newEpoch);
  return { newEpoch, display };
}

/* ------------------------------------------------------------------ */
/*  shouldResetDailySan                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns true when oldEpoch → newEpoch crosses a calendar-day boundary
 * relative to the given startDate.  Used to reset dailySanLoss at midnight.
 */
export function shouldResetDailySan(startDate: string, oldEpoch: number, newEpoch: number): boolean {
  if (!startDate || newEpoch <= oldEpoch) return false;
  const base = new Date(startDate);
  if (isNaN(base.getTime())) return false;
  const oldDay = Math.floor((base.getTime() + oldEpoch * 60_000) / 86_400_000);
  const newDay = Math.floor((base.getTime() + newEpoch * 60_000) / 86_400_000);
  return newDay > oldDay;
}

/* ------------------------------------------------------------------ */
/*  fatiguePenalty                                                      */
/* ------------------------------------------------------------------ */

/**
 * COC 7e sleep deprivation: after 24 h without sleep, -20% to all skill
 * checks. Cumulative per additional 24 h block.
 * Returns 0 (no penalty) or a negative number (e.g. -20, -40 ...).
 */
export function fatiguePenalty(hoursSinceRest: number): number {
  if (hoursSinceRest < 24) return 0;
  return -20 * Math.floor(hoursSinceRest / 24);
}

/* ------------------------------------------------------------------ */
/*  canRestNow                                                         */
/* ------------------------------------------------------------------ */

export function canRestNow(
  epochMinutes: number,
  lastRestEpoch: number,
  inCombat: boolean,
): boolean {
  const hoursSinceRest = (epochMinutes - lastRestEpoch) / 60;
  return hoursSinceRest >= 24 && !inCombat;
}

/* ------------------------------------------------------------------ */
/*  executeRest                                                        */
/* ------------------------------------------------------------------ */

export function executeRest(epochMinutes: number): { newEpoch: number; hpRecovered: number } {
  return { newEpoch: epochMinutes + 480, hpRecovered: 1 };
}

/* ------------------------------------------------------------------ */
/*  rollSanRecovery                                                    */
/* ------------------------------------------------------------------ */

export interface SanRecoveryResult {
  recovered: number;
  roll: number;
  success: boolean;
}

/**
 * COC7e SAN self-help recovery during rest.
 * Roll d100 vs POW — on success recover 1D3 SAN (capped at sanMax).
 *
 * @param pow        investigator's POW characteristic
 * @param currentSan current SAN value
 * @param sanMax     maximum SAN value
 * @param rng        random number generator returning [0,1) — defaults to Math.random
 */
export function rollSanRecovery(
  pow: number,
  currentSan: number,
  sanMax: number,
  rng: () => number = Math.random,
): SanRecoveryResult {
  const roll = Math.floor(rng() * 100) + 1; // 1–100
  const success = roll <= pow;
  if (!success || currentSan >= sanMax) {
    return { recovered: 0, roll, success };
  }
  const d3 = Math.floor(rng() * 3) + 1; // 1–3
  const recovered = Math.min(d3, sanMax - currentSan);
  return { recovered, roll, success };
}

/* ------------------------------------------------------------------ */
/*  computeExpectedProgress                                            */
/* ------------------------------------------------------------------ */

export function computeExpectedProgress(
  currentEpoch: number,
  storyDurationMinutes: number,
): number | null {
  if (storyDurationMinutes <= 0) return null;
  return Math.min(100, Math.round((currentEpoch / storyDurationMinutes) * 100));
}

/* ------------------------------------------------------------------ */
/*  clampDarkThreadProgress                                            */
/* ------------------------------------------------------------------ */

export function clampDarkThreadProgress(
  current: number,
  expected: number | null,
  llmProgress: number,
): number {
  if (expected === null) return Math.max(current, llmProgress);
  const floor = Math.max(current, expected - 15);
  const ceiling = expected + 10;
  return Math.max(floor, Math.min(ceiling, llmProgress));
}
