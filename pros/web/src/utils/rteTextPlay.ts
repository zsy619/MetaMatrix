/** 把文字整理应用到编辑器选区，并找出揭晓文字的整段范围。 */

import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Fragment } from '@tiptap/pm/model'
import { isCharTidyMode, tidyText, type TextTidyMode } from './rteTextTidy'

export type TextTidyResult = 'applied' | 'unchanged' | 'need-lines'

type TextblockHit = { node: PmNode; pos: number }

function currentTextblockInner(editor: Editor): { from: number; to: number } | null {
  const $from = editor.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (!$from.node(depth).isTextblock) continue
    return { from: $from.start(depth), to: $from.end(depth) }
  }
  return null
}

/** 选区盖住的、同一父节点里连续的文本块。跨表格或不连续时返回 null。 */
export function siblingTextblocks(doc: PmNode, from: number, to: number): TextblockHit[] | null {
  const found: TextblockHit[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return
    found.push({ node, pos })
    return false
  })
  if (!found.length) return null
  const first = doc.resolve(found[0]!.pos)
  const parentStart = first.start(first.depth)
  let cursor = found[0]!.pos
  for (const block of found) {
    if (block.pos !== cursor) return null
    const at = doc.resolve(block.pos)
    if (at.depth !== first.depth || at.start(at.depth) !== parentStart) return null
    cursor = block.pos + block.node.nodeSize
  }
  return found
}

function applyCharTidy(editor: Editor, mode: TextTidyMode, from: number, to: number): TextTidyResult {
  const jobs: Array<{ from: number; to: number; text: string }> = []
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (start >= end) return
    const slice = node.text.slice(start - pos, end - pos)
    const next = tidyText(slice, mode)
    if (next !== slice) jobs.push({ from: start, to: end, text: next })
  })
  if (!jobs.length) return 'unchanged'
  let tr = editor.state.tr
  for (let i = jobs.length - 1; i >= 0; i -= 1) {
    const job = jobs[i]!
    tr = tr.insertText(job.text, job.from, job.to)
  }
  if (!tr.docChanged) return 'unchanged'
  editor.view.dispatch(tr)
  return 'applied'
}

function applyLineTidy(editor: Editor, mode: TextTidyMode, from: number, to: number): TextTidyResult {
  const blocks = siblingTextblocks(editor.state.doc, from, to)
  if (!blocks) return 'need-lines'
  if (mode !== 'numberLines' && blocks.length < 2) return 'need-lines'

  if (mode === 'numberLines') {
    const jobs: Array<{ from: number; to: number; text: string }> = []
    let n = 0
    for (const block of blocks) {
      if (!block.node.textContent.trim()) continue
      n += 1
      const body = block.node.textContent.replace(/^\d+\.\s+/, '')
      const next = `${n}. ${body}`
      if (next === block.node.textContent) continue
      jobs.push({
        from: block.pos + 1,
        to: block.pos + block.node.nodeSize - 1,
        text: next,
      })
    }
    if (!jobs.length) return 'unchanged'
    let tr = editor.state.tr
    for (let i = jobs.length - 1; i >= 0; i -= 1) {
      const job = jobs[i]!
      tr = tr.insertText(job.text, job.from, job.to)
    }
    if (!tr.docChanged) return 'unchanged'
    editor.view.dispatch(tr)
    return 'applied'
  }

  const texts = blocks.map((block) => block.node.textContent)
  const nextTexts =
    mode === 'sortLines'
      ? [...texts].sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))
      : texts.filter((line, index) => texts.indexOf(line) === index)
  if (nextTexts.length === texts.length && nextTexts.every((line, index) => line === texts[index])) {
    return 'unchanged'
  }
  const byText = new Map<string, PmNode[]>()
  for (const block of blocks) {
    const list = byText.get(block.node.textContent) || []
    list.push(block.node)
    byText.set(block.node.textContent, list)
  }
  const nodes = nextTexts.map((line) => {
    const list = byText.get(line) || []
    const node = list.shift() || blocks[0]!.node
    return node.copy(node.content)
  })
  const start = blocks[0]!.pos
  const end = blocks[blocks.length - 1]!.pos + blocks[blocks.length - 1]!.node.nodeSize
  const tr = editor.state.tr.replaceWith(start, end, Fragment.from(nodes))
  if (!tr.docChanged) return 'unchanged'
  editor.view.dispatch(tr)
  return 'applied'
}

export function applyTextTidy(editor: Editor, mode: TextTidyMode): TextTidyResult {
  const { from, to, empty } = editor.state.selection
  let rangeFrom = from
  let rangeTo = to
  if (empty || from === to) {
    const block = currentTextblockInner(editor)
    if (!block || block.from === block.to) return 'unchanged'
    rangeFrom = block.from
    rangeTo = block.to
  }
  if (isCharTidyMode(mode)) return applyCharTidy(editor, mode, rangeFrom, rangeTo)
  return applyLineTidy(editor, mode, rangeFrom, rangeTo)
}

/** 点击位置所在的整段揭晓文字。相邻、状态相同的片段算一段。 */
export function spoilerRangeAt(
  doc: PmNode,
  pos: number,
): { from: number; to: number; revealed: boolean } | null {
  const type = doc.type.schema.marks.spoiler
  if (!type) return null
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)
  const mark =
    type.isInSet($pos.marks()) ||
    ($pos.nodeBefore ? type.isInSet($pos.nodeBefore.marks) : undefined)
  if (!mark) return null
  let from = -1
  let to = -1
  doc.descendants((node, nodePos) => {
    if (!node.isText || !mark.isInSet(node.marks)) return
    const start = nodePos
    const end = nodePos + node.nodeSize
    if ((start <= clamped && end >= clamped) || (start < clamped && end >= clamped)) {
      from = start
      to = end
    }
  })
  if (from < 0) return null
  let grew = true
  while (grew) {
    grew = false
    doc.descendants((node, nodePos) => {
      if (!node.isText || !mark.isInSet(node.marks)) return
      const start = nodePos
      const end = nodePos + node.nodeSize
      if (end < from || start > to) return
      if (start < from || end > to) {
        from = Math.min(from, start)
        to = Math.max(to, end)
        grew = true
      }
    })
  }
  return { from, to, revealed: !!mark.attrs.revealed }
}
