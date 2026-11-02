import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

export type RteFindMatch = { from: number; to: number }

/** 单词字符。用于「全字匹配」判断。 */
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false
  return /[0-9A-Za-z\u00C0-\u024F\u4e00-\u9fff]/.test(ch)
}

/** 查找选项。regex 为真时 query 按正则解释。 */
export type RteFindOptions = {
  caseSensitive?: boolean
  wholeWord?: boolean
  /** 按正则解释查询串 */
  regex?: boolean
  /** 正则的多行模式 */
  multiline?: boolean
}

/**
 * 在文档文本节点内收集查询串的全部匹配（按节点内字面量搜索，不跨节点）。
 * opts.regex 为真时按正则匹配：先在每个块级容器（段落、标题、列表项、单元格）
 * 内把文本节点拼起来跑正则，因此 '标\s*题' 这类跨空白写法能命中。
 */
export function collectFindMatches(
  doc: PmNode,
  query: string,
  opts?: RteFindOptions,
): RteFindMatch[] {
  const qRaw = String(query ?? '')
  if (!qRaw) return []
  const caseSensitive = Boolean(opts?.caseSensitive)
  const wholeWord = Boolean(opts?.wholeWord)
  if (opts?.regex) {
    return collectRegexMatches(doc, qRaw, caseSensitive, wholeWord, Boolean(opts.multiline))
  }
  const q = caseSensitive ? qRaw : qRaw.toLowerCase()
  const matches: RteFindMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const rawText = node.text
    const text = caseSensitive ? rawText : rawText.toLowerCase()
    let idx = 0
    while (idx < text.length) {
      const found = text.indexOf(q, idx)
      if (found < 0) break
      const from = pos + found
      const to = pos + found + qRaw.length
      if (wholeWord) {
        const before = found > 0 ? rawText[found - 1] : ''
        const after = found + qRaw.length < rawText.length ? rawText[found + qRaw.length] : ''
        if (isWordChar(before) || isWordChar(after)) {
          idx = found + Math.max(1, qRaw.length)
          continue
        }
      }
      matches.push({ from, to })
      idx = found + Math.max(1, qRaw.length)
    }
  })
  return matches
}

/** 可以把文本拼起来的块级容器。 */
const BLOCK_CONTAINER_NAMES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'tableCell',
  'tableHeader',
  'blockquote',
  'codeBlock',
  'taskItem',
])

/** 正则查找：在每个块级容器内拼接文本跑正则，再把命中映射回文档位置。 */
function collectRegexMatches(
  doc: PmNode,
  pattern: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  multiline: boolean,
): RteFindMatch[] {
  let re: RegExp
  try {
    const flags = `g${caseSensitive ? '' : 'i'}${multiline ? 'm' : ''}`
    re = new RegExp(pattern, flags)
  } catch {
    // 非法正则不报错，直接没有匹配
    return []
  }
  const matches: RteFindMatch[] = []
  doc.descendants((container, containerPos) => {
    if (!BLOCK_CONTAINER_NAMES.has(container.type.name)) return
    // 收集容器内按顺序排列的文本节点，以及它们在文档中的绝对起点
    const parts: Array<{ text: string; start: number }> = []
    container.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      // descendants 的 pos 相对容器内容起点，容器内容在文档中的起点是 containerPos + 1
      parts.push({ text: node.text, start: containerPos + 1 + pos })
    })
    if (!parts.length) return
    const joined = parts.map((p) => p.text).join('')
    if (!joined) return
    // 每个字符在拼接串里的偏移 -> 所属文本节点与节点内偏移
    const ownerOf = (offset: number): { part: (typeof parts)[number]; inner: number } | null => {
      let acc = 0
      for (const part of parts) {
        const end = acc + part.text.length
        if (offset >= acc && offset < end) return { part, inner: offset - acc }
        acc = end
      }
      return null
    }
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(joined)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      const startOwner = ownerOf(m.index)
      const endOwner = ownerOf(m.index + m[0].length - 1)
      if (wholeWord) {
        const before = m.index > 0 ? joined[m.index - 1] : ''
        const after = joined[m.index + m[0].length] ?? ''
        if (isWordChar(before) || isWordChar(after)) {
          re.lastIndex = m.index + Math.max(1, m[0].length)
          continue
        }
      }
      // 只接受落在同一个文本节点内的匹配：替换时不会跨节点
      if (startOwner && endOwner && startOwner.part === endOwner.part) {
        const from = startOwner.part.start + startOwner.inner
        const to = from + m[0].length
        matches.push({ from, to })
      }
      re.lastIndex = m.index + Math.max(1, m[0].length)
    }
  })
  matches.sort((a, b) => a.from - b.from)
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
