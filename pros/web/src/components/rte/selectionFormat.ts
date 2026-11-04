import type { Editor } from '@tiptap/core'

/**
 * 选区格式应用（选区浮动工具条与顶部工具栏共用）。
 *
 * 说明：TipTap 的 setMark / updateAttributes 语义天然覆盖「选区里的所有段落」，
 * 所以跨段落选区时一次调用就会对选区覆盖的每个段落生效，这里只做统一封装，
 * 避免各处重复造命令。
 */

type MaybeEditor = Editor | undefined | null

/** 应用字号（空串 = 取消字号）。跨段落选区时所有选中段落一起生效。 */
export function applyFontSizeToSelection(editor: MaybeEditor, size: string): boolean {
  if (!editor || editor.isDestroyed) return false
  if (!size) editor.chain().focus().unsetFontSize().run()
  else editor.chain().focus().setFontSize(size).run()
  return true
}

/** 应用字体（空串 = 取消字体）。跨段落选区时所有选中段落一起生效。 */
export function applyFontFamilyToSelection(editor: MaybeEditor, family: string): boolean {
  if (!editor || editor.isDestroyed) return false
  if (!family) editor.chain().focus().unsetFontFamily().run()
  else editor.chain().focus().setFontFamily(family).run()
  return true
}

/** 应用对齐（段落属性）。跨段落选区时所有选中段落一起生效。 */
export function applyTextAlignToSelection(
  editor: MaybeEditor,
  align: 'left' | 'center' | 'right' | 'justify',
): boolean {
  if (!editor || editor.isDestroyed) return false
  editor.chain().focus().setTextAlign(align).run()
  return true
}
