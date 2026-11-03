/**
 * custom（自定义系列）的内置 renderItem 预设。
 *
 * 安全约束：文档里存的 option 是纯 JSON，**不允许**携带函数，
 * 因此 renderItem 只能写成预设名字（如 'preset:scatter'），
 * 渲染前再由这里映射成真正的函数执行。
 * 也就是说：用户只能选白名单里的几种画法，不能塞任意代码。
 */

/** renderItem 预设的 id 列表（净化器据此放行）。 */
export const CUSTOM_RENDER_ITEM_IDS = [
  'preset:scatter',
  'preset:bar',
  'preset:heatmap',
  'preset:pie',
] as const

export type CustomRenderItemId = (typeof CUSTOM_RENDER_ITEM_IDS)[number]

/** ECharts 5/6 的 renderItem 上下文（只用到其中一部分）。 */
type CustomRenderItemParams = {
  dataIndex: number
  coordinateSystem: string
  seriesIndex: number
  data: unknown
}

type CustomApi = {
  value: (dim: number) => number
  coord: (data: unknown[]) => number[]
  size?: (data: unknown[]) => number[]
}

/**
 * 画笔样式。
 * ECharts 6 起 api.style() 已废弃，改为直接写样式字面量；
 * 颜色优先取数据项上的 itemStyle.color / series.itemStyle.color。
 */
function brushStyle(params: CustomRenderItemParams): Record<string, unknown> {
  const item = (params.data || {}) as Record<string, unknown>
  const itemStyle = (item.itemStyle || {}) as Record<string, unknown>
  const seriesStyle = ((params as unknown as { seriesStyle?: Record<string, unknown> }).seriesStyle || {}) as Record<string, unknown>
  return {
    fill: itemStyle.color || seriesStyle.color || '#4a7fb5',
    opacity: itemStyle.opacity ?? seriesStyle.opacity ?? 0.85,
  }
}

type CustomElement = Record<string, unknown>

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** 散点：一个圆点，半径取第三个维度（没有就用固定值）。 */
function renderScatter(params: CustomRenderItemParams, api: CustomApi): CustomElement {
  const value = api.value(1)
  const radius = Math.max(4, Math.min(40, api.value(2) || 8))
  const point = api.coord([params.dataIndex, value])
  return {
    type: 'circle',
    shape: { cx: round(point[0]), cy: round(point[1]), r: radius },
    style: brushStyle(params),
  }
}

/** 柱状：一条从基线到数值的矩形。 */
function renderBar(params: CustomRenderItemParams, api: CustomApi): CustomElement {
  const value = api.value(1)
  const base = api.coord([params.dataIndex, 0])
  const top = api.coord([params.dataIndex, value])
  const size = api.size ? api.size([1, Math.abs(value)]) : [12, 10]
  return {
    type: 'rect',
    shape: {
      x: round(Math.min(base[0], top[0])),
      y: round(Math.min(base[1], top[1])),
      width: round(Math.max(2, Math.abs(size[0] || 12))),
      height: round(Math.max(1, Math.abs(size[1] || 10))),
    },
    style: brushStyle(params),
  }
}

/** 热力格：一个小方块，颜色由 visualMap 决定。 */
function renderHeatmap(params: CustomRenderItemParams, api: CustomApi): CustomElement {
  const point = api.coord([params.dataIndex, api.value(1)])
  const size = api.size ? api.size([1, 1]) : [16, 16]
  return {
    type: 'rect',
    shape: {
      x: round(point[0] - (size[0] || 16) / 2),
      y: round(point[1] - (size[1] || 16) / 2),
      width: round(Math.max(1, size[0] || 16)),
      height: round(Math.max(1, size[1] || 16)),
    },
    style: brushStyle(params),
  }
}

/** 扇形：按数值占比画一个圆环片段。 */
function renderPie(params: CustomRenderItemParams, api: CustomApi): CustomElement {
  const value = api.value(1)
  const center = api.coord([0, 0])
  const start = api.value(2) || 0
  return {
    type: 'arc',
    shape: {
      cx: round(center[0]),
      cy: round(center[1]),
      r: 60,
      startAngle: round((start * Math.PI) / 180),
      endAngle: round(((start + Math.max(1, value)) * Math.PI) / 180),
    },
    style: brushStyle(params),
  }
}

/** 预设表：id → renderItem。 */
export const CUSTOM_RENDER_ITEMS: Record<string, (params: CustomRenderItemParams, api: CustomApi) => CustomElement> = {
  'preset:scatter': renderScatter,
  'preset:bar': renderBar,
  'preset:heatmap': renderHeatmap,
  'preset:pie': renderPie,
}

/** 判断一个字符串是否是合法的 renderItem 预设名。 */
export function isCustomRenderItemId(value: unknown): value is CustomRenderItemId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CUSTOM_RENDER_ITEMS, value)
}
