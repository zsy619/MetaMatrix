import type { Editor } from '@tiptap/core'

/**
 * 选区格式应用（选区浮动工具条与顶部工具栏共用）。
 *
 * 说明：TipTap 的 setMark / updateAttributes 语义天然覆盖「选区里的所有段落」，
 * 所以跨段落选区时一次调用就会对选区覆盖的每个段落生效，这里只做统一封装，
 * 避免各处重复造命令。
 */

type MaybeEditor = Editor | undefined | null

const CN_FONT_SIZES: Record<string, string> = {
  初号: '42pt',
  小初: '36pt',
  一号: '26pt',
  小一: '24pt',
  二号: '22pt',
  小二: '18pt',
  三号: '16pt',
  小三: '15pt',
  四号: '14pt',
  小四: '12pt',
  五号: '10.5pt',
  小五: '9pt',
  六号: '7.5pt',
  小六: '6.5pt',
  七号: '5.5pt',
  八号: '5pt',
}

/** 「小四」「12」「12pt」都收成编辑器能写上的字号。空串表示取消字号。 */
export function resolveFontSizeToken(raw: string): string {
  const text = String(raw ?? '').trim().replace(/磅$/, '')
  if (!text || text === '默认') return ''
  if (CN_FONT_SIZES[text]) return CN_FONT_SIZES[text]
  if (/^\d+(\.\d+)?$/.test(text)) return `${text}pt`
  if (/^\d+(\.\d+)?(px|pt|em|rem)$/.test(text)) return text
  return text
}

/** 应用字号（空串 = 取消字号）。跨段落选区时所有选中段落一起生效。 */
export function applyFontSizeToSelection(editor: MaybeEditor, size: string): boolean {
  if (!editor || editor.isDestroyed) return false
  const next = resolveFontSizeToken(size)
  if (!next) editor.chain().focus().unsetFontSize().run()
  else editor.chain().focus().setFontSize(next).run()
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
