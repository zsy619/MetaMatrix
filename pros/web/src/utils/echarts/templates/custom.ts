/**
 * 自定义系列（官方类别 custom）。
 *
 * renderItem 在文档里只存「内置预设名」（如 'preset:scatter'），
 * 渲染前由 utils/echarts/prepare.ts 换成真正的函数：
 * 用户无法在 JSON 里塞任意函数。
 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const customTemplates: EchartsTemplateDef[] = [
  def({
    id: 'custom-scatter',
    categoryId: 'custom',
    label: '自定义散点',
    hint: 'renderItem: preset:scatter',
    chartType: 'custom',
    build: (opts) =>
      withTitle(
        {
          title: { text: '自定义散点', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'] },
          yAxis: { type: 'value' },
          series: [
            {
              name: '自定义散点',
              type: 'custom',
              renderItem: 'preset:scatter',
              data: [
                [0, 12, 16],
                [1, 22, 12],
                [2, 18, 20],
                [3, 32, 14],
              ],
            },
          ],
        },
        opts?.title,
        '自定义散点',
      ),
  }),
  def({
    id: 'custom-bar',
    categoryId: 'custom',
    label: '自定义柱状',
    hint: 'renderItem: preset:bar',
    chartType: 'custom',
    build: (opts) =>
      withTitle(
        {
          title: { text: '自定义柱状', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'] },
          yAxis: { type: 'value' },
          series: [
            {
              name: '自定义柱状',
              type: 'custom',
              renderItem: 'preset:bar',
              data: [
                [0, 12],
                [1, 22],
                [2, 18],
                [3, 32],
              ],
            },
          ],
        },
        opts?.title,
        '自定义柱状',
      ),
  }),
  def({
    id: 'custom-heatmap',
    categoryId: 'custom',
    label: '自定义热力格',
    hint: 'renderItem: preset:heatmap',
    chartType: 'custom',
    build: (opts) =>
      withTitle(
        {
          title: { text: '自定义热力格', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'category', data: ['一', '二', '三'] },
          yAxis: { type: 'category', data: ['甲', '乙'] },
          series: [
            {
              name: '自定义热力格',
              type: 'custom',
              renderItem: 'preset:heatmap',
              data: [
                [0, 0, 12],
                [1, 0, 22],
                [2, 0, 8],
                [0, 1, 18],
                [1, 1, 26],
                [2, 1, 15],
              ],
            },
          ],
        },
        opts?.title,
        '自定义热力格',
      ),
  }),
]
