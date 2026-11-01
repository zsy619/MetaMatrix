import { escapeHtml, looksLikeHtml } from './itemsHtml.ts'

/** 空文档和纯文本都收成 TipTap 能打开的 HTML。 */
export function toEditorContent(value: string | undefined | null): string {
  const raw = value ?? ''
  if (!raw.trim()) return '<p></p>'
  if (looksLikeHtml(raw)) return raw
  return `<p>${escapeHtml(raw)}</p>`
}

/** 去掉标签间空白，避免 HTML 往返只差换行时误触发 setContent。 */
export function normalizeHtml(html: string): string {
  return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

/** 中文按字、英文按词。 */
export function countWords(raw: string): number {
  const text = raw.trim()
  if (!text) return 0
  const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const en = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return cn + en
}

export function rtePlaceholderText(
  placeholder: string,
  args: {
    editor: { isEmpty: boolean; state: { doc: { resolve: (pos: number) => { parent: { type: { name: string } } } } } }
    node: { type: { name: string }; textContent: string }
    pos: number
  },
): string {
  const custom = placeholder ?? ''
  if (!custom.trim()) return ''
  const feishu = custom === '请输入正文' || custom === '输入正文，或按 / 快速插入'
  const nodeEmpty = !args.node.textContent
  if (args.node.type.name === 'heading' && nodeEmpty) return '标题'
  if (args.editor.isEmpty) return feishu ? '输入正文，或按 / 快速插入' : custom
  if (!feishu || !nodeEmpty || args.node.type.name !== 'paragraph') return ''
  try {
    const parent = args.editor.state.doc.resolve(args.pos).parent
    if (parent.type.name === 'listItem' || parent.type.name === 'taskItem') return ''
  } catch {
    /* 位置失效时不展示 */
  }
  return '按 / 插入'
}
