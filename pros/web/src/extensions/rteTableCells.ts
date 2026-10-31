import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { mergeAttributes } from '@tiptap/core'

function parseStyleColor(el: HTMLElement, prop: 'backgroundColor' | 'borderColor') {
  const inline = el.style?.[prop]
  if (inline) return inline
  if (prop === 'backgroundColor') {
    return el.getAttribute('data-bg') || el.getAttribute('bgcolor') || null
  }
  return el.getAttribute('data-border-color') || null
}

function buildCellStyle(attrs: {
  backgroundColor?: string | null
  borderColor?: string | null
  borderStyle?: string | null
  verticalAlign?: string | null
}) {
  const parts: string[] = []
  if (attrs.backgroundColor) parts.push(`background-color: ${attrs.backgroundColor}`)
  if (attrs.borderColor) parts.push(`border-color: ${attrs.borderColor}`)
  if (attrs.borderStyle) parts.push(`border-style: ${attrs.borderStyle}`)
  if (attrs.verticalAlign) parts.push(`vertical-align: ${attrs.verticalAlign}`)
  return parts.length ? parts.join('; ') : null
}

const extraCellAttrs = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => parseStyleColor(el, 'backgroundColor'),
    renderHTML: () => ({}),
  },
  borderColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => parseStyleColor(el, 'borderColor'),
    renderHTML: () => ({}),
  },
  borderStyle: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) =>
      el.getAttribute('data-border-style') || el.style?.borderStyle || null,
    renderHTML: () => ({}),
  },
  verticalAlign: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) =>
      el.getAttribute('data-valign') || el.style?.verticalAlign || null,
    renderHTML: () => ({}),
  },
}

function renderCellHTML(
  tag: 'td' | 'th',
  HTMLAttributes: Record<string, unknown>,
  optionsHTMLAttributes: Record<string, unknown>,
) {
  const backgroundColor = (HTMLAttributes.backgroundColor as string) || null
  const borderColor = (HTMLAttributes.borderColor as string) || null
  const borderStyle = (HTMLAttributes.borderStyle as string) || null
  const verticalAlign = (HTMLAttributes.verticalAlign as string) || null
  const {
    backgroundColor: _bg,
    borderColor: _bc,
    borderStyle: _bs,
    verticalAlign: _va,
    style: prevStyle,
    ...rest
  } = HTMLAttributes as Record<string, unknown> & {
    backgroundColor?: string
    borderColor?: string
    borderStyle?: string
    verticalAlign?: string
    style?: string
  }
  const style = buildCellStyle({ backgroundColor, borderColor, borderStyle, verticalAlign })
  const attrs: Record<string, unknown> = { ...rest }
  if (backgroundColor) attrs['data-bg'] = backgroundColor
  if (borderColor) attrs['data-border-color'] = borderColor
  if (borderStyle) attrs['data-border-style'] = borderStyle
  if (verticalAlign) attrs['data-valign'] = verticalAlign
  const mergedStyle = [prevStyle, style].filter(Boolean).join('; ')
  if (mergedStyle) attrs.style = mergedStyle
  return [tag, mergeAttributes(optionsHTMLAttributes, attrs), 0] as const
}

/** 表格单元格：背景色 / 边框色 / 边框样式 / 垂直对齐 */
export const RteTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttrs,
    }
  },
  renderHTML({ HTMLAttributes }) {
    return renderCellHTML('td', HTMLAttributes, this.options.HTMLAttributes) as any
  },
})

export const RteTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttrs,
    }
  },
  renderHTML({ HTMLAttributes }) {
    return renderCellHTML('th', HTMLAttributes, this.options.HTMLAttributes) as any
  },
})

export const TABLE_CELL_BG_PRESETS = [
  { label: '无', value: '' },
  { label: '浅灰', value: '#f3f4f6' },
  { label: '浅蓝', value: '#eff6ff' },
  { label: '浅绿', value: '#ecfdf5' },
  { label: '浅黄', value: '#fefce8' },
  { label: '浅橙', value: '#fff7ed' },
  { label: '浅红', value: '#fef2f2' },
  { label: '白', value: '#ffffff' },
]

export const TABLE_BORDER_STYLE_PRESETS = [
  { label: '实线', value: 'solid' },
  { label: '虚线', value: 'dashed' },
  { label: '点线', value: 'dotted' },
  { label: '双线', value: 'double' },
  { label: '无边框', value: 'none' },
]
