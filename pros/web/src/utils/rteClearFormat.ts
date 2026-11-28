import type { Editor } from '@tiptap/core'

/**
 * 一次事务清掉行内标记、块级样式和段落属性。
 * 工具栏「清除格式」和 Ctrl+\ 都走这里，撤销一次就能回到清之前。
 */
const KEEP_MARKS = new Set(['link', 'commentAnchor'])

/** 清字形、颜色、高亮、缩进和标题样式。链接、评论锚点、图片和题注留下。 */
export function clearEditorFormat(editor: Editor): boolean {
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { from, to } = state.selection
      if (from === to) return true
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return
        for (const mark of node.marks) {
          if (!KEEP_MARKS.has(mark.type.name)) tr.removeMark(pos, pos + node.nodeSize, mark.type)
        }
      })
      return true
    })
    .clearNodes()
    .command(({ tr }) => {
      const { from, to } = tr.selection
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          indent: 0,
          marginTop: null,
          marginBottom: null,
          textIndent: null,
          dir: null,
          textAlign: null,
          dropCap: null,
        })
      })
      return true
    })
    .run()
}
