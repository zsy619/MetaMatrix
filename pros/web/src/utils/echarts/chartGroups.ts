/**
 * 图表工具栏的子分组。
 *
 * 39 个官方类别按「看数据的方式」分成 9 个子分组：
 * 基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL。
 *
 * 3D·GL 单独成组（需要 echarts-gl，渲染器也不同），工具栏里永远独立一块。
 */
import { ECHARTS_CATEGORIES } from './templates'

/** 图表子分组定义。 */
export type ChartGroupDef = {
  id: string
  label: string
  hint: string
  /** 工具栏按钮图标（emoji）。 */
  icon: string
  /** 该组包含的类别 id（顺序即展示顺序）。 */
  categoryIds: readonly string[]
}

/** 9 个子分组（3D·GL 独立一组）。 */
export const CHART_GROUPS: readonly ChartGroupDef[] = [
  {
    id: 'basic',
    icon: '📈',
    label: '基础',
    hint: '折线 / 柱状 / 饼图 / 散点',
    categoryIds: ['line', 'bar', 'pie', 'scatter', 'pictorialBar'],
  },
  {
    id: 'stats',
    icon: '📊',
    label: '统计',
    hint: '分布 / 指标 / 转化',
    categoryIds: ['boxplot', 'heatmap', 'themeRiver', 'gauge', 'funnel'],
  },
  {
    id: 'relation',
    icon: '🕸️',
    label: '关系',
    hint: '节点连线与流量',
    categoryIds: ['graph', 'lines', 'sankey', 'chord'],
  },
  {
    id: 'hierarchy',
    icon: '🌳',
    label: '层级',
    hint: '树状结构占比',
    categoryIds: ['tree', 'treemap', 'sunburst'],
  },
  {
    id: 'geo',
    icon: '🗺️',
    label: '地理',
    hint: '区域分布',
    categoryIds: ['map'],
  },
  {
    id: 'finance',
    icon: '💹',
    label: '金融',
    hint: '行情走势',
    categoryIds: ['candlestick'],
  },
  {
    id: 'coordinate',
    icon: '🎯',
    label: '坐标系',
    hint: '多维与时间轴',
    categoryIds: ['radar', 'parallel', 'calendar', 'matrix'],
  },
  {
    id: 'component',
    icon: '🧩',
    label: '组件',
    hint: '数据与叠加组件',
    categoryIds: ['dataset', 'dataZoom', 'graphic', 'rich', 'custom'],
  },
  {
    id: 'gl',
    icon: '🧊',
    label: '3D·GL',
    hint: 'WebGL 三维图（独立渲染器）',
    categoryIds: [
      'globe',
      'bar3D',
      'scatter3D',
      'surface',
      'map3D',
      'lines3D',
      'line3D',
      'scatterGL',
      'linesGL',
      'flowGL',
      'graphGL',
    ],
  },
]

/** 类别 id → 子分组。 */
const GROUP_BY_CATEGORY = new Map<string, ChartGroupDef>()
for (const group of CHART_GROUPS) {
  for (const id of group.categoryIds) GROUP_BY_CATEGORY.set(id, group)
}

/** 按分组整理后的类别（每个分组一行，含类别定义）。 */
export type ChartGroupWithCategories = {
  group: ChartGroupDef
  categories: Array<(typeof ECHARTS_CATEGORIES)[number]>
}

/**
 * 按子分组整理类别目录。
 *
 * 未登记到任何分组的类别会被放进「基础」分组，保证一个都不丢。
 */
export function buildChartGroups(): ChartGroupWithCategories[] {
  const buckets = new Map<string, Array<(typeof ECHARTS_CATEGORIES)[number]>>()
  for (const group of CHART_GROUPS) buckets.set(group.id, [])
  for (const category of ECHARTS_CATEGORIES) {
    const group = GROUP_BY_CATEGORY.get(category.id) || CHART_GROUPS[0]!
    const bucket = buckets.get(group.id)
    if (bucket) bucket.push(category)
    else buckets.set(CHART_GROUPS[0]!.id, [...(buckets.get(CHART_GROUPS[0]!.id) || []), category])
  }
  return CHART_GROUPS.map((group) => ({
    group,
    categories: buckets.get(group.id) || [],
  }))
}

/** 类别 id 属于哪个子分组。 */
export function chartGroupOf(categoryId: string): ChartGroupDef {
  return GROUP_BY_CATEGORY.get(categoryId) || CHART_GROUPS[0]!
}

/** 3D·GL 分组 id（需要 echarts-gl 的类别都在这里）。 */
export const CHART_GL_GROUP_ID = 'gl'
