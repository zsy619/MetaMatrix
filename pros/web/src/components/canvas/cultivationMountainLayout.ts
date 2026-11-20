import type { CanvasViewBox } from './regionLayout'

/**
 * 业务公式修炼爬山的图形排版常量。
 *
 * 参考图（refs/cultivation-mountain.png）是一张六列矩阵：
 * 顶上一排是 L1–L6 段位，中间一条由蓝到紫的能力段位箭头，箭头下面是
 * 段位名（只低头执行 / 有假设意识 / …）与一句话说明；再下面是「常见问题」
 * 一行，每列一个问题标题加若干问题盒，L6 是「最佳实践」大盒；
 * 最底下一条是「提升路径」的四段箭头条。
 */

export const CM_VIEW: CanvasViewBox = { w: 1560, h: 580 }

/** 左侧竖排栏（能力段位 / 常见问题 / 提升路径 三个行标题） */
export const CM_GUTTER = 120

/** 六级能力列宽 */
export const CM_COL_WIDTH = (CM_VIEW.w - CM_GUTTER) / 6

export const CM_ROWS = {
  /** 阶段标签（入门/进阶/高阶）基线 */
  stage: 32,
  /** 「你在这里」标记条 */
  hereTop: 40,
  hereH: 24,
  /** L1–L6 基线 */
  level: 122,
  /** 能力段位箭头条 */
  arrowY: 150,
  arrowH: 9,
  /** 段位名基线 */
  name: 210,
  /** 段位副标题基线 */
  subtitle: 242,
  /** 常见问题标题基线 */
  problem: 304,
  /** 问题盒顶 / 盒高 / 行距 */
  boxTop: 324,
  boxH: 34,
  boxStep: 46,
  /** 提升路径条 */
  pathTop: 500,
  pathH: 56,
} as const

export const CM_COLORS = {
  ink: '#1F1F1F',
  /** 段位副标题 */
  desc: '#5F6368',
  /** 问题盒里的字 */
  problem: '#5F6368',
  /** 级间虚线 */
  sep: '#C9CCD1',
  /** 提升路径条的底色 */
  pathBg: '#F2F3F5',
} as const

/** 「提升路径」四段：从第几级到第几级 */
export interface CmPathStage {
  label: string
  from: number
  to: number
  color: string
}

export const CM_PATH_STAGES: CmPathStage[] = [
  { label: '有公式意识', from: 1, to: 2, color: '#3B82F6' },
  { label: '有稳定拆解', from: 3, to: 3, color: '#10B981' },
  { label: '有持续拆解', from: 4, to: 4, color: '#F59E0B' },
  { label: '激发大量高质量假设+无限进步', from: 5, to: 6, color: '#EF4444' },
]

/** 第 level 列的左边界 x */
export function cmColumnLeft(level: number): number {
  return CM_GUTTER + (level - 1) * CM_COL_WIDTH
}

/** 第 level 列的中心 x */
export function cmColumnCenter(level: number): number {
  return cmColumnLeft(level) + CM_COL_WIDTH / 2
}

/** 阶段色（入门/进阶/高阶） */
export const CM_STAGE_META = [
  { key: 'beginner', label: '入门', color: '#10B981' },
  { key: 'intermediate', label: '进阶', color: '#F59E0B' },
  { key: 'advanced', label: '高阶', color: '#EF4444' },
] as const
