/** 日历坐标系（官方类别 calendar）：日历热力 / 日历散点。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const RANGE = ['2026-01-01', '2026-01-31']

const CALENDAR_DATA = [
  [1, 12], [2, 18], [3, 25], [4, 9], [5, 30], [6, 22], [7, 15], [8, 28],
  [9, 19], [10, 6], [11, 24], [12, 33], [13, 17], [14, 27], [15, 11],
  [16, 21], [17, 29], [18, 14], [19, 26], [20, 8], [21, 23], [22, 31],
  [23, 16], [24, 20], [25, 28], [26, 13], [27, 5], [28, 18], [29, 24],
  [30, 10], [31, 22],
]

export const calendarTemplates: EchartsTemplateDef[] = [
  def({
    id: 'calendar-heatmap',
    categoryId: 'calendar',
    label: '日历热力图',
    hint: '按天展示活跃度',
    chartType: 'heatmap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '年度活跃日历', left: 'center' },
          tooltip: { trigger: 'item' },
          visualMap: {
            min: 0,
            max: 35,
            left: 'center',
            bottom: 0,
            calculable: true,
            inRange: { color: ['#e8f1fb', '#9dc9e8', '#3f7fbf', '#12395f'] },
          },
          calendar: {
            range: RANGE,
            top: 48,
            bottom: 48,
            left: 'center',
            cellSize: ['auto', 18],
            yearLabel: { show: true },
            monthLabel: { show: true },
            dayLabel: { show: true, nameMap: 'cn' },
            itemStyle: { color: '#f3f6fa', borderWidth: 2, borderColor: '#fff' },
          },
          series: [
            {
              name: '活跃度',
              type: 'heatmap',
              coordinateSystem: 'calendar',
              data: CALENDAR_DATA,
            },
          ],
        },
        opts?.title,
        '年度活跃日历',
      ),
  }),
  def({
    id: 'calendar-scatter',
    categoryId: 'calendar',
    label: '日历散点图',
    hint: '散点标在日历上',
    chartType: 'scatter',
    build: (opts) =>
      withTitle(
        {
          title: { text: '发布日历', left: 'center' },
          tooltip: { trigger: 'item' },
          calendar: {
            range: RANGE,
            top: 48,
            bottom: 48,
            left: 'center',
            cellSize: ['auto', 18],
            itemStyle: { color: '#f3f6fa', borderWidth: 2, borderColor: '#fff' },
          },
          series: [
            {
              name: '发布',
              type: 'scatter',
              coordinateSystem: 'calendar',
              symbolSize: 10,
              data: CALENDAR_DATA.map((item) => [item[0], item[1]]),
            },
          ],
        },
        opts?.title,
        '发布日历',
      ),
  }),
]
