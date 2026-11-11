import type { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'

const CAPTION_RENUMBER = 'captionRenumber'

/** 已经写成「图 N」的题注，在图片增删后按出现顺序重排。没有编号的题注不动。 */
export function renumberCaptionTransaction(state: EditorState): Transaction | null {
  const updates: Array<{ pos: number; attrs: Record<string, unknown> }> = []
  let imageNo = 0
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return
    const raw = String(node.attrs.caption || '').trim()
    if (!/^图\s*\d+/.test(raw)) return
    imageNo += 1
    const rest = raw.replace(/^图\s*\d+\s*[：:\-]?\s*/, '')
    const caption = rest ? `图 ${imageNo}：${rest}` : `图 ${imageNo}`
    if (caption !== raw) updates.push({ pos, attrs: { ...node.attrs, caption } })
  })
  if (!updates.length) return null
  let tr = state.tr
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index]!
    tr = tr.setNodeMarkup(update.pos, undefined, update.attrs)
  }
  tr.setMeta(CAPTION_RENUMBER, true)
  return tr
}

export function createCaptionRenumberPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      if (transactions.some((tr) => tr.getMeta(CAPTION_RENUMBER))) return null
      return renumberCaptionTransaction(state)
    },
  })
}

/**
 * 题注自动编号：图片 caption / data-caption →「图 N …」；
 * 表格：首行首格或紧随段落以「表」开头则规范为「表 N」。
 */
export function renumberCaptions(editor: Editor): { images: number; tables: number } {
  const { state } = editor
  let tr = state.tr
  let imgN = 0
  let tableN = 0
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      imgN += 1
      const raw = String(node.attrs.caption || node.attrs.title || '').trim()
      const rest = raw.replace(/^图\s*\d+\s*[：:\-]?\s*/, '')
      const caption = rest ? `图 ${imgN}：${rest}` : `图 ${imgN}`
      if (caption !== raw) {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption })
      }
    }
    if (node.type.name === 'table') {
      tableN += 1
    }
  })
  // 表格题注：找 table 后紧跟的段落若含「表」则重写；或前一段
  // 简化：给每个 table 写入 attrs.caption 若扩展支持；否则扫紧邻段落
  let tIdx = 0
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'table') return
    tIdx += 1
    const after = offset + node.nodeSize
    const next = state.doc.nodeAt(after)
    if (next && next.type.name === 'paragraph') {
      const text = next.textContent.trim()
      if (/^表/.test(text) || text === '' || /^表\s*\d+/.test(text)) {
        const rest = text.replace(/^表\s*\d+\s*[：:\-]?\s*/, '')
        const nextText = rest ? `表 ${tIdx}：${rest}` : `表 ${tIdx}`
        if (nextText !== text && next.content.size >= 0) {
          const from = after + 1
          const to = after + next.nodeSize - 1
          tr = tr.insertText(nextText, from, to)
        }
      }
    }
  })
  if (tr.docChanged) editor.view.dispatch(tr)
  return { images: imgN, tables: tableN }
}
