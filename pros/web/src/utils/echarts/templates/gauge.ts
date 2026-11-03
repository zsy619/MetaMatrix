/** 仪表盘（官方类别 gauge）：基础 / 多仪表 / 进度条形。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const gaugeTemplates: EchartsTemplateDef[] = [
  def({
    id: 'gauge-basic',
    categoryId: 'gauge',
    label: '基础仪表盘',
    hint: '单指标刻度盘',
    chartType: 'gauge',
    build: (opts) =>
      withTitle(
        {
          title: { text: '完成率', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '完成率',
              type: 'gauge',
              min: 0,
              max: 100,
              progress: { show: true, width: 12 },
              axisLine: { lineStyle: { width: 12 } },
              axisTick: { show: false },
              splitLine: { length: 12, lineStyle: { width: 2, color: '#999' } },
              axisLabel: { distance: 14 },
              detail: { valueAnimation: false, formatter: '{value}%', fontSize: 20, offsetCenter: [0, '70%'] },
              data: [{ value: 68, name: '季度目标' }],
            },
          ],
        },
        opts?.title,
        '完成率',
      ),
  }),
  def({
    id: 'gauge-multi',
    categoryId: 'gauge',
    label: '多仪表盘',
    hint: '同屏多个指标',
    chartType: 'gauge',
    build: (opts) =>
      withTitle(
        {
          title: { text: '服务指标', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '可用性',
              type: 'gauge',
              center: ['25%', '58%'],
              min: 0,
              max: 100,
              progress: { show: true, width: 10 },
              axisLine: { lineStyle: { width: 10 } },
              detail: { valueAnimation: false, formatter: '{value}%', offsetCenter: [0, '60%'] },
              data: [{ value: 99, name: '可用性' }],
            },
            {
              name: '满意度',
              type: 'gauge',
              center: ['75%', '58%'],
              min: 0,
              max: 100,
              progress: { show: true, width: 10 },
              axisLine: { lineStyle: { width: 10 } },
              detail: { valueAnimation: false, formatter: '{value}%', offsetCenter: [0, '60%'] },
              data: [{ value: 86, name: '满意度' }],
            },
          ],
        },
        opts?.title,
        '服务指标',
      ),
  }),
]
