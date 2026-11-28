import type { CanvasViewBox } from './regionLayout'

/**
 * 业务公式十大经典范式的图形排版常量。
 *
 * 参考图（refs/business-formula-patterns.png）：
 * 三个圆分别是「收入提升 / 竞争提升 / 运营提升」三大方向，圆心连成三角；
 * 十条范式按方向排在三角四周（收入在右上、竞争在左、运营在右）；
 * 三角形正中是一个向上箭头和一句提问——你下一步最渴望提升什么。
 */

export const BFP_VIEW: CanvasViewBox = { w: 1340, h: 700 }

export type BfpCategoryKey = 'revenue' | 'competition' | 'operation'

export interface BfpCategoryMeta {
  key: BfpCategoryKey
  /** 大字标题 */
  label: string
  /** 珊瑚色副标题 */
  sub: string
  /** 圆心 */
  cx: number
  cy: number
  r: number
  fill: string
  ring: string
  /** 范式清单：起点 x、首行基线 y、行距 */
  listX: number
  listY: number
  listStep: number
}

export const BFP_CATEGORIES: BfpCategoryMeta[] = [
  {
    key: 'revenue',
    label: '收入提升',
    sub: '全局商业模式',
    cx: 670,
    cy: 140,
    r: 92,
    fill: '#FDF3E2',
    ring: '#F0CE8E',
    listX: 790,
    listY: 40,
    listStep: 46,
  },
  {
    key: 'competition',
    label: '竞争提升',
    sub: '稀缺竞争力',
    cx: 430,
    cy: 560,
    r: 92,
    fill: '#E2EEF9',
    ring: '#A3C9EA',
    listX: 30,
    listY: 470,
    listStep: 46,
  },
  {
    key: 'operation',
    label: '运营提升',
    sub: '运营数据提升',
    cx: 910,
    cy: 560,
    r: 92,
    fill: '#E9E7F7',
    ring: '#BDB4E4',
    listX: 1030,
    listY: 400,
    listStep: 46,
  },
]

export const BFP_COLORS = {
  ink: '#1F1F1F',
  /** 分类副标题、标签 */
  accent: '#E8543F',
  /** 范式表达式 */
  desc: '#6B6B6B',
  /** 三角连线 */
  line: '#1F1F1F',
  /** 正中箭头 */
  chevron: '#9AA0A6',
  center: '#3C4043',
} as const

/** 标签配色（标准/个性/线下/长期/对外/对内） */
export const BFP_BADGE_COLORS: Record<string, string> = {
  standard: '#E65100',
  custom: '#7B1FA2',
  offline: '#C62828',
  longterm: '#00695C',
  external: '#C62828',
  internal: '#2E7D32',
}

/** 三圆之间的连线 */
export const BFP_LINKS = [
  { x1: 670, y1: 140, x2: 430, y2: 560 },
  { x1: 670, y1: 140, x2: 910, y2: 560 },
  { x1: 430, y1: 560, x2: 910, y2: 560 },
]

/** 正中提问 */
export const BFP_CENTER = { x: 670, y: 332 } as const

/** 圆圈里的字 */
export const BFP_CIRCLE_TEXT = {
  titleSize: 28,
  titleDy: -4,
  subSize: 16,
  subDy: 26,
} as const

/** 范式条目的字 */
export const BFP_ENTRY_TEXT = {
  nameSize: 16,
  descSize: 11.5,
  descDy: 19,
  badgeSize: 13,
} as const

/** 圈号（参考图用 ①②③…） */
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

export function bfpCircledNumber(id: number): string {
  return CIRCLED[id - 1] || `(${id})`
}

/** 粗略估算文本宽度：中日韩字符与圈号按 1em，其余按 0.56em */
export function bfpEstimateWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    units += /[\u2460-\u24ff\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56
  }
  return units * fontSize
}
