/**
 * 图表子分组 id（顺序 = 工具栏里的顺序）。
 *
 * 单独拆一个不依赖模板文件的小模块：工具栏分组顺序的持久化（rteToolbarGroups）
 * 只要这 9 个 id，而 chartGroups.ts 会连带引入 39 个图表模板目录。
 * chartGroups.ts 会用本表构造 CHART_GROUPS，顺序由测试守卫。
 */
export const CHART_GROUP_IDS = [
  'basic',
  'stats',
  'relation',
  'hierarchy',
  'geo',
  'finance',
  'coordinate',
  'component',
  'gl',
] as const

export type ChartGroupId = (typeof CHART_GROUP_IDS)[number]
