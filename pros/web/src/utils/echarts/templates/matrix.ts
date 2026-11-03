/**
 * 矩阵坐标系（官方类别 matrix，ECharts 6.0 新增）。
 *
 * matrix 是一个坐标系组件：matrix.x.data / matrix.y.data 给行列标签，
 * series 用 coordinateSystem: 'matrix' 把数据落到格子上。
 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const ROWS = ['华东', '华北', '华南']
const COLS = ['一季度', '二季度', '三季度', '四季度']

const MATRIX_DATA = [
  [0, 0, 120], [1, 0, 150], [2, 0, 90], [3, 0, 60],
  [0, 1, 80], [1, 1, 110], [2, 1, 140], [3, 1, 70],
  [0, 2, 200], [1, 2, 170], [2, 2, 130], [3, 2, 95],
]

export const matrixTemplates: EchartsTemplateDef[] = [
  def({
    id: 'matrix-basic',
    categoryId: 'matrix',
    label: '矩阵坐标系',
    hint: 'ECharts 6 新增坐标系',
    chartType: 'heatmap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '区域 × 季度', left: 'center' },
          tooltip: { trigger: 'item' },
          matrix: {
            x: { data: COLS },
            y: { data: ROWS },
            left: 96,
            top: 56,
            right: 40,
            bottom: 40,
          },
          visualMap: {
            min: 0,
            max: 200,
            show: false,
            inRange: { color: ['#e8f1fb', '#9dc9e8', '#3f7fbf', '#12395f'] },
          },
          series: [
            {
              name: '销售额',
              type: 'heatmap',
              coordinateSystem: 'matrix',
              data: MATRIX_DATA,
              label: { show: true },
            },
          ],
        },
        opts?.title,
        '区域 × 季度',
      ),
  }),
]
