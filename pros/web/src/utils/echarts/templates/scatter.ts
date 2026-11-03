/** 散点图（官方类别 scatter）：基础 / 气泡 / 涟漪 / 散点矩阵。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const POINTS = [
  [10, 8], [18, 15], [26, 22], [35, 28], [42, 36], [50, 41], [58, 49],
]

export const scatterTemplates: EchartsTemplateDef[] = [
  def({
    id: 'scatter-basic',
    categoryId: 'scatter',
    label: '基础散点图',
    hint: '相关性分析',
    chartType: 'scatter',
    build: (opts) =>
      withTitle(
        {
          title: { text: '相关性分析', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'value', name: 'X' },
          yAxis: { type: 'value', name: 'Y' },
          series: [{ name: '样本', type: 'scatter', symbolSize: 12, data: POINTS }],
        },
        opts?.title,
        '相关性分析',
      ),
  }),
  def({
    id: 'scatter-bubble',
    categoryId: 'scatter',
    label: '气泡图',
    hint: '第三维用大小表示',
    chartType: 'scatter',
    build: (opts) =>
      withTitle(
        {
          title: { text: '气泡图', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'value', name: 'X' },
          yAxis: { type: 'value', name: 'Y' },
          series: [
            {
              // 气泡大小写在数据项上（symbolSize 回调是函数，JSON 存不下）
              name: '样本',
              type: 'scatter',
              symbolSize: 18,
              data: POINTS.map((point, index) => ({
                name: `样本${index + 1}`,
                value: [point[0], point[1], 10 + index * 4],
                symbolSize: Math.max(8, Math.min(40, 10 + index * 4)),
              })),
            },
          ],
        },
        opts?.title,
        '气泡图',
      ),
  }),
  def({
    id: 'scatter-ripple',
    categoryId: 'scatter',
    label: '涟漪散点图',
    hint: 'effectScatter 波动效果',
    chartType: 'effectScatter',
    build: (opts) =>
      withTitle(
        {
          title: { text: '涟漪散点图', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'value', name: 'X' },
          yAxis: { type: 'value', name: 'Y' },
          series: [
            {
              name: '涟漪',
              type: 'effectScatter',
              symbolSize: 14,
              rippleEffect: { scale: 3, brushType: 'stroke' },
              data: POINTS,
            },
          ],
        },
        opts?.title,
        '涟漪散点图',
      ),
  }),
  def({
    id: 'scatter-label',
    categoryId: 'scatter',
    label: '带标签散点图',
    hint: '每个点显示名称',
    chartType: 'scatter',
    build: (opts) =>
      withTitle(
        {
          title: { text: '带标签散点图', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'value', name: 'X' },
          yAxis: { type: 'value', name: 'Y' },
          series: [
            {
              name: '样本',
              type: 'scatter',
              symbolSize: 14,
              label: { show: true, position: 'top', formatter: '{b}' },
              data: POINTS.map((point, index) => ({
                name: `样本${index + 1}`,
                value: [point[0], point[1]],
              })),
            },
          ],
        },
        opts?.title,
        '带标签散点图',
      ),
  }),
]
