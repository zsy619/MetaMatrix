/**
 * 模板生成时的公共小工具：示例数据、常见 option 骨架。
 *
 * 这里只产出纯 JSON（不含函数），保证模板能直接过净化器。
 */
import type { EchartsTemplateDef } from '../types'

/** 12 个月标签。 */
export const MONTHS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]

/** 季度标签。 */
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

/** 一条数值系列。 */
export type SeriesSeed = { name: string; data: number[] }

/** 标准笛卡尔网格 + 分类轴 + 数值轴。 */
export function cartesianAxes(
  labels: readonly string[],
  opts: { yName?: string; xName?: string } = {},
): Record<string, unknown> {
  return {
    xAxis: { type: 'category', data: [...labels], axisTick: { alignWithLabel: true } },
    yAxis: { type: 'value', name: opts.yName || '数值' },
  }
}

/** 标准笛卡尔 option（标题 + tooltip + legend + grid + 轴 + 系列）。 */
export function cartesianOption(
  title: string,
  labels: readonly string[],
  series: readonly SeriesSeed[],
  opts: {
    type?: 'bar' | 'line'
    yName?: string
    smooth?: boolean
    area?: boolean
    stack?: string
    step?: boolean
    horizontal?: boolean
  } = {},
): Record<string, unknown> {
  const type = opts.type || 'bar'
  const category = { type: 'category', data: [...labels], axisTick: { alignWithLabel: true } }
  const value = { type: 'value', name: opts.yName || '数值' }
  const base: Record<string, unknown> = {
    title: { text: title, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: series.map((item) => item.name), bottom: 0 },
    grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
  }
  if (opts.horizontal) {
    base.xAxis = value
    base.yAxis = category
  } else {
    base.xAxis = category
    base.yAxis = value
  }
  base.series = series.map((item) => {
    const node: Record<string, unknown> = {
      name: item.name,
      type,
      data: [...item.data],
    }
    if (opts.stack) node.stack = opts.stack
    if (type === 'line') {
      if (opts.smooth) node.smooth = true
      if (opts.step) node.step = true
      if (opts.area) node.areaStyle = { opacity: 0.15 }
    }
    return node
  })
  return base
}

/** 生成一个模板定义（省掉重复字段）。 */
export function def(
  input: Omit<EchartsTemplateDef, 'renderer' | 'gl'> & {
    renderer?: EchartsTemplateDef['renderer']
    gl?: boolean
  },
): EchartsTemplateDef {
  return {
    renderer: input.renderer || 'svg',
    gl: input.gl || false,
    ...input,
  }
}

/** 依据标题生成 option（标题为空时用模板自带标题）。 */
export function withTitle(
  option: Record<string, unknown>,
  title: string | undefined,
  fallback: string,
): Record<string, unknown> {
  const next = { ...option }
  if (title && title.trim()) {
    next.title = { text: title.trim(), left: 'center' }
  } else if (!next.title) {
    next.title = { text: fallback, left: 'center' }
  }
  return next
}
