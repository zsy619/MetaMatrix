/** 路径图（官方类别 lines）：航线 / 流动路径。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const linesTemplates: EchartsTemplateDef[] = [
  def({
    id: 'lines-basic',
    categoryId: 'lines',
    label: '基础路径图',
    hint: '折线轨迹',
    chartType: 'lines',
    build: (opts) =>
      withTitle(
        {
          title: { text: '物流路径', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'value', min: 0, max: 100 },
          yAxis: { type: 'value', min: 0, max: 100 },
          series: [
            {
              name: '线路',
              type: 'lines',
              coordinateSystem: 'cartesian2d',
              polyline: true,
              lineStyle: { color: '#4a7fb5', width: 2 },
              data: [
                { name: '线路 A', coords: [[10, 20], [40, 60], [80, 30]] },
                { name: '线路 B', coords: [[20, 80], [50, 40], [90, 70]] },
              ],
            },
          ],
        },
        opts?.title,
        '物流路径',
      ),
  }),
  def({
    id: 'lines-effect',
    categoryId: 'lines',
    label: '流动路径图',
    hint: '带流动动画',
    chartType: 'lines',
    build: (opts) =>
      withTitle(
        {
          title: { text: '流量路径', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
          xAxis: { type: 'value', min: 0, max: 100 },
          yAxis: { type: 'value', min: 0, max: 100 },
          series: [
            {
              name: '流量',
              type: 'lines',
              coordinateSystem: 'cartesian2d',
              polyline: true,
              effect: { show: true, period: 4, trailLength: 0.4, symbol: 'arrow', symbolSize: 6 },
              lineStyle: { color: '#e05a4f', width: 2 },
              data: [
                { name: '流向 A', coords: [[10, 20], [40, 60], [80, 30]] },
                { name: '流向 B', coords: [[20, 80], [50, 40], [90, 70]] },
              ],
            },
          ],
        },
        opts?.title,
        '流量路径',
      ),
  }),
]
