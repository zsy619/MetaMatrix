/**
 * ECharts 运行时（按需引入 + 懒加载）。
 *
 * 只在这里 import echarts：extensions/echartsBlock.ts 动态 import 本文件，
 * 文档里没有图表块时不会下载 echarts。
 *
 * ECharts 6 说明：
 * - 5.6.0 → 6.1.0 是大版本升级，本文件按 6.x 的模块化入口重写；
 *   `echarts/core` + `echarts/charts` + `echarts/components` + `echarts/features`
 *   的用法在 6.x 保持不变，`echarts.use([...])` 的注册语义也一致。
 * - 6.0 新增的矩阵坐标系（MatrixComponent / matrix 坐标系）与和弦图（ChordChart）
 *   在这里一并注册。
 * - 3D / GL 系列不在这里注册：echarts-gl 体积大且依赖 WebGL，
 *   见 utils/echartsGlRuntime.ts（仅在插入 / 渲染 GL 图时才动态加载）。
 *
 * 体积：本文件整包 gzip 约 300KB（见 docs/rte-echarts-coverage.md 的实测值），
 * 仍然只在「文档里存在图表块」时按需下载，不进主包。
 */
import * as echarts from 'echarts/core'
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  ChordChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
} from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  CalendarComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  MatrixComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  VisualMapContinuousComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import { registerDemoMap } from './echarts/demoMap'

echarts.use([
  // —— 图表类型（官方示例 39 类里除 3D/GL 外的全部）——
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  EffectScatterChart,
  CandlestickChart,
  BoxplotChart,
  HeatmapChart,
  GraphChart,
  LinesChart,
  TreeChart,
  TreemapChart,
  SunburstChart,
  ParallelChart,
  SankeyChart,
  FunnelChart,
  GaugeChart,
  PictorialBarChart,
  ThemeRiverChart,
  CustomChart,
  MapChart,
  ChordChart,
  // —— 组件 ——
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  RadarComponent,
  AriaComponent,
  AxisPointerComponent,
  CalendarComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  MatrixComponent,
  ParallelComponent,
  PolarComponent,
  SingleAxisComponent,
  ToolboxComponent,
  TransformComponent,
  VisualMapComponent,
  VisualMapContinuousComponent,
  VisualMapPiecewiseComponent,
  // —— 特性 ——
  LabelLayout,
  UniversalTransition,
  // —— 渲染器 ——
  SVGRenderer,
  // Canvas 渲染器给 3D/GL 与大数据量图表用（GL 必须 Canvas）
  CanvasRenderer,
])

// 地图：内置一份极小的示例 GeoJSON（见 utils/echarts/demoMap.ts 的取舍说明）
registerDemoMap(echarts)

export { echarts }
/** ECharts 6 的实例类型（core 里导出的是 interface，不是 class，不能用 InstanceType）。 */
export type EChartsInstance = import('echarts/core').EChartsType
export default echarts
