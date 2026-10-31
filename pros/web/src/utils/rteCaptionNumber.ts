import type { Editor } from '@tiptap/core'

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
