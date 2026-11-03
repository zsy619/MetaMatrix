/** 柱状图（官方类别 bar）：基础 / 堆叠 / 横向 / 极坐标 / 瀑布。 */
import { cartesianOption, def, MONTHS, QUARTERS, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const barTemplates: EchartsTemplateDef[] = [
  def({
    id: 'bar-basic',
    categoryId: 'bar',
    label: '基础柱状图',
    hint: '分类对比',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        cartesianOption('季度销售额', QUARTERS, [
          { name: '本年', data: [120, 200, 150, 80] },
          { name: '去年', data: [100, 160, 140, 90] },
        ], { type: 'bar' }),
        opts?.title,
        '季度销售额',
      ),
  }),
  def({
    id: 'bar-stack',
    categoryId: 'bar',
    label: '堆叠柱状图',
    hint: '多系列累加对比',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        cartesianOption('堆叠销售额', QUARTERS, [
          { name: '华东', data: [320, 302, 301, 334, 390, 430] },
          { name: '华南', data: [120, 132, 101, 134, 90, 130] },
          { name: '华北', data: [220, 182, 191, 234, 290, 330] },
        ], { type: 'bar', stack: '区域' }),
        opts?.title,
        '堆叠销售额',
      ),
  }),
  def({
    id: 'bar-horizontal',
    categoryId: 'bar',
    label: '横向柱状图',
    hint: '长标签更易读',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        cartesianOption('部门产量', ['研发', '市场', '销售', '客服', '财务'], [
          { name: '本季', data: [120, 98, 156, 84, 66] },
        ], { type: 'bar', horizontal: true }),
        opts?.title,
        '部门产量',
      ),
  }),
  def({
    id: 'bar-polar',
    categoryId: 'bar',
    label: '极坐标柱状图',
    hint: '环形柱，角度轴',
    chartType: 'bar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '极坐标柱状图', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          polar: { radius: ['18%', '78%'] },
          angleAxis: { type: 'category', data: MONTHS.slice(0, 6) },
          radiusAxis: { type: 'value' },
          series: [
            {
              name: '产量',
              type: 'bar',
              coordinateSystem: 'polar',
              data: [120, 200, 150, 80, 170, 210],
              roundCap: true,
            },
          ],
        },
        opts?.title,
        '极坐标柱状图',
      ),
  }),
  def({
    id: 'bar-waterfall',
    categoryId: 'bar',
    label: '瀑布图',
    hint: '累计增减拆解',
    chartType: 'bar',
    build: (opts) => {
      const labels = ['期初', 'A', 'B', 'C', 'D', '期末']
      const delta = [100, 40, -30, 25, -20, null]
      const base: number[] = []
      const up: number[] = []
      const down: number[] = []
      let acc = 0
      for (let i = 0; i < labels.length; i += 1) {
        const d = delta[i]
        if (d === null) {
          base.push(0)
          up.push(0)
          down.push(acc)
          continue
        }
        if (d >= 0) {
          base.push(acc)
          up.push(d)
          down.push(0)
          acc += d
        } else {
          acc += d
          base.push(acc)
          up.push(0)
          down.push(-d)
        }
      }
      return withTitle(
        {
          title: { text: '瀑布图', left: 'center' },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [
            { name: '占位', type: 'bar', stack: 'total', itemStyle: { color: 'transparent' }, data: base },
            { name: '增加', type: 'bar', stack: 'total', data: up },
            { name: '减少', type: 'bar', stack: 'total', data: down },
          ],
        },
        opts?.title,
        '瀑布图',
      )
    },
  }),
]
