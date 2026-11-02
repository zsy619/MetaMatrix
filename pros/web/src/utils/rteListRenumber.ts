/**
 * 「列表从此处重编号」。
 *
 * 光标在有序列表的某一项里时，把这个列表在该项处切成两段：
 * 前半段保留原来的 start，后半段（当前项及之后）从 1 重新编号。
 * 嵌套在列表项里的子列表原样保留。
 */
import type { Node as PMNode } from '@tiptap/pm/model'

export type ListRenumberPlan = {
  /** 需要重建的有序列表节点位置 */
  listPos: number
  /** 重新编号起始项在列表内的下标（0 基） */
  itemIndex: number
  /** 拆分后的两段列表的 start 值：[前半段 start, 后半段 start] */
  starts: [number, number]
}

/**
 * 找到光标所在的有序列表。
 * 返回列表在文档中的深度（orderedList 自己的深度）与列表项下标。
 */
function orderedListAt(
  doc: PMNode,
  fromPos: number,
): { listDepth: number; itemIndex: number } | null {
  const pos = Math.max(0, Math.min(fromPos, doc.content.size))
  const $pos = doc.resolve(pos)
  // 从深到浅找最近的 orderedList：嵌套时命中内层列表
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== 'orderedList') continue
    // 该列表里直接包着光标所在的那一项
    const itemDepth = depth + 1
    if ($pos.node(itemDepth).type.name !== 'listItem') return null
    return { listDepth: depth, itemIndex: $pos.index(depth) }
  }
  return null
}

/** 找到光标所在的有序列表项在同级列表中的下标。不在有序列表里返回 null。 */
export function listItemIndexAt(doc: PMNode, fromPos: number): number | null {
  const found = orderedListAt(doc, fromPos)
  return found ? found.itemIndex : null
}

/**
 * 计算重新编号方案。
 * 光标不在有序列表项里，或该项已经是列表的第一项且列表本就从 1 开始时，返回 null。
 */
export function planListRenumber(doc: PMNode, fromPos: number): ListRenumberPlan | null {
  const found = orderedListAt(doc, fromPos)
  if (!found) return null
  const $pos = doc.resolve(Math.max(0, Math.min(fromPos, doc.content.size)))
  const list = $pos.node(found.listDepth)
  const listPos = $pos.before(found.listDepth)
  const originalStart = Number(list.attrs.start) || 1
  if (found.itemIndex === 0 && originalStart === 1) return null
  return { listPos, itemIndex: found.itemIndex, starts: [originalStart, 1] }
}
