import type { Editor } from '@tiptap/core'
import { Fragment, type Mark, type Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { authorColor } from './rteCommentThreads'

export type SuggestionAuthor = { id: string; name: string }

export type SuggestionKind = 'insert' | 'delete'

export type SuggestionRange = {
  id: string
  kind: SuggestionKind
  from: number
  to: number
  authorId: string
  authorName: string
  createdAt: string
}

const SUGGESTION_META = 'suggestion-internal'

export function suggestionColor(authorId: string): string {
  return authorColor(authorId)
}

function newAttrs(author: SuggestionAuthor, reuse?: { id: string; createdAt: string }) {
  return {
    id: reuse?.id || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    authorId: author.id || 'local',
    authorName: author.name || '我',
    createdAt: reuse?.createdAt || String(Date.now()),
  }
}

function fragmentHasBlock(fragment: Fragment): boolean {
  let block = false
  fragment.forEach((node) => {
    if (block) return
    if (node.isBlock) block = true
    else if (node.content.size && fragmentHasBlock(node.content)) block = true
  })
  return block
}

function asReplaceStep(step: { jsonID?: string; from?: number; to?: number; slice?: ReplaceStep['slice'] } | null | undefined): ReplaceStep | null {
  if (!step || step.jsonID !== 'replace' || typeof step.from !== 'number' || typeof step.to !== 'number' || !step.slice) {
    return null
  }
  return step as ReplaceStep
}

function isInlineReplace(step: ReplaceStep, doc: PMNode): boolean {
  if (step.slice.openStart || step.slice.openEnd) return false
  if (step.from < 0 || step.to > doc.content.size || step.from > step.to) return false
  if (step.to > step.from) {
    let slice
    try {
      slice = doc.slice(step.from, step.to)
    } catch {
      return false
    }
    if (slice.openStart || slice.openEnd || fragmentHasBlock(slice.content)) return false
  }
  return !fragmentHasBlock(step.slice.content)
}

function markTextFragment(fragment: Fragment, mark: Mark): Fragment {
  const children: PMNode[] = []
  fragment.forEach((node) => {
    if (node.isText) children.push(node.mark(mark.addToSet(node.marks)))
    else children.push(node.copy(markTextFragment(node.content, mark)))
  })
  return Fragment.from(children) ?? fragment
}

function adjacentMark(
  doc: PMNode,
  pos: number,
  kind: SuggestionKind,
  authorId: string,
  side: 'before' | 'after',
): { id: string; createdAt: string } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  const node = side === 'before' ? $pos.nodeBefore : $pos.nodeAfter
  if (!node?.isText) return null
  const markName = kind === 'insert' ? 'suggestionInsert' : 'suggestionDelete'
  const mark = node.marks.find((item) => item.type.name === markName && item.attrs.authorId === authorId)
  if (!mark?.attrs.id) return null
  return { id: String(mark.attrs.id), createdAt: String(mark.attrs.createdAt || '') }
}

type Segment = { from: number; to: number; action: 'own-insert' | 'delete' | 'skip' }

function deletionSegments(doc: PMNode, from: number, to: number, authorId: string): Segment[] {
  const segments: Segment[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    if (end <= start) return
    const own = node.marks.some(
      (mark) => mark.type.name === 'suggestionInsert' && String(mark.attrs.authorId) === authorId,
    )
    const already = node.marks.some((mark) => mark.type.name === 'suggestionDelete')
    segments.push({
      from: start,
      to: end,
      action: own ? 'own-insert' : already ? 'skip' : 'delete',
    })
  })
  return segments
}

function applyInlineSuggestion(tr: Transaction, step: ReplaceStep, author: SuggestionAuthor) {
  const schema = tr.doc.type.schema
  const insertType = schema.marks.suggestionInsert
  const deleteType = schema.marks.suggestionDelete
  if (!insertType || !deleteType) return
  const from = step.from
  const to = step.to
  const segments = to > from ? deletionSegments(tr.doc, from, to, author.id) : []
  let insertedSize = 0
  if (step.slice.content.size) {
    const reuse = adjacentMark(tr.doc, from, 'insert', author.id, 'before')
    const mark = insertType.create(newAttrs(author, reuse ?? undefined))
    const fragment = markTextFragment(step.slice.content, mark)
    tr.insert(from, fragment)
    insertedSize = fragment.size
  }
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]!
    const start = segment.from + insertedSize
    const end = segment.to + insertedSize
    if (segment.action === 'own-insert') {
      tr.delete(start, end)
      continue
    }
    if (segment.action === 'delete') {
      const reuse = adjacentMark(tr.doc, start, 'delete', author.id, 'before')
      tr.addMark(start, end, deleteType.create(newAttrs(author, reuse ?? undefined)))
    }
  }
  const caret = Math.max(1, Math.min(from + insertedSize, tr.doc.content.size))
  try {
    tr.setSelection(TextSelection.create(tr.doc, caret))
  } catch {
    /* 选区落在原子上时保留映射结果 */
  }
}

/** 把一次纯文本替换改写成插入/删除建议。结构步骤原样放过（返回 null）。 */
export function trackTransaction(
  state: EditorState,
  transaction: Transaction,
  author: SuggestionAuthor,
): Transaction | null {
  if (!transaction.docChanged || transaction.getMeta(SUGGESTION_META)) return null
  if (isHistoryTransaction(transaction)) return null
  if (!state.schema.marks.suggestionInsert || !state.schema.marks.suggestionDelete) return null
  const tr = state.tr
  try {
    for (const step of transaction.steps) {
      const mapped = asReplaceStep(step.map(tr.mapping) as ReplaceStep | null)
      if (!mapped || !isInlineReplace(mapped, tr.doc)) return null
      if (mapped.from === mapped.to && mapped.slice.content.size === 0) continue
      applyInlineSuggestion(tr, mapped, author)
    }
  } catch {
    return null
  }
  if (!tr.docChanged) return null
  tr.setMeta(SUGGESTION_META, true)
  if (transaction.storedMarks) tr.setStoredMarks(transaction.storedMarks)
  tr.scrollIntoView()
  return tr
}

export function collectSuggestionRanges(doc: PMNode): SuggestionRange[] {
  const ranges: SuggestionRange[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      const kind: SuggestionKind | null =
        mark.type.name === 'suggestionInsert' ? 'insert' : mark.type.name === 'suggestionDelete' ? 'delete' : null
      if (!kind) continue
      const next: SuggestionRange = {
        id: String(mark.attrs.id || ''),
        kind,
        from: pos,
        to: pos + node.nodeSize,
        authorId: String(mark.attrs.authorId || ''),
        authorName: String(mark.attrs.authorName || ''),
        createdAt: String(mark.attrs.createdAt || ''),
      }
      const prev = ranges[ranges.length - 1]
      if (
        prev &&
        prev.id === next.id &&
        prev.kind === next.kind &&
        prev.to === next.from
      ) {
        prev.to = next.to
      } else {
        ranges.push(next)
      }
    }
  })
  return ranges
}

export function applySuggestionDecision(
  state: EditorState,
  mode: 'accept' | 'reject',
  id?: string,
): Transaction | null {
  const ranges = collectSuggestionRanges(state.doc)
    .filter((range) => !id || range.id === id)
    .sort((a, b) => b.from - a.from)
  if (!ranges.length) return null
  const tr = state.tr
  const insertType = state.schema.marks.suggestionInsert
  const deleteType = state.schema.marks.suggestionDelete
  for (const range of ranges) {
    const remove = mode === 'accept' ? range.kind === 'delete' : range.kind === 'insert'
    if (remove) tr.delete(range.from, range.to)
    else if (range.kind === 'insert' && insertType) tr.removeMark(range.from, range.to, insertType)
    else if (deleteType) tr.removeMark(range.from, range.to, deleteType)
  }
  if (!tr.docChanged) return null
  tr.setMeta(SUGGESTION_META, true)
  return tr
}

export function dispatchSuggestionDecision(editor: Editor, mode: 'accept' | 'reject', id?: string): boolean {
  const tr = applySuggestionDecision(editor.state, mode, id)
  if (!tr) return false
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

function spanEnd(html: string, from: number): number {
  const re = /<\/?span\b[^>]*>/gi
  re.lastIndex = from
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) return match.index + match[0].length
  }
  return -1
}

/** 接受后的正文：去掉删除建议，插入建议只留文字。拒绝则相反。 */
export function htmlWithoutSuggestionMarks(html: string, mode: 'accept' | 'reject'): string {
  const re = /<span\b[^>]*\bdata-suggestion="(insert|delete)"[^>]*>/gi
  let cursor = 0
  let out = ''
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const kind = match[1] === 'insert' ? 'insert' : 'delete'
    const end = spanEnd(html, match.index + match[0].length)
    if (end < 0) break
    const innerStart = match.index + match[0].length
    const innerEnd = html.lastIndexOf('</span>', end)
    const inner = innerEnd >= innerStart ? html.slice(innerStart, innerEnd) : ''
    out += html.slice(cursor, match.index)
    const keep = mode === 'accept' ? kind === 'insert' : kind === 'delete'
    if (keep) out += htmlWithoutSuggestionMarks(inner, mode)
    cursor = end
    re.lastIndex = end
  }
  out += html.slice(cursor)
  return out
}

export function htmlWithSuggestionsAccepted(html: string): string {
  return htmlWithoutSuggestionMarks(html || '', 'accept')
}
