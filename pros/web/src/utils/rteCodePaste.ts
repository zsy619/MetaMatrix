/**
 * 代码块粘贴处理。
 *
 * 全局 handlePaste 会把纯文本按 Markdown 解析成 HTML 再 insertContent，
 * 而代码块是纯文本节点（text*），块级 HTML 插不进去，粘贴会"落不到代码框里"。
 * 这里把代码块的粘贴单独摘出来：一律按原文逐字插入，保留换行与缩进。
 */
import type { EditorView } from '@tiptap/pm/view'

/** 归一化换行，去掉 Windows 的 \r。 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 剪贴板里只有富文本时（text/plain 为空），从 HTML 抽纯文本。 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const text = tmp.textContent || tmp.innerText || ''
  return normalizeNewlines(text)
}

/** 取剪贴板纯文本：优先 text/plain，其次从 HTML 里剥。 */
export function clipboardPlainText(plain: string, html: string): string {
  if (plain) return normalizeNewlines(plain)
  return htmlToPlainText(html)
}

/** 光标是否落在代码块里（含嵌套在表格单元格中的代码块）。 */
export function selectionInCodeBlock(view: EditorView): boolean {
  const { $from } = view.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'codeBlock') return true
  }
  return false
}

/**
 * 把文本逐字写进当前选区。
 * 代码块里换行要留在同一个文本节点里，所以用事务 insertText，
 * 不用 insertContent（后者会按 HTML 解析，换行会被拆成多个节点）。
 */
export function insertTextAtSelection(view: EditorView, text: string): boolean {
  if (!text) return false
  const { state, dispatch } = view
  const { from, to } = state.selection
  const tr = state.tr.insertText(text, from, to)
  dispatch(tr)
  view.focus()
  return true
}

/** 代码块粘贴入口：命中则逐字插入并返回 true。 */
export function pasteIntoCodeBlock(
  view: EditorView,
  plain: string,
  html: string,
): boolean {
  if (!selectionInCodeBlock(view)) return false
  const text = clipboardPlainText(plain, html)
  if (!text) return false
  return insertTextAtSelection(view, text)
}
