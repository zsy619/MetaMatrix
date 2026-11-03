/**
 * 属性面板 schema 目录。
 *
 * 每个图表类别一份文件（line.ts / pie.ts / …，共 39 类），
 * 这里只负责汇总与查询：
 * - 图表属性面板按 chartType 取对应 schema；
 * - 未知类型回落到通用 schema（通用 + 系列 + 样式）。
 */
import type { ChartPanelSchema } from './types'
import { plainSchema } from './common'
import { lineSchema } from './line'
import { barSchema } from './bar'
import { pieSchema } from './pie'
import { scatterSchema } from './scatter'
import { radarSchema } from './radar'
import { mapSchema } from './map'
import { candlestickSchema } from './candlestick'
import { boxplotSchema } from './boxplot'
import { heatmapSchema } from './heatmap'
import { graphSchema } from './graph'
import { linesSchema } from './lines'
import { treeSchema } from './tree'
import { treemapSchema } from './treemap'
import { sunburstSchema } from './sunburst'
import { parallelSchema } from './parallel'
import { sankeySchema } from './sankey'
import { funnelSchema } from './funnel'
import { gaugeSchema } from './gauge'
import { pictorialBarSchema } from './pictorialBar'
import { themeRiverSchema } from './themeRiver'
import { calendarSchema } from './calendar'
import { customSchema } from './custom'
import { datasetSchema } from './dataset'
import { dataZoomSchema } from './dataZoom'
import { graphicSchema } from './graphic'
import { richSchema } from './rich'
import { matrixSchema } from './matrix'
import { chordSchema } from './chord'
import { globeSchema } from './globe'
import { bar3DSchema } from './bar3D'
import { scatter3DSchema } from './scatter3D'
import { surfaceSchema } from './surface'
import { map3DSchema } from './map3D'
import { lines3DSchema } from './lines3D'
import { line3DSchema } from './line3D'
import { scatterGLSchema } from './scatterGL'
import { linesGLSchema } from './linesGL'
import { flowGLSchema } from './flowGL'
import { graphGLSchema } from './graphGL'

/** 全部 schema（键为图表类别 id）。 */
export const CHART_PANEL_SCHEMAS: Record<string, ChartPanelSchema> = {
  line: lineSchema,
  bar: barSchema,
  pie: pieSchema,
  scatter: scatterSchema,
  radar: radarSchema,
  map: mapSchema,
  candlestick: candlestickSchema,
  boxplot: boxplotSchema,
  heatmap: heatmapSchema,
  graph: graphSchema,
  lines: linesSchema,
  tree: treeSchema,
  treemap: treemapSchema,
  sunburst: sunburstSchema,
  parallel: parallelSchema,
  sankey: sankeySchema,
  funnel: funnelSchema,
  gauge: gaugeSchema,
  pictorialBar: pictorialBarSchema,
  themeRiver: themeRiverSchema,
  calendar: calendarSchema,
  custom: customSchema,
  dataset: datasetSchema,
  dataZoom: dataZoomSchema,
  graphic: graphicSchema,
  rich: richSchema,
  matrix: matrixSchema,
  chord: chordSchema,
  globe: globeSchema,
  bar3D: bar3DSchema,
  scatter3D: scatter3DSchema,
  surface: surfaceSchema,
  map3D: map3DSchema,
  lines3D: lines3DSchema,
  line3D: line3DSchema,
  scatterGL: scatterGLSchema,
  linesGL: linesGLSchema,
  flowGL: flowGLSchema,
  graphGL: graphGLSchema,
}

/** 未知图表类型用的兜底 schema。 */
export const FALLBACK_CHART_PANEL_SCHEMA: ChartPanelSchema = plainSchema('generic', '通用图表', {
  seriesTypes: ['bar', 'line', 'pie', 'scatter'],
})

/** 按图表类别 id 取 schema。 */
export function getChartPanelSchema(chartType: string | null | undefined): ChartPanelSchema {
  if (!chartType) return FALLBACK_CHART_PANEL_SCHEMA
  return CHART_PANEL_SCHEMAS[chartType] || FALLBACK_CHART_PANEL_SCHEMA
}

export type { ChartPanelSchema, PanelField, PanelFieldKind, PanelSection, PanelSectionId } from './types'
