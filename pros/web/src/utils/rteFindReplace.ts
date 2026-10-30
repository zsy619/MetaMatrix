import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

export type RteFindMatch = { from: number; to: number }

/**
 * 在文档文本节点内收集查询串的全部匹配（按节点内字面量搜索，不跨节点）。
 */
export function collectFindMatches(
  doc: PmNode,
  query: string,
  opts?: { caseSensitive?: boolean },
): RteFindMatch[] {
  const qRaw = String(query ?? '')
  if (!qRaw) return []
  const caseSensitive = Boolean(opts?.caseSensitive)
  const q = caseSensitive ? qRaw : qRaw.toLowerCase()
  const matches: RteFindMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = caseSensitive ? node.text : node.text.toLowerCase()
    let idx = 0
    while (idx < text.length) {
      const found = text.indexOf(q, idx)
      if (found < 0) break
      matches.push({ from: pos + found, to: pos + found + qRaw.length })
      idx = found + Math.max(1, qRaw.length)
    }
  })
  return matches
}

/** 从当前选区附近选择下一个匹配（含循环） */
export function pickNextMatchIndex(
  matches: RteFindMatch[],
  fromPos: number,
  direction: 1 | -1 = 1,
): number {
  if (!matches.length) return -1
  if (direction === 1) {
    const i = matches.findIndex((m) => m.from >= fromPos)
    return i >= 0 ? i : 0
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].to <= fromPos) return i
  }
  return matches.length - 1
}

export function selectFindMatch(editor: Editor, match: RteFindMatch): boolean {
  const { state, view } = editor
  const $from = state.doc.resolve(match.from)
  const $to = state.doc.resolve(match.to)
  const tr = state.tr.setSelection(TextSelection.between($from, $to)).scrollIntoView()
  view.dispatch(tr)
  view.focus()
  return true
}

/** 替换当前选中匹配；若选区恰好等于该匹配则替换，否则先选中再替换 */
export function replaceFindMatch(
  editor: Editor,
  match: RteFindMatch,
  replacement: string,
): boolean {
  const { state, view } = editor
  const { from, to } = state.selection
  const tr =
    from === match.from && to === match.to
      ? state.tr.insertText(replacement, match.from, match.to)
      : state.tr.insertText(replacement, match.from, match.to)
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return true
}

/** 自后向前全部替换，避免偏移错位 */
export function replaceAllFindMatches(
  editor: Editor,
  matches: RteFindMatch[],
  replacement: string,
): number {
  if (!matches.length) return 0
  const { state, view } = editor
  let tr = state.tr
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    tr = tr.insertText(replacement, m.from, m.to)
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return matches.length
}
