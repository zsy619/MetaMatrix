/** 象形柱图（官方类别 pictorialBar）：图标柱 / 堆叠象形。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const pictorialBarTemplates: EchartsTemplateDef[] = [
  def({
    id: 'pictorialBar-basic',
    categoryId: 'pictorialBar',
    label: '基础象形柱图',
    hint: '图标代替柱体',
    chartType: 'pictorialBar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '任务完成度', left: 'center' },
          tooltip: { trigger: 'axis' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['设计', '开发', '测试', '发布'] },
          yAxis: { type: 'value', max: 10 },
          series: [
            {
              name: '完成',
              type: 'pictorialBar',
              symbol: 'roundRect',
              symbolSize: [14, 14],
              symbolRotate: 0,
              symbolPosition: 'end',
              data: [8, 6, 9, 4],
            },
          ],
        },
        opts?.title,
        '任务完成度',
      ),
  }),
  def({
    id: 'pictorialBar-stack',
    categoryId: 'pictorialBar',
    label: '堆叠象形柱图',
    hint: '两段式图标',
    chartType: 'pictorialBar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '完成 / 剩余', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['设计', '开发', '测试', '发布'] },
          yAxis: { type: 'value', max: 10 },
          series: [
            {
              name: '已完成',
              type: 'pictorialBar',
              stack: 'total',
              symbol: 'roundRect',
              symbolSize: [14, 14],
              symbolPosition: 'end',
              data: [8, 6, 9, 4],
            },
            {
              name: '剩余',
              type: 'pictorialBar',
              stack: 'total',
              symbol: 'roundRect',
              symbolSize: [14, 14],
              symbolPosition: 'end',
              itemStyle: { color: '#cfd8e3' },
              data: [2, 4, 1, 6],
            },
          ],
        },
        opts?.title,
        '完成 / 剩余',
      ),
  }),
]
