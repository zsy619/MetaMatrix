import type { Editor } from '@tiptap/core'
import { Fragment, type Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

export type SectionNode = { type: string; level: number }

function sectionEnd(nodes: readonly SectionNode[], start: number): number {
  const level = nodes[start]?.level || 1
  let end = start + 1
  while (end < nodes.length) {
    const node = nodes[end]
    if (node?.type === 'heading' && (node.level || 1) <= level) break
    end += 1
  }
  return end
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let index = from; index < to; index += 1) out.push(index)
  return out
}

/** 把标题和它下面的正文当成一节，与相邻的同级节对调。 */
export function moveSectionIndexes(
  nodes: readonly SectionNode[],
  index: number,
  dir: -1 | 1,
): number[] | null {
  const current = nodes[index]
  if (!current || current.type !== 'heading') return null
  const end = sectionEnd(nodes, index)
  const level = current.level || 1
  if (dir < 0) {
    let prev = -1
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const node = nodes[cursor]
      if (node?.type === 'heading' && (node.level || 1) <= level) {
        prev = cursor
        break
      }
    }
    if (prev < 0) return null
    return [...range(0, prev), ...range(index, end), ...range(prev, index), ...range(end, nodes.length)]
  }
  let next = end
  while (next < nodes.length) {
    const node = nodes[next]
    if (node?.type === 'heading' && (node.level || 1) <= level) break
    next += 1
  }
  if (next >= nodes.length) return null
  const nextEnd = sectionEnd(nodes, next)
  return [...range(0, index), ...range(end, nextEnd), ...range(index, end), ...range(nextEnd, nodes.length)]
}

/** 当前标题和它下属的更低级标题一起升或降一级，夹在 1 到 6。 */
export function cascadeHeadingLevels(
  nodes: readonly SectionNode[],
  index: number,
  delta: 1 | -1,
): Array<{ index: number; level: number }> | null {
  const current = nodes[index]
  if (!current || current.type !== 'heading') return null
  const end = sectionEnd(nodes, index)
  const changes: Array<{ index: number; level: number }> = []
  for (let cursor = index; cursor < end; cursor += 1) {
    const node = nodes[cursor]
    if (node?.type !== 'heading') continue
    const level = Math.min(6, Math.max(1, (node.level || 1) + delta))
    if (level !== node.level) changes.push({ index: cursor, level })
  }
  return changes.length ? changes : null
}

/** 把 pos 所在的标题节向上或向下移动一节。到头时返回 false。 */
export function moveHeadingAt(editor: Editor, pos: number, dir: -1 | 1): boolean {
  const doc = editor.state.doc
  const nodes: SectionNode[] = []
  const children: PmNode[] = []
  let found = -1
  let index = 0
  doc.forEach((child, offset) => {
    nodes.push({ type: child.type.name, level: Number(child.attrs.level) || 1 })
    children.push(child)
    if (found < 0 && pos >= offset && pos < offset + child.nodeSize) found = index
    index += 1
  })
  if (found < 0 || nodes[found]?.type !== 'heading') return false
  const order = moveSectionIndexes(nodes, found, dir)
  if (!order) return false
  const copies = order.map((at) => children[at]!.copy(children[at]!.content))
  let tr = editor.state.tr.replaceWith(0, doc.content.size, Fragment.from(copies))
  const dest = order.indexOf(found)
  let selPos = 0
  for (let i = 0; i < dest; i += 1) selPos += copies[i]!.nodeSize
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, selPos)).scrollIntoView()
  } catch {
    tr = tr.scrollIntoView()
  }
  editor.view.dispatch(tr)
  editor.view.focus()
  return true
}

/** 把光标所在标题及其下级标题一起升或降一级。 */
export function cascadeHeadingAt(editor: Editor, pos: number, delta: 1 | -1): boolean {
  const doc = editor.state.doc
  const nodes: SectionNode[] = []
  const children: PmNode[] = []
  let found = -1
  let index = 0
  doc.forEach((child, offset) => {
    nodes.push({ type: child.type.name, level: Number(child.attrs.level) || 1 })
    children.push(child)
    if (found < 0 && pos >= offset && pos < offset + child.nodeSize) found = index
    index += 1
  })
  const changes = found < 0 ? null : cascadeHeadingLevels(nodes, found, delta)
  if (!changes) return false
  let tr = editor.state.tr
  for (let cursor = changes.length - 1; cursor >= 0; cursor -= 1) {
    const change = changes[cursor]!
    let at = 0
    for (let i = 0; i < change.index; i += 1) at += children[i]!.nodeSize
    const node = tr.doc.nodeAt(at)
    if (!node || node.type.name !== 'heading') continue
    tr = tr.setNodeMarkup(at, undefined, { ...node.attrs, level: change.level })
  }
  if (!tr.docChanged) return false
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
  return true
}
