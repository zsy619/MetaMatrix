import type { CanvasViewBox } from './regionLayout'
import type { AbcModelBlockId } from '../../types/canvas'

/**
 * 业务公式ABC模型几何与排版常量。
 *
 * 参考图（refs/abc-model.png）：
 * - 外层黑框三角 = 业务公式空间，三角形本身是「可落公式的地方」；
 * - 三个顶点分别是 A. 目标（上）、B. 参数（左下）、C. 逻辑关系（右下），
 *   标题块与竖分隔线右侧是该层的要点清单；
 * - 内部绿色三角 = 创新公式（自己创建），橙色三角 = 借鉴公式（十大经典范式）；
 * - 重心向三个顶点引虚线并保留灰点；公式落在三角形底部的白色公式块里。
 */

export const ABC_VIEW: CanvasViewBox = { w: 1280, h: 740 }

/** 外层黑框三角：业务公式空间 */
export const ABC_FRAME = {
  apexX: 560,
  apexY: 140,
  baseLeftX: 250,
  baseRightX: 870,
  baseY: 600,
} as const

/** 绿色三角：创新公式（自己创建、探索业务公式） */
export const ABC_ZONE_INNOVATION = {
  apexX: 560,
  apexY: 232,
  baseLeftX: 455,
  baseRightX: 665,
  baseY: 499,
} as const

/** 橙色三角：借鉴公式（学习掌握「十大业务公式」） */
export const ABC_ZONE_BORROWED = {
  apexX: 560,
  apexY: 310,
  baseLeftX: 500,
  baseRightX: 620,
  baseY: 462,
} as const

/** 重心：虚线射线起点，也是灰点位置 */
export const ABC_CENTER = { x: 560, y: 447 } as const

/** 公式块：落在外框三角底部、绿色三角与底边之间的空白带里 */
export const ABC_FORMULA = {
  x: 560,
  y: 548,
  maxWidth: 460,
  height: 36,
  fontSize: 15,
} as const

export const ABC_COLORS = {
  /** 标题黑 */
  ink: '#202124',
  /** 英文副标题的珊瑚橙 */
  sub: '#F0A05C',
  /** 要点清单灰 */
  muted: '#5F6368',
  /** 外框黑 */
  frame: '#1F1F1F',
  /** 借鉴公式（橙） */
  borrowed: '#E07B22',
  borrowedFill: '#FDF1E3',
  /** 创新公式（绿） */
  innovation: '#2E9E5B',
  innovationFill: '#EAF6EF',
  /** 重心虚线 */
  ray: '#B7BDC6',
  /** 竖分隔线 */
  rule: '#D8DDE3',
  /** 公式块底色 */
  chip: '#FFFFFF',
} as const

export interface AbcVertexGroup {
  /** 英文副标题 */
  en: string
  /** 标题中心 x（标题与英文副标题都居中于此） */
  titleX: number
  /** 标题基线 y */
  titleY: number
  /** 英文副标题基线 y */
  enY: number
  /** 条目数基线 y */
  countY: number
  /** 竖分隔线 x / 上端 y / 下端 y */
  ruleX: number
  ruleTop: number
  ruleBottom: number
  /** 要点清单起点 x / 首行基线 y / 行距 */
  listX: number
  listY: number
  listLineHeight: number
}

/** 三个顶点的排版位置：A 在上，B 在左下，C 在右下 */
export const ABC_VERTEX_GROUPS: Record<AbcModelBlockId, AbcVertexGroup> = {
  ambition: {
    en: 'Ambition',
    titleX: 545,
    titleY: 46,
    enY: 68,
    countY: 88,
    ruleX: 625,
    ruleTop: 24,
    ruleBottom: 96,
    listX: 639,
    listY: 40,
    listLineHeight: 18,
  },
  basis: {
    en: 'Basis',
    titleX: 98,
    titleY: 646,
    enY: 668,
    countY: 688,
    ruleX: 154,
    ruleTop: 624,
    ruleBottom: 704,
    listX: 168,
    listY: 638,
    listLineHeight: 18,
  },
  connection: {
    en: 'Connection',
    titleX: 996,
    titleY: 646,
    enY: 668,
    countY: 688,
    ruleX: 1074,
    ruleTop: 624,
    ruleBottom: 704,
    listX: 1088,
    listY: 638,
    listLineHeight: 18,
  },
}

/** 图例：两种公式来源 */
export const ABC_LEGEND = [
  {
    key: 'borrowed',
    title: '借鉴公式(实事求是)',
    desc: '学习掌握「十大业务公式」',
    color: ABC_COLORS.borrowed,
  },
  {
    key: 'innovation',
    title: '创新公式(解放思想)',
    desc: '自己创建、探索业务公式',
    color: ABC_COLORS.innovation,
  },
] as const

/** 图例排版位置（右栏，位于 C 组上方） */
export const ABC_LEGEND_POS = { x: 993, y: 330, barWidth: 5, barHeight: 24 } as const

/** 生成三角形顶点字符串 */
export function abcTrianglePoints(
  apexX: number,
  apexY: number,
  baseLeftX: number,
  baseRightX: number,
  baseY: number,
): string {
  return `${apexX},${apexY} ${baseLeftX},${baseY} ${baseRightX},${baseY}`
}

export const ABC_FRAME_POINTS = abcTrianglePoints(
  ABC_FRAME.apexX,
  ABC_FRAME.apexY,
  ABC_FRAME.baseLeftX,
  ABC_FRAME.baseRightX,
  ABC_FRAME.baseY,
)

export const ABC_INNOVATION_POINTS = abcTrianglePoints(
  ABC_ZONE_INNOVATION.apexX,
  ABC_ZONE_INNOVATION.apexY,
  ABC_ZONE_INNOVATION.baseLeftX,
  ABC_ZONE_INNOVATION.baseRightX,
  ABC_ZONE_INNOVATION.baseY,
)

export const ABC_BORROWED_POINTS = abcTrianglePoints(
  ABC_ZONE_BORROWED.apexX,
  ABC_ZONE_BORROWED.apexY,
  ABC_ZONE_BORROWED.baseLeftX,
  ABC_ZONE_BORROWED.baseRightX,
  ABC_ZONE_BORROWED.baseY,
)

/** 重心到三个顶点的虚线射线 */
export const ABC_RAYS = [
  { x1: ABC_CENTER.x, y1: ABC_CENTER.y, x2: ABC_FRAME.apexX, y2: ABC_FRAME.apexY },
  {
    x1: ABC_CENTER.x,
    y1: ABC_CENTER.y,
    x2: ABC_FRAME.baseLeftX,
    y2: ABC_FRAME.baseY,
  },
  {
    x1: ABC_CENTER.x,
    y1: ABC_CENTER.y,
    x2: ABC_FRAME.baseRightX,
    y2: ABC_FRAME.baseY,
  },
] as const

/** 粗略估算文本宽度：中日韩字符按 1em，其余按 0.56em */
export function abcEstimateTextWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    units += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56
  }
  return units * fontSize
}
