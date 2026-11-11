import type { Editor } from '@tiptap/core'
import { pinyin } from 'pinyin-pro'

export type RubyPiece = {
  text: string
  /** 空字符串表示这段不注音（标点、英文、数字）。 */
  ruby: string
}

/**
 * 把一段文字拆成注音片段。汉字用分词后的拼音（带声调），连续的非汉字留在一起。
 * 多音字按词来读，例如「银行」是 yín háng，「重庆」是 chóng qìng。
 */
export function rubyPieces(text: string): RubyPiece[] {
  const raw = String(text ?? '')
  if (!raw) return []
  const tokens = pinyin(raw, { type: 'all', toneType: 'symbol', nonZh: 'consecutive' })
  const pieces = tokens.map((token) => ({
    text: token.origin,
    ruby: token.isZh && token.result ? token.result : '',
  }))
  if (pieces.map((piece) => piece.text).join('') !== raw) return []
  return pieces
}

/** 给当前选区里的每个汉字加上自动拼音。返回实际注音的字数。 */
export function applyAutoRuby(editor: Editor): number {
  const { state } = editor
  const { from, to, empty } = state.selection
  const markType = state.schema.marks.ruby
  if (empty || from >= to || !markType) return 0
  const chunks: { text: string; from: number }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    if (end <= start) return
    const text = node.text.slice(start - pos, end - pos)
    const prev = chunks[chunks.length - 1]
    if (prev && prev.from + prev.text.length === start) prev.text += text
    else chunks.push({ text, from: start })
  })
  let tr = state.tr.removeMark(from, to, markType)
  let marked = 0
  for (const chunk of chunks) {
    const pieces = rubyPieces(chunk.text)
    let cursor = chunk.from
    for (const piece of pieces) {
      const next = cursor + piece.text.length
      if (piece.ruby) {
        tr = tr.addMark(cursor, next, markType.create({ annotation: piece.ruby }))
        marked += [...piece.text].length
      }
      cursor = next
    }
  }
  if (!marked || !tr.steps.length) return 0
  editor.view.dispatch(tr)
  return marked
}
