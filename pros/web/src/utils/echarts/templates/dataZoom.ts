/** 数据区域缩放（官方类别 dataZoom）：inside + slider。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const ZOOM_DATA = Array.from({ length: 30 }, (_, index) => [
  `${index + 1}月`,
  Math.round(120 + Math.sin(index / 3) * 60 + index * 4),
  Math.round(80 + Math.cos(index / 4) * 40 + index * 2),
])

export const dataZoomTemplates: EchartsTemplateDef[] = [
  def({
    id: 'dataZoom-inside',
    categoryId: 'dataZoom',
    label: '框内缩放',
    hint: 'dataZoom inside',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        {
          title: { text: '可滚轮缩放的趋势', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ZOOM_DATA.map((item) => item[0]) },
          yAxis: { type: 'value' },
          dataZoom: [{ type: 'inside', start: 0, end: 40 }],
          series: [
            { name: '本年', type: 'line', data: ZOOM_DATA.map((item) => item[1]) },
            { name: '去年', type: 'line', data: ZOOM_DATA.map((item) => item[2]) },
          ],
        },
        opts?.title,
        '可滚轮缩放的趋势',
      ),
  }),
  def({
    id: 'dataZoom-slider',
    categoryId: 'dataZoom',
    label: '滑块缩放',
    hint: 'dataZoom slider',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        {
          title: { text: '滑块缩放趋势', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 72, containLabel: true },
          xAxis: { type: 'category', data: ZOOM_DATA.map((item) => item[0]) },
          yAxis: { type: 'value' },
          dataZoom: [
            { type: 'slider', start: 0, end: 40, bottom: 16, height: 24 },
            { type: 'inside', start: 0, end: 40 },
          ],
          series: [
            { name: '本年', type: 'line', data: ZOOM_DATA.map((item) => item[1]) },
            { name: '去年', type: 'line', data: ZOOM_DATA.map((item) => item[2]) },
          ],
        },
        opts?.title,
        '滑块缩放趋势',
      ),
  }),
]
