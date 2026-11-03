/**
 * 官方示例 39 个类别的模板目录。
 *
 * 每个类别一个文件（禁止单个巨文件），这里只负责汇总：
 * - 工具栏「图表」分组下拉、斜杠命令、「一键生成」对话框都读这一份目录；
 * - 净化器按目录里的 series 类型放行白名单；
 * - 测试逐个模板跑「净化通过 + setOption 不报错」。
 */
import type { EchartsCategory, EchartsTemplateDef } from '../types'
import { lineTemplates } from './line'
import { barTemplates } from './bar'
import { pieTemplates } from './pie'
import { scatterTemplates } from './scatter'
import { radarTemplates } from './radar'
import { mapTemplates } from './map'
import { candlestickTemplates } from './candlestick'
import { boxplotTemplates } from './boxplot'
import { heatmapTemplates } from './heatmap'
import { graphTemplates } from './graph'
import { linesTemplates } from './lines'
import { treeTemplates } from './tree'
import { treemapTemplates } from './treemap'
import { sunburstTemplates } from './sunburst'
import { parallelTemplates } from './parallel'
import { sankeyTemplates } from './sankey'
import { funnelTemplates } from './funnel'
import { gaugeTemplates } from './gauge'
import { pictorialBarTemplates } from './pictorialBar'
import { themeRiverTemplates } from './themeRiver'
import { calendarTemplates } from './calendar'
import { customTemplates } from './custom'
import { datasetTemplates } from './dataset'
import { dataZoomTemplates } from './dataZoom'
import { graphicTemplates } from './graphic'
import { richTemplates } from './rich'
import { matrixTemplates } from './matrix'
import { chordTemplates } from './chord'
import { glTemplates } from './gl'

type CategorySeed = Omit<EchartsCategory, 'section'>

function category(seed: CategorySeed): EchartsCategory {
  return { section: 'standard', ...seed }
}

function glCategory(seed: CategorySeed): EchartsCategory {
  return { section: 'gl', ...seed }
}

/** 官方示例类别目录（顺序即工具栏里的展示顺序；共 39 类）。 */
export const ECHARTS_CATEGORIES: readonly EchartsCategory[] = [
  // —— 常规图表（1–28）——
  category({ id: 'line', label: '折线图', hint: '趋势变化', templates: lineTemplates }),
  category({ id: 'bar', label: '柱状图', hint: '分类对比', templates: barTemplates }),
  category({ id: 'pie', label: '饼图', hint: '占比构成', templates: pieTemplates }),
  category({ id: 'scatter', label: '散点图', hint: '相关性', templates: scatterTemplates }),
  category({ id: 'radar', label: '雷达图', hint: '多维评分', templates: radarTemplates }),
  category({ id: 'map', label: '地理坐标/地图', hint: '区域分布', templates: mapTemplates }),
  category({ id: 'candlestick', label: 'K 线图', hint: '金融行情', templates: candlestickTemplates }),
  category({ id: 'boxplot', label: '盒须图', hint: '分布统计', templates: boxplotTemplates }),
  category({ id: 'heatmap', label: '热力图', hint: '二维密度', templates: heatmapTemplates }),
  category({ id: 'graph', label: '关系图', hint: '节点连线', templates: graphTemplates }),
  category({ id: 'lines', label: '路径图', hint: '轨迹流动', templates: linesTemplates }),
  category({ id: 'tree', label: '树图', hint: '层级结构', templates: treeTemplates }),
  category({ id: 'treemap', label: '矩形树图', hint: '面积占比', templates: treemapTemplates }),
  category({ id: 'sunburst', label: '旭日图', hint: '多层占比', templates: sunburstTemplates }),
  category({ id: 'parallel', label: '平行坐标系', hint: '多维指标', templates: parallelTemplates }),
  category({ id: 'sankey', label: '桑基图', hint: '流量流向', templates: sankeyTemplates }),
  category({ id: 'funnel', label: '漏斗图', hint: '转化收窄', templates: funnelTemplates }),
  category({ id: 'gauge', label: '仪表盘', hint: '单指标刻度', templates: gaugeTemplates }),
  category({ id: 'pictorialBar', label: '象形柱图', hint: '图标柱状', templates: pictorialBarTemplates }),
  category({ id: 'themeRiver', label: '主题河流图', hint: '时间轴占比', templates: themeRiverTemplates }),
  category({ id: 'calendar', label: '日历坐标系', hint: '按天展示', templates: calendarTemplates }),
  category({ id: 'custom', label: '自定义系列', hint: '内置 renderItem 预设', templates: customTemplates }),
  category({ id: 'dataset', label: '数据集', hint: '多系列共用数据', templates: datasetTemplates }),
  category({ id: 'dataZoom', label: '数据区域缩放', hint: '框选与滑块', templates: dataZoomTemplates }),
  category({ id: 'graphic', label: '图形组件', hint: '叠加文字形状', templates: graphicTemplates }),
  category({ id: 'rich', label: '富文本', hint: 'label.rich 多样式', templates: richTemplates }),
  category({ id: 'matrix', label: '矩阵坐标系', hint: 'ECharts 6 新增', templates: matrixTemplates }),
  category({ id: 'chord', label: '和弦图', hint: 'ECharts 6 新增', templates: chordTemplates }),
  // —— 3D / GL（29–39）——
  glCategory({ id: 'globe', label: '3D 地球', hint: 'WebGL 地球', templates: glTemplates.filter((item) => item.categoryId === 'globe') }),
  glCategory({ id: 'bar3D', label: '3D 柱状图', hint: 'grid3D 坐标系', templates: glTemplates.filter((item) => item.categoryId === 'bar3D') }),
  glCategory({ id: 'scatter3D', label: '3D 散点图', hint: 'grid3D 坐标系', templates: glTemplates.filter((item) => item.categoryId === 'scatter3D') }),
  glCategory({ id: 'surface', label: '3D 曲面', hint: 'grid3D 曲面', templates: glTemplates.filter((item) => item.categoryId === 'surface') }),
  glCategory({ id: 'map3D', label: '3D 地图', hint: 'geo3D 坐标系', templates: glTemplates.filter((item) => item.categoryId === 'map3D') }),
  glCategory({ id: 'lines3D', label: '3D 路径图', hint: 'globe 航线', templates: glTemplates.filter((item) => item.categoryId === 'lines3D') }),
  glCategory({ id: 'line3D', label: '3D 折线图', hint: 'grid3D 折线', templates: glTemplates.filter((item) => item.categoryId === 'line3D') }),
  glCategory({ id: 'scatterGL', label: 'GL 散点图', hint: 'GPU 散点', templates: glTemplates.filter((item) => item.categoryId === 'scatterGL') }),
  glCategory({ id: 'linesGL', label: 'GL 路径图', hint: 'GPU 路径', templates: glTemplates.filter((item) => item.categoryId === 'linesGL') }),
  glCategory({ id: 'flowGL', label: 'GL 矢量场图', hint: 'GPU 粒子流', templates: glTemplates.filter((item) => item.categoryId === 'flowGL') }),
  glCategory({ id: 'graphGL', label: 'GL 关系图', hint: 'GPU 力导向', templates: glTemplates.filter((item) => item.categoryId === 'graphGL') }),
]

/** 所有模板（扁平列表）。 */
export const ECHARTS_TEMPLATES: readonly EchartsTemplateDef[] = ECHARTS_CATEGORIES.flatMap(
  (item) => item.templates,
)

/** 按 id 找模板。 */
export function findEchartsTemplate(id: string): EchartsTemplateDef | null {
  return ECHARTS_TEMPLATES.find((item) => item.id === id) || null
}

/** 按 id 找类别。 */
export function findEchartsCategory(id: string): EchartsCategory | null {
  return ECHARTS_CATEGORIES.find((item) => item.id === id) || null
}
