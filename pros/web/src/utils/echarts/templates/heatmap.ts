/** 热力图（官方类别 heatmap）：基础 / 渐变 visualMap / 棋盘格。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const HOURS = ['0时', '2时', '4时', '6时', '8时', '10时', '12时', '14时', '16时', '18时', '20时', '22时']
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const GRID: number[][] = [
  [22, 18, 30, 45, 60, 78, 66, 70, 58, 42, 30, 26],
  [18, 16, 26, 40, 55, 74, 62, 68, 54, 40, 28, 24],
  [25, 22, 32, 48, 63, 82, 70, 74, 60, 45, 33, 28],
  [30, 26, 38, 52, 68, 88, 76, 80, 66, 50, 36, 30],
  [35, 30, 44, 60, 78, 96, 88, 92, 74, 58, 42, 34],
  [48, 52, 58, 66, 72, 80, 86, 88, 78, 66, 56, 50],
  [40, 38, 44, 52, 60, 68, 74, 76, 66, 56, 48, 44],
]

/** [xIndex, yIndex, value] */
function toHeatData(grid: number[][]): number[][] {
  const out: number[][] = []
  grid.forEach((row, y) => {
    row.forEach((value, x) => out.push([x, y, value]))
  })
  return out
}

export const heatmapTemplates: EchartsTemplateDef[] = [
  def({
    id: 'heatmap-basic',
    categoryId: 'heatmap',
    label: '基础热力图',
    hint: '二维密度分布',
    chartType: 'heatmap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '时段热度', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: HOURS, splitArea: { show: true } },
          yAxis: { type: 'category', data: DAYS, splitArea: { show: true } },
          visualMap: {
            min: 0,
            max: 100,
            show: false,
            inRange: { color: ['#e8f1fb', '#9dc9e8', '#3f7fbf', '#12395f'] },
          },
          series: [
            {
              name: '热度',
              type: 'heatmap',
              data: toHeatData(GRID),
              label: { show: true },
              itemStyle: { borderWidth: 1, borderColor: '#fff' },
            },
          ],
        },
        opts?.title,
        '时段热度',
      ),
  }),
  def({
    id: 'heatmap-visualmap',
    categoryId: 'heatmap',
    label: '渐变色带热力图',
    hint: 'visualMap 连续色带',
    chartType: 'heatmap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '带色带的热力图', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: HOURS, splitArea: { show: true } },
          yAxis: { type: 'category', data: DAYS, splitArea: { show: true } },
          visualMap: {
            min: 0,
            max: 100,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            inRange: { color: ['#e8f1fb', '#9dc9e8', '#3f7fbf', '#12395f'] },
          },
          series: [
            {
              name: '热度',
              type: 'heatmap',
              data: toHeatData(GRID),
              label: { show: true },
              emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.4)' } },
            },
          ],
        },
        opts?.title,
        '带色带的热力图',
      ),
  }),
  def({
    id: 'heatmap-scatter',
    categoryId: 'heatmap',
    label: '点状热力图',
    hint: '大圆点 + 模糊',
    chartType: 'heatmap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '点状热力图', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: HOURS, splitArea: { show: true } },
          yAxis: { type: 'category', data: DAYS, splitArea: { show: true } },
          visualMap: {
            min: 0,
            max: 100,
            show: false,
            inRange: { color: ['#e8f1fb', '#9dc9e8', '#3f7fbf', '#12395f'] },
          },
          series: [
            {
              name: '热度',
              type: 'heatmap',
              data: toHeatData(GRID),
              pointSize: 14,
              blurSize: 20,
              minOpacity: 0.2,
              maxOpacity: 0.9,
            },
          ],
        },
        opts?.title,
        '点状热力图',
      ),
  }),
]
