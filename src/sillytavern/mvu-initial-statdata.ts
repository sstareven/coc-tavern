/**
 * Initial MVU statData tree seeded at character creation.
 *
 * Source-of-truth boundary (per MVU ZOD architecture review): 调查员.* belongs to the
 * character sheet (useCharSheetStore), so it is DELIBERATELY EXCLUDED here. statData only
 * seeds narrative state: 世界 (world) / 剧情 (plot) / 战斗 (combat). The LLM then evolves
 * these via <JSONPatch> ops; patches targeting 调查员.* are redirected to the char sheet.
 *
 * `_元数据` uses the `_`-prefixed readonly convention (skipped by flatten/macro exposure).
 */
export function createInitialStatData(): Record<string, unknown> {
  return {
    世界: {
      日期: '1925-01-01',
      时间: '清晨',
      天气: '薄雾',
      地点: '未知',
      场景描述: '',
    },
    剧情: {
      当前章节: '序章',
      章节概述: '',
      关键事件: {},
      线索: {},
      NPC: {},
      任务: {},
      阶段: '调查期',
      暗线: {
        描述: '',
        进度: 0,
        威胁等级: '潜伏',
      },
      结局类型: '',
      已解锁: {},
    },
    战斗: {
      是否战斗中: false,
      回合数: 0,
      敌人: {},
    },
    _元数据: {
      _最后更新: '',
      _变量版本: '1.0',
    },
  };
}
