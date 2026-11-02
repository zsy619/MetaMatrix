import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * 点击编辑区下方空白时，浏览器会把 DOM 光标放到占位行末尾，
 * ProseMirror 选区仍停在段首。此时 End 不再改变 DOM 选区，编辑器也就收不到位移。
 * 仅在这种错位时，把 ProseMirror 光标收到当前文本块末尾。
 */
export function caretDesyncedAtEnd(
  pmParentOffset: number,
  pmText: string,
  domOffset: number,
  domText: string,
): boolean {
  return pmText.length > 0 && domText === pmText && pmParentOffset === 0 && domOffset === pmText.length
}

export function syncCaretWhenEndIsNoop(view: EditorView): boolean {
  const sel = view.state.selection
  if (!sel.empty) return false
  const parent = sel.$from.parent
  if (!parent.isTextblock) return false
  const pmText = parent.textContent
  if (sel.$from.parentOffset !== 0 || !pmText) return false
  const dom = view.dom.ownerDocument.getSelection()
  if (!dom || dom.rangeCount === 0 || !dom.isCollapsed) return false
  const node = dom.anchorNode
  if (!node || !view.dom.contains(node)) return false
  const domText = node.nodeType === Node.TEXT_NODE ? node.textContent || '' : ''
  if (!caretDesyncedAtEnd(sel.$from.parentOffset, pmText, dom.anchorOffset, domText)) return false
  const end = sel.$from.end()
  if (end === sel.from) return false
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)).scrollIntoView())
  return true
}
