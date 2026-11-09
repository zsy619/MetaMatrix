import type { Editor } from '@tiptap/core'

/**
 * 一次事务清掉行内标记、块级样式和段落属性。
 * 工具栏「清除格式」和 Ctrl+\ 都走这里，撤销一次就能回到清之前。
 */
export function clearEditorFormat(editor: Editor): boolean {
  return editor
    .chain()
    .focus()
    .unsetAllMarks()
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
