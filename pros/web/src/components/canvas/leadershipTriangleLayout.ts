import type { LeadershipTriangleRegionId } from '../../types/canvas'
import type { CanvasViewBox, RegionLayout } from './regionLayout'

/**
 * 「领导核心价值驱动三角」几何与排版常量。
 *
 * 参考图（refs/leadership-triangle.png）：
 * 顶部 A ⇄ B 双箭头＋「心甘情愿」，其下是顶点「领导力 / 高水平影响力」；
 * 中间是 5 层金字塔（第 3 层中央是「难题」水印）；
 * 右侧一根上下箭头，上＝挑战现状、下＝稳定运营，旁边是「难度越大」的五条注解；
 * 左下是「管理 / 确定执行」，右下是「权力 / 强制执行」。
 */

export const LT_VIEW: CanvasViewBox = { w: 1000, h: 900 }

/** 金字塔：顶端被截平（宽 60），底边宽 580 */
export const LT_PYRAMID = {
  apexY: 296,
  baseY: 636,
  /** 顶端半宽 */
  apexHalf: 30,
  /** 底边半宽 */
  baseHalf: 240,
  centerX: 455,
  layers: 5,
} as const

export const LT_LAYER_COLORS = [
  '#2E4E6E',
  '#4A6E92',
  '#6E8CAC',
  '#93AAC8',
  '#B8C8DC',
] as const

export interface PyramidLayer {
  index: number
  topY: number
  bottomY: number
  /** 上底半宽 */
  topHalf: number
  /** 下底半宽 */
  bottomHalf: number
  points: string
  color: string
  /** 层级中心 y */
  centerY: number
}

function pyramidHalfAt(y: number): number {
  const t = (y - LT_PYRAMID.apexY) / (LT_PYRAMID.baseY - LT_PYRAMID.apexY)
  return LT_PYRAMID.apexHalf + t * (LT_PYRAMID.baseHalf - LT_PYRAMID.apexHalf)
}

/** 5 层金字塔（自上而下） */
export const LT_PYRAMID_LAYERS: PyramidLayer[] = Array.from(
  { length: LT_PYRAMID.layers },
  (_, i) => {
    const step = (LT_PYRAMID.baseY - LT_PYRAMID.apexY) / LT_PYRAMID.layers
    const topY = LT_PYRAMID.apexY + step * i
    const bottomY = topY + step
    const topHalf = pyramidHalfAt(topY)
    const bottomHalf = pyramidHalfAt(bottomY)
    return {
      index: i + 1,
      topY,
      bottomY,
      topHalf,
      bottomHalf,
      centerY: (topY + bottomY) / 2,
      color: LT_LAYER_COLORS[i] ?? '#B8C8DC',
      points: [
        `${LT_PYRAMID.centerX - topHalf},${topY}`,
        `${LT_PYRAMID.centerX + topHalf},${topY}`,
        `${LT_PYRAMID.centerX + bottomHalf},${bottomY}`,
        `${LT_PYRAMID.centerX - bottomHalf},${bottomY}`,
      ].join(' '),
    }
  },
)

/**
 * 层级序号（画在金字塔左侧空白处）。
 * 第 1/2/4/5 层的序号本身就是区域标题（由模板 JSON 提供），
 * 这里只补第 3 层——它的标题是中间那枚「难题」水印。
 */
export const LT_LAYER_TAGS = [
  { id: 'pyramid_3' as LeadershipTriangleRegionId, x: 172, y: 470, text: '第3层' },
]

export const LT_COLORS = {
  orange: '#E87722',
  ink: '#202124',
  inkSoft: '#3c4043',
  muted: '#5f6368',
  arrow: '#202124',
} as const

export const LEADERSHIP_TRIANGLE_LAYOUT: Record<
  LeadershipTriangleRegionId,
  RegionLayout
> = {
  top_exchange: {
    label: { x: 455, y: 44, anchor: 'middle', size: 30, weight: 800, color: LT_COLORS.orange },
    chip: { x: 455, y: 58, width: 250, align: 'center' },
  },
  apex: {
    label: {
      x: 455,
      y: 198,
      anchor: 'middle',
      size: 30,
      weight: 800,
      color: LT_COLORS.ink,
      mainText: '领导力',
      sub: {
        text: '高水平影响力',
        dy: 28,
        size: 16,
        weight: 700,
        color: LT_COLORS.inkSoft,
      },
    },
    chip: { x: 455, y: 240, width: 230, align: 'center' },
  },

  pyramid_1: {
    label: { x: 172, y: 334, anchor: 'end', size: 12, weight: 700, color: '#9aa0a6' },
    chip: { x: 455, y: 315, width: 62, align: 'center' },
  },
  pyramid_2: {
    label: { x: 172, y: 402, anchor: 'end', size: 12, weight: 700, color: '#9aa0a6' },
    chip: { x: 455, y: 383, width: 96, align: 'center' },
  },
  pyramid_3: {
    label: {
      x: 455,
      y: 462,
      anchor: 'middle',
      size: 26,
      weight: 900,
      color: '#22303f',
      stroke: '#ffffff',
      strokeWidth: 5,
    },
    chip: { x: 455, y: 470, width: 150, align: 'center' },
  },
  pyramid_4: {
    label: { x: 172, y: 538, anchor: 'end', size: 12, weight: 700, color: '#9aa0a6' },
    chip: { x: 455, y: 519, width: 180, align: 'center' },
  },
  pyramid_5: {
    label: { x: 172, y: 606, anchor: 'end', size: 12, weight: 700, color: '#9aa0a6' },
    chip: { x: 455, y: 587, width: 210, align: 'center' },
  },

  challenge: {
    label: { x: 820, y: 306, anchor: 'end', size: 18, weight: 800, color: LT_COLORS.ink },
    chip: { x: 820, y: 316, width: 132, align: 'right' },
  },
  stable: {
    label: { x: 820, y: 530, anchor: 'end', size: 18, weight: 800, color: LT_COLORS.ink },
    chip: { x: 820, y: 540, width: 132, align: 'right' },
  },
  difficulty: {
    label: { x: 850, y: 306, anchor: 'start', size: 16, weight: 800, color: LT_COLORS.ink },
    chip: { x: 850, y: 316, width: 140, align: 'left' },
  },
  management: {
    label: {
      x: 30,
      y: 726,
      anchor: 'start',
      size: 32,
      weight: 900,
      color: LT_COLORS.ink,
      mainText: '管理',
      sub: {
        text: '确定执行',
        dy: 26,
        size: 15,
        weight: 800,
        color: LT_COLORS.ink,
      },
    },
    chip: { x: 250, y: 688, width: 190, align: 'left' },
  },
  power: {
    label: {
      x: 600,
      y: 726,
      anchor: 'start',
      size: 32,
      weight: 900,
      color: LT_COLORS.ink,
      mainText: '权力',
      sub: {
        text: '强制执行',
        dy: 26,
        size: 15,
        weight: 800,
        color: LT_COLORS.ink,
      },
    },
    chip: { x: 740, y: 688, width: 190, align: 'left' },
  },
}
