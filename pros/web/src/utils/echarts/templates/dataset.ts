/** 数据集（官方类别 dataset）：dataset 组件 + transform。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const datasetTemplates: EchartsTemplateDef[] = [
  def({
    id: 'dataset-basic',
    categoryId: 'dataset',
    label: '基础数据集',
    hint: '多系列共用一份数据',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '数据集示例', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category' },
          yAxis: { type: 'value' },
          dataset: {
            source: [
              ['月份', '本年', '去年'],
              ['1月', 120, 100],
              ['2月', 200, 160],
              ['3月', 150, 140],
              ['4月', 80, 90],
            ],
          },
          series: [
            { name: '本年', type: 'bar', datasetIndex: 0, encode: { x: '月份', y: '本年' } },
            { name: '去年', type: 'bar', datasetIndex: 0, encode: { x: '月份', y: '去年' } },
          ],
        },
        opts?.title,
        '数据集示例',
      ),
  }),
  def({
    id: 'dataset-transform',
    categoryId: 'dataset',
    label: '数据集 + 转换',
    hint: 'transformations 做过滤',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '数据集转换', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category' },
          yAxis: { type: 'value' },
          dataset: {
            source: [
              ['月份', '销售额', '是否达标'],
              ['1月', 120, '达标'],
              ['2月', 200, '未达标'],
              ['3月', 150, '达标'],
              ['4月', 80, '未达标'],
            ],
            transformations: [
              { type: 'filter', options: { dimension: '是否达标', value: '达标' } },
            ],
          },
          series: [
            {
              name: '销售额',
              type: 'bar',
              datasetIndex: 0,
              encode: { x: '月份', y: '销售额' },
            },
          ],
        },
        opts?.title,
        '数据集转换',
      ),
  }),
]
