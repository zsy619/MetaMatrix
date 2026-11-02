import type { Node as PMNode } from '@tiptap/pm/model'
import { previousOrderedContinuation, type ListSibling } from './rtePracticalToolbar'

function listItemCount(list: PMNode): number {
  let items = 0
  list.forEach((child) => {
    if (child.type.name === 'listItem') items += 1
  })
  return items
}

/** 光标所在有序列表若能接上前一个同级列表，返回应写入的 start。 */
export function orderedListContinuation(
  doc: PMNode,
  fromPos: number,
): { listPos: number; next: number } | null {
  const pos = Math.max(0, Math.min(fromPos, doc.content.size))
  const $pos = doc.resolve(pos)
  let listDepth = -1
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'orderedList') {
      listDepth = depth
      break
    }
  }
  if (listDepth < 1) return null
  const parent = $pos.node(listDepth - 1)
  const index = $pos.index(listDepth - 1)
  const before: ListSibling[] = []
  for (let i = 0; i < index; i += 1) {
    const child = parent.child(i)
    if (child.type.name === 'orderedList') {
      before.push({
        type: 'orderedList',
        start: Number(child.attrs.start) || 1,
        items: listItemCount(child),
      })
    } else {
      before.push({ type: 'other' })
    }
  }
  const next = previousOrderedContinuation(before)
  if (next == null) return null
  return { listPos: $pos.before(listDepth), next }
}
