import type { DiceResultType } from '../types';

/** Dice check result Chinese labels */
export const DICE_RESULT_LABEL: Record<DiceResultType, string> = {
  'crit-success': '大成功！',
  'extreme-success': '极难成功',
  'hard-success': '困难成功',
  success: '成功',
  failure: '失败',
  'crit-failure': '大失败！',
};

/** Dice check result colors (bright palette shared by CheatingGrid and OptionResolutionOverlay) */
export const DICE_RESULT_COLOR: Record<DiceResultType, string> = {
  'crit-success': 'var(--gold)',
  'extreme-success': '#69f0ae',
  'hard-success': '#4fc3f7',
  success: '#69f0ae',
  failure: '#ef5350',
  'crit-failure': '#d50000',
};
