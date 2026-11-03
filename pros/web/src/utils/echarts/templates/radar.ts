/** 雷达图（官方类别 radar）：基础 / 多系列 / 填充。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const INDICATORS = [
  { name: '性能', max: 100 },
  { name: '稳定', max: 100 },
  { name: '易用', max: 100 },
  { name: '安全', max: 100 },
  { name: '成本', max: 100 },
]

export const radarTemplates: EchartsTemplateDef[] = [
  def({
    id: 'radar-basic',
    categoryId: 'radar',
    label: '基础雷达图',
    hint: '多维评分',
    chartType: 'radar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '能力雷达', left: 'center' },
          tooltip: {},
          radar: {
            indicator: INDICATORS,
            center: ['50%', '54%'],
            radius: '62%',
          },
          series: [
            { name: '本期', type: 'radar', data: [{ value: [82, 74, 68, 90, 76] }] },
            { name: '上期', type: 'radar', data: [{ value: [70, 66, 72, 80, 84] }] },
          ],
        },
        opts?.title,
        '能力雷达',
      ),
  }),
  def({
    id: 'radar-area',
    categoryId: 'radar',
    label: '填充雷达图',
    hint: '半透明区域',
    chartType: 'radar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '填充雷达图', left: 'center' },
          tooltip: {},
          legend: { bottom: 0 },
          radar: {
            indicator: INDICATORS,
            center: ['50%', '52%'],
            radius: '62%',
            splitArea: { areaStyle: { color: ['rgba(120,160,220,0.08)', 'rgba(120,160,220,0.16)'] } },
          },
          series: [
            {
              name: '本期',
              type: 'radar',
              areaStyle: { opacity: 0.25 },
              data: [{ value: [82, 74, 68, 90, 76] }],
            },
          ],
        },
        opts?.title,
        '填充雷达图',
      ),
  }),
  def({
    id: 'radar-shape',
    categoryId: 'radar',
    label: '多边形雷达图',
    hint: 'shape=polygon',
    chartType: 'radar',
    build: (opts) =>
      withTitle(
        {
          title: { text: '多边形雷达图', left: 'center' },
          tooltip: {},
          legend: { bottom: 0 },
          radar: {
            indicator: INDICATORS,
            shape: 'polygon',
            center: ['50%', '54%'],
            radius: '62%',
          },
          series: [
            { name: '本期', type: 'radar', data: [{ value: [82, 74, 68, 90, 76] }] },
            { name: '上期', type: 'radar', data: [{ value: [70, 66, 72, 80, 84] }] },
          ],
        },
        opts?.title,
        '多边形雷达图',
      ),
  }),
]
