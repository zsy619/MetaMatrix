/** 富文本（官方类别 rich）：label.rich 多样式文本。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const richTemplates: EchartsTemplateDef[] = [
  def({
    id: 'rich-label',
    categoryId: 'rich',
    label: '富文本标签',
    hint: 'label.rich 多段样式',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '富文本标签', left: 'center' },
          tooltip: { trigger: 'axis' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] },
          yAxis: { type: 'value' },
          series: [
            {
              name: '销售额',
              type: 'bar',
              data: [120, 200, 150, 80],
              label: {
                show: true,
                position: 'top',
                formatter: '{total|总额}{unit| 元}\n{growth|同比 +12%}',
                rich: {
                  total: { fontSize: 14, fontWeight: 'bold', color: '#2b3a4a', padding: [0, 0, 0, 4] },
                  unit: { fontSize: 11, color: '#6b7a8d' },
                  growth: { fontSize: 11, color: '#3f9c6d', backgroundColor: '#eaf6ef', padding: [2, 4], borderRadius: 2 },
                },
              },
            },
          ],
        },
        opts?.title,
        '富文本标签',
      ),
  }),
  def({
    id: 'rich-axis',
    categoryId: 'rich',
    label: '富文本坐标轴',
    hint: 'axisLabel.rich',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        {
          title: { text: '富文本坐标轴', left: 'center' },
          tooltip: { trigger: 'axis' },
          grid: { left: 64, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: {
            type: 'category',
            data: ['一月', '二月', '三月', '四月'],
            axisLabel: {
              formatter: '{m|{value}}',
              rich: {
                m: { fontSize: 11, color: '#4a7fb5', backgroundColor: '#eef4fb', padding: [3, 6], borderRadius: 3 },
              },
            },
          },
          yAxis: { type: 'value' },
          series: [
            { name: '趋势', type: 'line', smooth: true, data: [120, 200, 150, 80] },
          ],
        },
        opts?.title,
        '富文本坐标轴',
      ),
  }),
]
