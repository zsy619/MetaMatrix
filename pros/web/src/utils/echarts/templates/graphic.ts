/** 图形组件（官方类别 graphic）：文字 / 图形装饰。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const graphicTemplates: EchartsTemplateDef[] = [
  def({
    id: 'graphic-text',
    categoryId: 'graphic',
    label: '图形组件：文字',
    hint: '在图上叠加文字',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '带标注的柱状图', left: 'center' },
          tooltip: { trigger: 'axis' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月'] },
          yAxis: { type: 'value' },
          graphic: [
            {
              type: 'text',
              left: 'center',
              top: 60,
              style: { text: '季度冲刺中', fill: '#e05a4f', fontSize: 16, fontWeight: 'bold' },
            },
          ],
          series: [
            { name: '销售额', type: 'bar', data: [120, 200, 150, 80] },
          ],
        },
        opts?.title,
        '带标注的柱状图',
      ),
  }),
  def({
    id: 'graphic-shape',
    categoryId: 'graphic',
    label: '图形组件：形状',
    hint: '矩形 + 圆圈组合',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        {
          title: { text: '带形状标注的趋势', left: 'center' },
          tooltip: { trigger: 'axis' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月'] },
          yAxis: { type: 'value' },
          graphic: [
            {
              type: 'rect',
              shape: { width: 90, height: 28, r: 6 },
              left: 'center',
              top: 44,
              style: { fill: 'rgba(74,127,181,0.12)', stroke: '#4a7fb5', lineWidth: 1 },
            },
            {
              type: 'text',
              left: 'center',
              top: 52,
              style: { text: '目标区间', fill: '#4a7fb5', fontSize: 13, align: 'center' },
            },
            {
              type: 'circle',
              shape: { r: 24 },
              right: 60,
              bottom: 60,
              style: { fill: 'rgba(224,90,79,0.15)', stroke: '#e05a4f', lineWidth: 1 },
            },
          ],
          series: [
            { name: '趋势', type: 'line', smooth: true, data: [120, 200, 150, 180, 260, 300] },
          ],
        },
        opts?.title,
        '带形状标注的趋势',
      ),
  }),
]
