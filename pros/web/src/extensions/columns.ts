import { Node, mergeAttributes } from '@tiptap/core'

export type ColumnCount = 2 | 3 | 4 | 5 | 6

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /** 插入分栏；ratios 可选，如 [1,2] → 1:2 */
      setColumns: (cols: ColumnCount, ratios?: number[]) => ReturnType
    }
  }
}

function clampCols(n: number): ColumnCount {
  if (n >= 6) return 6
  if (n >= 5) return 5
  if (n >= 4) return 4
  if (n >= 3) return 3
  return 2
}

/** 解析并校验比例；均分或非法时返回 null（走等宽 class） */
function normalizeRatios(
  cols: ColumnCount,
  ratios?: number[] | string | null,
): number[] | null {
  let arr: number[] | null = null
  if (typeof ratios === 'string' && ratios.trim()) {
    arr = ratios
      .split(':')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  } else if (Array.isArray(ratios)) {
    arr = ratios.filter((n) => Number.isFinite(n) && n > 0)
  }
  if (!arr || arr.length !== cols) return null
  if (arr.every((n) => n === arr![0])) return null
  return arr
}

function ratiosToAttr(ratios: number[]): string {
  return ratios.join(':')
}

function ratiosToGrid(ratios: number[]): string {
  return ratios.map((r) => `${r}fr`).join(' ')
}

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: 'rte-column',
        // 内联保底：即使 scoped/:deep 失效，空栏仍可见浅蓝虚线框
        style:
          'min-width:0;min-height:72px;padding:10px 12px;border:1px dashed #91b3fa;border-radius:6px;background:#f0f5ff;box-sizing:border-box;',
      }),
      0,
    ]
  },
})

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,6}',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      cols: {
        default: 2,
        parseHTML: (el: HTMLElement) =>
          clampCols(parseInt(el.getAttribute('data-cols') || '2', 10)),
        renderHTML: (attrs: { cols?: number }) => ({
          'data-cols': String(clampCols(attrs.cols || 2)),
        }),
      },
      ratios: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const raw = (el.getAttribute('data-ratios') || '').trim()
          return raw || null
        },
        renderHTML: (attrs: { ratios?: string | null }) => {
          if (!attrs.ratios) return {}
          return { 'data-ratios': String(attrs.ratios) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const cols = clampCols(node.attrs.cols || 2)
    const ratios = normalizeRatios(cols, node.attrs.ratios)
    const grid = ratios
      ? ratiosToGrid(ratios)
      : 'repeat(' + String(cols) + ', minmax(0, 1fr))'
    const style = [
      'display:grid',
      `grid-template-columns:${grid}`,
      'gap:16px',
      'margin:12px 0',
      'padding:10px',
      'border:1px dashed #c9cdd4',
      'border-radius:8px',
      'min-height:88px',
      'background:#fafbfc',
      'box-sizing:border-box',
    ].join(';')
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        'data-cols': String(cols),
        ...(ratios ? { 'data-ratios': ratiosToAttr(ratios) } : {}),
        class: `rte-columns rte-columns-${cols}`,
        style,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      /**
       * 用 commands.insertContent（与 pageBreak/forms 同构）。
       * 勿改回 schema createAndFill + tr.replaceWith + dispatch：
       * TipTap v3 chain 的 dispatch 是 no-op，且 replaceWith 用 editor.state.selection
       * 而非 chainable state，工具栏 mousedown.prevent + focus 链下易插失败/结构非法。
       */
      setColumns:
        (cols: ColumnCount, ratios?: number[]) =>
        ({ commands }) => {
          const c = clampCols(cols)
          const r = normalizeRatios(c, ratios)
          const emptyPara = { type: 'paragraph' }
          const columnNodes = Array.from({ length: c }, () => ({
            type: 'column',
            content: [emptyPara],
          }))
          return commands.insertContent({
            type: this.name,
            attrs: r
              ? { cols: c, ratios: ratiosToAttr(r) }
              : { cols: c },
            content: columnNodes,
          })
        },
    }
  },
})
