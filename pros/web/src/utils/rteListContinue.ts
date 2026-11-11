import type { Editor } from '@tiptap/core'
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
    before.push(siblingKind(parent.child(i)))
  }
  const next = previousOrderedContinuation(before)
  if (next == null) return null
  return { listPos: $pos.before(listDepth), next }
}

function siblingKind(node: PMNode): ListSibling {
  if (node.type.name === 'orderedList') {
    return {
      type: 'orderedList',
      start: Number(node.attrs.start) || 1,
      items: listItemCount(node),
    }
  }
  if (node.type.name === 'paragraph' && !node.textContent.trim()) return { type: 'gap' }
  return { type: 'other' }
}

/** 有序列表改成无序列表，或反过来，文字留在原处。 */
export function retargetList(editor: Editor, to: 'bulletList' | 'orderedList'): boolean {
  const { state } = editor
  const $from = state.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'orderedList' && node.type.name !== 'bulletList') continue
    if (node.type.name === to) return true
    const type = state.schema.nodes[to]
    if (!type) return false
    const pos = $from.before(depth)
    editor.view.dispatch(state.tr.setNodeMarkup(pos, type, to === 'orderedList' ? { start: 1 } : {}))
    return true
  }
  return false
}
