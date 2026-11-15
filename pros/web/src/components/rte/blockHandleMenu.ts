/** 左侧块菜单：类型图标格在上，已有能力按组排在下面。 */

export type BlockHandleTurn =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'code'
  | 'quote'
  | 'hr'
  | 'info'
  | 'warn'
  | 'success'
  | 'error'

export type BlockHandleAlign = 'left' | 'center' | 'right' | 'justify'

export type BlockHandleFlyout = 'layout' | 'color' | 'callout'

export type BlockHandleRow = {
  id: string
  label?: string
  flyout?: BlockHandleFlyout
  danger?: boolean
}

/** 两行图标：正文和标题、列表，以及代码、引用、分隔线、提示。 */
export const BLOCK_HANDLE_TYPE_GRID: ReadonlyArray<{
  id: BlockHandleTurn
  label: string
  glyph: string
}> = [
  { id: 'paragraph', label: '正文', glyph: 'T' },
  { id: 'h1', label: '标题 1', glyph: 'H1' },
  { id: 'h2', label: '标题 2', glyph: 'H2' },
  { id: 'h3', label: '标题 3', glyph: 'H3' },
  { id: 'h4', label: '标题 4', glyph: 'H4' },
  { id: 'ordered', label: '有序列表', glyph: '1.' },
  { id: 'bullet', label: '无序列表', glyph: '•' },
  { id: 'task', label: '任务列表', glyph: '☑' },
  { id: 'code', label: '代码块', glyph: '</>' },
  { id: 'quote', label: '引用', glyph: '“' },
  { id: 'hr', label: '分隔线', glyph: '—' },
  { id: 'info', label: '提示', glyph: '!' },
]

export const BLOCK_HANDLE_INDENTS = [
  { id: 1 as const, label: '增加缩进' },
  { id: -1 as const, label: '减少缩进' },
]

export const BLOCK_HANDLE_ALIGNS: ReadonlyArray<{ id: BlockHandleAlign; label: string }> = [
  { id: 'left', label: '左对齐' },
  { id: 'center', label: '居中' },
  { id: 'right', label: '右对齐' },
  { id: 'justify', label: '两端对齐' },
]

export const BLOCK_HANDLE_CALLOUTS: ReadonlyArray<{ id: BlockHandleTurn; label: string }> = [
  { id: 'info', label: '提示' },
  { id: 'warn', label: '警告' },
  { id: 'success', label: '成功' },
  { id: 'error', label: '错误' },
]

/** 图标格下面的操作。分隔行没有文案。 */
export const BLOCK_HANDLE_ROWS: readonly BlockHandleRow[] = [
  { id: 'layout', label: '缩进和对齐', flyout: 'layout' },
  { id: 'color', label: '颜色', flyout: 'color' },
  { id: 'callout', label: '提示样式', flyout: 'callout' },
  { id: 'sep-1' },
  { id: 'comment', label: '评论' },
  { id: 'cut', label: '剪切' },
  { id: 'clipboard', label: '复制' },
  { id: 'duplicate', label: '创建副本' },
  { id: 'up', label: '上移' },
  { id: 'down', label: '下移' },
  { id: 'delete', label: '删除', danger: true },
  { id: 'sep-2' },
  { id: 'insert', label: '在下方添加' },
]

/** 当前顶层块对应图标格里的哪一项。对不上时返回空字符串。 */
export function blockFaceFromNode(
  name: string,
  attrs?: { level?: unknown; variant?: unknown },
): string {
  if (name === 'heading') {
    const level = Number(attrs?.level) || 1
    if (level >= 1 && level <= 4) return `h${level}`
    return ''
  }
  if (name === 'bulletList') return 'bullet'
  if (name === 'orderedList') return 'ordered'
  if (name === 'taskList') return 'task'
  if (name === 'blockquote') return 'quote'
  if (name === 'codeBlock') return 'code'
  if (name === 'horizontalRule') return 'hr'
  if (name === 'callout') {
    const variant = String(attrs?.variant || 'info')
    if (variant === 'warn' || variant === 'success' || variant === 'error') return variant
    return 'info'
  }
  if (name === 'paragraph') return 'paragraph'
  return ''
}
