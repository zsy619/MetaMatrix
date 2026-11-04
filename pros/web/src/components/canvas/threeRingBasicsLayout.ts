import type { ThreeRingBasicsRegionId } from '../../types/canvas'
import type { CanvasViewBox, RegionLayout } from './regionLayout'

/**
 * 「苦练基本功三环分析法」几何与排版常量。
 *
 * 参考图（refs/three-ring-basics.png）：三个半透明圆两两交叠，
 * 中间套一个正六边形（六个顶点＝六条基本功判据），
 * 三处两两交叠区各有一个反面标签，中心是三重交叠＝关键基本功。
 *
 * 坐标以 viewBox 为准（1000 × 900），HTML 浮层用同一套坐标换算百分比，
 * 保证标签与内容框和 SVG 图形严格对齐。
 */

export const TRB_VIEW: CanvasViewBox = { w: 1000, h: 900 }

/** 三圆的半径 */
export const TRB_RING_RADIUS = 250

/** 三圆圆心（等边分布，中心距 = 0.8R，保证三重交叠与两两交叠并存） */
export const TRB_RING_CENTERS = {
  practical: { x: 500, y: 290 },
  trainable: { x: 326.8, y: 590 },
  value: { x: 673.2, y: 590 },
} as const

/** 六边形（平顶朝上，中心在 (500,490)） */
export const TRB_HEX = {
  cx: 500,
  cy: 490,
  /** 外接圆半径 */
  r: 160,
  /** 六边形顶点（顺时针：左上 → 右上 → 右 → 右下 → 左下 → 左） */
  vertices: [
    { x: 420, y: 351.4 },
    { x: 580, y: 351.4 },
    { x: 660, y: 490 },
    { x: 580, y: 628.6 },
    { x: 420, y: 628.6 },
    { x: 340, y: 490 },
  ],
} as const

export const TRB_HEX_POINTS = TRB_HEX.vertices
  .map((v) => `${v.x},${v.y}`)
  .join(' ')

/** 三环配色 */
export const TRB_COLORS = {
  practical: { fill: 'rgba(64, 164, 223, 0.30)', stroke: '#7FC4EA', accent: '#2A9BD6' },
  trainable: { fill: 'rgba(244, 86, 164, 0.28)', stroke: '#F1A0C6', accent: '#EE4C9A' },
  value: { fill: 'rgba(245, 200, 60, 0.30)', stroke: '#F0D68A', accent: '#F2A50C' },
  ink: '#2b2b2b',
  muted: '#6b6b6b',
  hex: '#3a3a3a',
} as const

/**
 * 区域布局：label = SVG 静态标签（保留参考图排版），
 * chip = 用户内容浮层（紧贴标签下方的空白处）。
 */
export const THREE_RING_LAYOUT: Record<ThreeRingBasicsRegionId, RegionLayout> = {
  ring_practical: {
    label: { x: 500, y: 78, anchor: 'middle', size: 30, weight: 800, color: TRB_COLORS.practical.accent },
    chip: { x: 500, y: 94, width: 220, align: 'center' },
  },
  ring_trainable: {
    label: { x: 180, y: 620, anchor: 'middle', size: 30, weight: 800, color: TRB_COLORS.trainable.accent },
    chip: { x: 180, y: 636, width: 160, align: 'center' },
  },
  ring_value: {
    label: { x: 820, y: 620, anchor: 'middle', size: 30, weight: 800, color: TRB_COLORS.value.accent },
    chip: { x: 820, y: 636, width: 160, align: 'center' },
  },

  hex_concreteness: {
    label: { x: 395, y: 300, anchor: 'middle', size: 20, weight: 700, color: TRB_COLORS.ink },
    chip: { x: 395, y: 312, width: 124, align: 'center' },
  },
  hex_scenario: {
    label: { x: 605, y: 300, anchor: 'middle', size: 20, weight: 700, color: TRB_COLORS.ink },
    chip: { x: 605, y: 312, width: 124, align: 'center' },
  },
  hex_independence: {
    label: { x: 288, y: 484, anchor: 'end', size: 20, weight: 700, color: TRB_COLORS.ink },
    chip: { x: 288, y: 494, width: 132, align: 'right' },
  },
  hex_verifiability: {
    label: { x: 395, y: 676, anchor: 'middle', size: 20, weight: 700, color: TRB_COLORS.ink },
    chip: { x: 395, y: 688, width: 124, align: 'center' },
  },
  hex_compounding: {
    label: { x: 712, y: 484, anchor: 'start', size: 20, weight: 700, color: TRB_COLORS.ink },
    chip: { x: 712, y: 494, width: 132, align: 'left' },
  },
  hex_repeatability: {
    label: { x: 605, y: 676, anchor: 'middle', size: 20, weight: 700, color: TRB_COLORS.ink },
    chip: { x: 605, y: 688, width: 124, align: 'center' },
  },

  overlap_value_low: {
    label: { x: 440, y: 392, anchor: 'middle', size: 17, weight: 600, color: TRB_COLORS.muted },
    chip: { x: 440, y: 402, width: 96, align: 'center' },
  },
  overlap_not_trainable: {
    label: { x: 560, y: 392, anchor: 'middle', size: 17, weight: 600, color: TRB_COLORS.muted },
    chip: { x: 560, y: 402, width: 96, align: 'center' },
  },
  overlap_too_vague: {
    label: { x: 500, y: 572, anchor: 'middle', size: 17, weight: 600, color: TRB_COLORS.muted },
    chip: { x: 500, y: 582, width: 112, align: 'center' },
  },
  core: {
    label: { x: 500, y: 484, anchor: 'middle', size: 18, weight: 800, color: TRB_COLORS.ink },
    chip: { x: 500, y: 494, width: 124, align: 'center' },
  },
}

/** 参考图里的三枚装饰弧形箭头 */
export const TRB_ARROWS = [
  {
    d: 'M 528 186 Q 486 176 442 202',
    color: TRB_COLORS.practical.accent,
    rotate: 0,
  },
  {
    d: 'M 285 548 Q 308 588 340 616',
    color: TRB_COLORS.trainable.accent,
    rotate: 0,
  },
  {
    d: 'M 878 545 Q 897 504 872 462',
    color: TRB_COLORS.value.accent,
    rotate: 0,
  },
] as const
