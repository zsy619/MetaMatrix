/** 折线图（官方类别 line）：基础 / 平滑 / 面积 / 堆叠 / 阶梯 / 多轴。 */
import { cartesianOption, def, MONTHS, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const lineTemplates: EchartsTemplateDef[] = [
  def({
    id: 'line-basic',
    categoryId: 'line',
    label: '基础折线图',
    hint: '多条折线对比趋势',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        cartesianOption('月度活跃趋势', MONTHS.slice(0, 6), [
          { name: '新增用户', data: [820, 932, 901, 934, 1290, 1330] },
          { name: '活跃用户', data: [620, 682, 741, 790, 850, 920] },
        ], { type: 'line' }),
        opts?.title,
        '月度活跃趋势',
      ),
  }),
  def({
    id: 'line-smooth',
    categoryId: 'line',
    label: '平滑折线图',
    hint: '曲线过渡，适合趋势',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        cartesianOption('平滑趋势', MONTHS.slice(0, 6), [
          { name: '销售额', data: [120, 200, 150, 180, 260, 300] },
        ], { type: 'line', smooth: true }),
        opts?.title,
        '平滑趋势',
      ),
  }),
  def({
    id: 'line-area',
    categoryId: 'line',
    label: '面积折线图',
    hint: '带填充区域',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        cartesianOption('面积趋势', MONTHS.slice(0, 6), [
          { name: '成本', data: [60, 90, 70, 110, 130, 150] },
          { name: '收入', data: [120, 180, 160, 220, 260, 300] },
        ], { type: 'line', smooth: true, area: true }),
        opts?.title,
        '面积趋势',
      ),
  }),
  def({
    id: 'line-stack',
    categoryId: 'line',
    label: '堆叠折线图',
    hint: '多系列累加',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        cartesianOption('堆叠趋势', MONTHS.slice(0, 6), [
          { name: '线上', data: [320, 402, 401, 434, 390, 430] },
          { name: '线下', data: [120, 132, 101, 134, 90, 130] },
        ], { type: 'line', stack: '总量', area: true }),
        opts?.title,
        '堆叠趋势',
      ),
  }),
  def({
    id: 'line-step',
    categoryId: 'line',
    label: '阶梯折线图',
    hint: '按阶段跳变',
    chartType: 'line',
    build: (opts) =>
      withTitle(
        cartesianOption('阶梯趋势', MONTHS.slice(0, 6), [
          { name: '价格', data: [12, 15, 15, 18, 18, 22] },
        ], { type: 'line', step: true }),
        opts?.title,
        '阶梯趋势',
      ),
  }),
  def({
    id: 'line-multi-axis',
    categoryId: 'line',
    label: '双轴折线图',
    hint: '两个量纲同图对比',
    chartType: 'line',
    build: (opts) => {
      const base = cartesianOption('双轴对比', MONTHS.slice(0, 6), [
        { name: '订单量', data: [820, 932, 901, 934, 1290, 1330] },
      ], { type: 'line', smooth: true })
      base.yAxis = [
        { type: 'value', name: '订单量' },
        { type: 'value', name: '转化率(%)', splitLine: { show: false } },
      ]
      base.series = [
        { name: '订单量', type: 'line', smooth: true, data: [820, 932, 901, 934, 1290, 1330] },
        {
          name: '转化率',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: [2.1, 2.6, 3.1, 3.4, 3.9, 4.2],
        },
      ]
      return withTitle(base, opts?.title, '双轴对比')
    },
  }),
]
