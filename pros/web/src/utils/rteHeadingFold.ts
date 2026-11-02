import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type HeadingFoldBody = { from: number; to: number; level: number }
export type HeadingFoldSpan = { headingPos: number; from: number; to: number }

function topLevel(doc: PMNode): Array<{ node: PMNode; pos: number }> {
  const out: Array<{ node: PMNode; pos: number }> = []
  doc.forEach((node, pos) => out.push({ node, pos }))
  return out
}

/** 标题下、直到下一个同级或更高级标题之前的正文。没有可折叠正文时返回 null。 */
export function headingFoldBody(doc: PMNode, headingPos: number): HeadingFoldBody | null {
  const tops = topLevel(doc)
  const index = tops.findIndex((item) => item.pos === headingPos)
  if (index < 0) return null
  const heading = tops[index]!
  if (heading.node.type.name !== 'heading') return null
  const level = Number(heading.node.attrs.level) || 1
  const from = heading.pos + heading.node.nodeSize
  let to = doc.content.size
  for (let i = index + 1; i < tops.length; i += 1) {
    const next = tops[i]!
    if (next.node.type.name === 'heading' && (Number(next.node.attrs.level) || 1) <= level) {
      to = next.pos
      break
    }
  }
  if (from >= to) return null
  return { from, to, level }
}

/** 当前处于折叠状态、并且下面确实有正文的标题。 */
export function headingFoldSpans(doc: PMNode): HeadingFoldSpan[] {
  const spans: HeadingFoldSpan[] = []
  doc.forEach((node, pos) => {
    if (node.type.name !== 'heading' || !node.attrs.collapsed) return
    const body = headingFoldBody(doc, pos)
    if (!body) return
    spans.push({ headingPos: pos, from: body.from, to: body.to })
  })
  return spans
}

export function buildFoldDecorations(doc: PMNode): DecorationSet | null {
  const spans = headingFoldSpans(doc)
  const byPos = new Map<number, { to: number; classes: string[]; attrs: Record<string, string> }>()
  const add = (pos: number, size: number, className: string, attrs?: Record<string, string>) => {
    let entry = byPos.get(pos)
    if (!entry) {
      entry = { to: pos + size, classes: [], attrs: {} }
      byPos.set(pos, entry)
    }
    entry.classes.push(className)
    if (attrs) Object.assign(entry.attrs, attrs)
  }
  doc.forEach((node, pos) => {
    if (node.type.name === 'heading' && headingFoldBody(doc, pos)) {
      add(pos, node.nodeSize, 'rte-heading-foldable', {
        'aria-expanded': node.attrs.collapsed ? 'false' : 'true',
      })
    }
    if (spans.some((span) => pos >= span.from && pos < span.to)) {
      add(pos, node.nodeSize, 'rte-fold-hidden')
    }
  })
  if (!byPos.size) return null
  const decos: Decoration[] = []
  byPos.forEach((entry, pos) => {
    decos.push(Decoration.node(pos, entry.to, { ...entry.attrs, class: entry.classes.join(' ') }))
  })
  return DecorationSet.create(doc, decos)
}

/** 切换折叠。收起时光标若在被折起的正文里，挪回标题。返回是否写进了事务。 */
export function applyHeadingFoldToggle(tr: Transaction, headingPos: number): boolean {
  const node = tr.doc.nodeAt(headingPos)
  if (!node || node.type.name !== 'heading') return false
  const body = headingFoldBody(tr.doc, headingPos)
  const next = !node.attrs.collapsed
  if (next && !body) return false
  const selectionFrom = tr.selection.from
  tr.setNodeMarkup(headingPos, undefined, { ...node.attrs, collapsed: next })
  tr.setMeta('headingFold', true)
  if (next && body && selectionFrom >= body.from && selectionFrom < body.to) {
    const near = Math.min(headingPos + 1, tr.doc.content.size)
    tr.setSelection(TextSelection.near(tr.doc.resolve(near)))
  }
  return true
}

export function expandFoldsCovering(tr: Transaction, from: number, to: number): boolean {
  const end = to > from ? to - 1 : from
  const spans = headingFoldSpans(tr.doc).filter((span) => {
    const inside = (pos: number) => pos >= span.from && pos < span.to
    return inside(from) || inside(end)
  })
  if (!spans.length) return false
  for (const span of spans) {
    const node = tr.doc.nodeAt(span.headingPos)
    if (!node || node.type.name !== 'heading' || !node.attrs.collapsed) continue
    tr.setNodeMarkup(span.headingPos, undefined, { ...node.attrs, collapsed: false })
  }
  tr.setMeta('headingFold', true)
  return tr.steps.length > 0
}
