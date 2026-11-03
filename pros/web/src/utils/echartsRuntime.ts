/**
 * ECharts 运行时（按需引入 + 懒加载）。
 *
 * 只在这里 import echarts：extensions/echartsBlock.ts 动态 import 本文件，
 * 文档里没有图表块时不会下载 echarts。
 *
 * 体积实测（esbuild 5.6.0，见报告附录）：本文件整包 gzip ≈ 191KB，
 * 低于「单 chunk gzip ≤ 200KB」的门槛；全量 echarts 为 ≈ 347KB，不采用。
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  RadarComponent,
  SVGRenderer,
])

export { echarts }
/** ECharts 5.x 的实例类型（core 里导出的是 interface，不是 class，不能用 InstanceType）。 */
export type EChartsInstance = import('echarts/core').EChartsType
export default echarts
