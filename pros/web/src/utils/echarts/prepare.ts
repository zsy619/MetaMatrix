/**
 * 渲染前的 option 预处理：
 * - 把 custom 系列的 renderItem 预设名换成内置函数（文档里永远只存字符串）；
 * - 判断该图要不要 Canvas 渲染器（3D / GL 只能用 Canvas）。
 */
import { CUSTOM_RENDER_ITEMS } from './customRenderItems'

/** 需要 echarts-gl（3D / GL）的 series 类型。 */
export const GL_SERIES_TYPES: readonly string[] = [
  'bar3D',
  'scatter3D',
  'line3D',
  'lines3D',
  'surface',
  'map3D',
  'scatterGL',
  'linesGL',
  'flowGL',
  'graphGL',
]

/** option 里是否含有 3D / GL 系列。 */
export function needsEchartsGl(option: Record<string, unknown>): boolean {
  const series = option.series
  if (!Array.isArray(series)) return false
  return series.some((item) => {
    if (!item || typeof item !== 'object') return false
    const type = (item as Record<string, unknown>).type
    return typeof type === 'string' && GL_SERIES_TYPES.includes(type)
  })
}

/** 该图应该用哪个渲染器。 */
export function echartsRendererFor(option: Record<string, unknown>): 'svg' | 'canvas' {
  if (needsEchartsGl(option)) return 'canvas'
  // SVG 渲染器不支持带拖尾的流动路径（lines/flowGL 的 effect）
  const series = option.series
  if (Array.isArray(series)) {
    const hasTrail = series.some((item) => {
      if (!item || typeof item !== 'object') return false
      const node = item as Record<string, unknown>
      const effect = node.effect
      if (!effect || typeof effect !== 'object') return false
      return (effect as Record<string, unknown>).show === true
    })
    if (hasTrail) return 'canvas'
  }
  return 'svg'
}

/**
 * 把 renderItem 预设名换成内置函数。返回新的 option（不改原对象）。
 */
export function resolveEchartsRenderItems(
  option: Record<string, unknown>,
): Record<string, unknown> {
  const series = option.series
  if (!Array.isArray(series)) return option
  let changed = false
  const nextSeries = series.map((item) => {
    if (!item || typeof item !== 'object') return item
    const node = item as Record<string, unknown>
    const preset = node.renderItem
    if (typeof preset !== 'string') return item
    const fn = CUSTOM_RENDER_ITEMS[preset]
    if (!fn) return item
    changed = true
    return { ...node, renderItem: fn }
  })
  if (!changed) return option
  return { ...option, series: nextSeries }
}
