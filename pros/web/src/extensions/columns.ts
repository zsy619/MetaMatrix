import { Node, mergeAttributes } from '@tiptap/core'
import { Fragment, NodeRange, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, TextSelection, type Transaction } from '@tiptap/pm/state'

export type ColumnCount = 2 | 3 | 4 | 5 | 6

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /** 插入分栏；ratios 可选，如 [1,2] → 1:2 */
      setColumns: (cols: ColumnCount, ratios?: number[]) => ReturnType
      /** 取消分栏，各栏文字按顺序回到正文。 */
      unsetColumns: () => ReturnType
      /** 光标移到相邻栏。onlyAtEdge 为真时，只有贴着栏首或栏尾才移动。 */
      focusColumn: (dir: 1 | -1, onlyAtEdge?: boolean) => ReturnType
      /** 栏首退格：把这段接到上一栏末尾。 */
      joinColumnBackward: () => ReturnType
    }
  }
}

function numAttr(name: string, key: string, fallback: number, min: number, max: number) {
  return {
    default: fallback,
    parseHTML: (el: HTMLElement) => clampNum(el.getAttribute(name), fallback, min, max),
    renderHTML: (attrs: Record<string, unknown>) => ({
      [name]: String(clampNum(attrs[key], fallback, min, max)),
    }),
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

function isEmptyParagraph(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0
}

function blankParagraph(doc: PMNode): PMNode {
  return doc.type.schema.nodes.paragraph!.create()
}

function columnContents(node: PMNode): PMNode[][] {
  const columns: PMNode[][] = []
  node.forEach((column) => {
    const blocks: PMNode[] = []
    column.forEach((block) => blocks.push(block))
    columns.push(blocks)
  })
  return columns
}

/** 减少栏数时，多出来的块按顺序接到最后一栏，空段不占位。 */
export function fitColumnBlocks(columns: PMNode[][], cols: number, blank: PMNode): PMNode[][] {
  const next = columns.slice(0, cols).map((blocks) => blocks.slice())
  while (next.length < cols) next.push([blank.type.create()])
  if (columns.length > cols) {
    const overflow = columns.slice(cols).flat().filter((block) => !isEmptyParagraph(block))
    const kept = (next[cols - 1] ?? []).filter((block) => !isEmptyParagraph(block))
    next[cols - 1] = kept.length || overflow.length ? [...kept, ...overflow] : [blank.type.create()]
  }
  return next.map((blocks) => (blocks.length ? blocks : [blank.type.create()]))
}

/** 选中的块按顺序摊进各栏。多出来的块从前面的栏开始，每栏至少有一块（块数够的时候）。 */
export function distributeBlocks(blocks: PMNode[], cols: number, blank: PMNode): PMNode[][] {
  const count = Math.max(0, Math.floor(cols))
  const buckets: PMNode[][] = Array.from({ length: count }, () => [])
  if (!blocks.length || !count) return buckets.map(() => [blank.type.create()])
  const base = Math.floor(blocks.length / count)
  const extra = blocks.length % count
  let cursor = 0
  for (let col = 0; col < count; col += 1) {
    const take = base + (col < extra ? 1 : 0)
    buckets[col] = blocks.slice(cursor, cursor + take)
    cursor += take
  }
  return buckets.map((bucket) => (bucket.length ? bucket : [blank.type.create()]))
}

function columnsAttrs(cols: ColumnCount, ratios?: number[] | string | null) {
  const normalized = normalizeRatios(cols, ratios)
  return normalized ? { cols, ratios: ratiosToAttr(normalized) } : { cols, ratios: null }
}

const FRAME_KEYS = ['gap', 'margin', 'radius', 'padding', 'borderWidth', 'borderStyle', 'borderColor'] as const

function frameAttrs(attrs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const frame: Record<string, unknown> = {}
  if (!attrs) return frame
  for (const key of FRAME_KEYS) {
    if (attrs[key] != null) frame[key] = attrs[key]
  }
  return frame
}

/** 删掉一栏后的比例。原来等宽，或剩下的栏比例相同，就回到等宽。 */
export function columnRatiosAfterRemoval(ratios: string | null, cols: number, index: number): string | null {
  const parsed = normalizeRatios(clampCols(cols), ratios)
  if (!parsed || index < 0 || index >= parsed.length) return null
  const next = parsed.filter((_, item) => item !== index)
  const normalized = normalizeRatios(clampCols(next.length), next)
  return normalized ? ratiosToAttr(normalized) : null
}

function buildColumns(
  doc: PMNode,
  cols: ColumnCount,
  ratios: number[] | string | null | undefined,
  buckets: PMNode[][],
  frame?: Record<string, unknown>,
): PMNode {
  const schema = doc.type.schema
  const children = buckets.map((blocks) => schema.nodes.column!.create(null, blocks))
  return schema.nodes.columns!.create({ ...frame, ...columnsAttrs(cols, ratios) }, children)
}

function columnsPosition(tr: Transaction): number | null {
  const { selection } = tr
  if (selection instanceof NodeSelection && selection.node.type.name === 'columns') return selection.from
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'columns') return $from.before(depth)
  }
  return null
}

function placeCaret(tr: Transaction, pos: number) {
  const target = Math.max(1, Math.min(pos, tr.doc.content.size))
  tr.setSelection(TextSelection.near(tr.doc.resolve(target)))
}

function joinColumnBackward(tr: Transaction): boolean {
  if (!tr.selection.empty) return false
  const { $from } = tr.selection
  if ($from.parentOffset !== 0) return false
  let depth = -1
  for (let level = $from.depth; level > 0; level -= 1) {
    if ($from.node(level).type.name === 'column') depth = level
  }
  if (depth < 1 || $from.node(depth - 1).type.name !== 'columns') return false
  for (let level = $from.depth; level > depth; level -= 1) {
    const name = $from.node(level).type.name
    if (name === 'listItem' || name === 'taskItem' || name === 'codeBlock') return false
  }
  if ($from.index(depth) !== 0 || $from.parent !== $from.node(depth).firstChild) return false
  const columnIndex = $from.index(depth - 1)
  const currentBlock = $from.node(depth).firstChild
  if (currentBlock && isEmptyParagraph(currentBlock) && $from.node(depth).childCount === 1) {
    return dropColumn(tr, $from.before(depth - 1), columnIndex)
  }
  if (columnIndex <= 0) return false
  const columns = $from.node(depth - 1)
  const previous = columns.child(columnIndex - 1)
  const currentColumn = $from.node(depth)
  const previousBlock = previous?.lastChild
  if (!currentBlock?.isTextblock || !previousBlock?.isTextblock) return false
  let previousPos = $from.before(depth - 1) + 1
  for (let index = 0; index < columnIndex - 1; index += 1) previousPos += columns.child(index).nodeSize
  const previousBlockStart = previousPos + 1 + previous.content.size - previousBlock.nodeSize
  const joinAt = previousBlockStart + 1 + previousBlock.content.size
  const content = currentBlock.content
  if (content.size) tr.insert(joinAt, content)
  if (currentColumn.childCount === 1) {
    const start = tr.mapping.map($from.start())
    const end = tr.mapping.map($from.end())
    if (end > start) tr.delete(start, end)
  } else {
    const blockFrom = tr.mapping.map($from.before())
    const blockTo = tr.mapping.map($from.after())
    if (blockTo > blockFrom) tr.delete(blockFrom, blockTo)
  }
  placeCaret(tr, tr.mapping.map(joinAt, 1))
  return true
}

function focusColumn(tr: Transaction, dir: 1 | -1, onlyAtEdge = false): boolean {
  if (onlyAtEdge && !tr.selection.empty) return false
  const { $from } = tr.selection
  let depth = -1
  for (let level = $from.depth; level > 0; level -= 1) {
    if ($from.node(level).type.name === 'column') depth = level
  }
  if (depth < 1 || $from.node(depth - 1).type.name !== 'columns') return false
  for (let level = $from.depth; level > depth; level -= 1) {
    const name = $from.node(level).type.name
    if (name === 'listItem' || name === 'taskItem' || name === 'codeBlock') return false
  }
  const column = $from.node(depth)
  if (onlyAtEdge) {
    const atEnd = dir > 0 && $from.parentOffset === $from.parent.content.size && $from.index(depth) === column.childCount - 1
    const atStart = dir < 0 && $from.parentOffset === 0 && $from.index(depth) === 0
    if (!atEnd && !atStart) return false
  }
  const columns = $from.node(depth - 1)
  const next = $from.index(depth - 1) + dir
  if (next < 0 || next >= columns.childCount) return false
  let pos = $from.before(depth - 1) + 1
  for (let index = 0; index < next; index += 1) pos += columns.child(index).nodeSize
  placeCaret(tr, pos + 1)
  return true
}

function liftedBlocks(node: PMNode, blank: PMNode): PMNode[] {
  const blocks: PMNode[] = []
  node.forEach((column) => {
    const children: PMNode[] = []
    column.forEach((block) => children.push(block))
    if (!children.some((block) => !isEmptyParagraph(block))) return
    blocks.push(...children)
  })
  return blocks.length ? blocks : [blank]
}

function liftColumns(tr: Transaction, pos: number): boolean {
  const node = tr.doc.nodeAt(pos)
  if (!node || node.type.name !== 'columns') return false
  const blocks = liftedBlocks(node, blankParagraph(tr.doc))
  tr.replaceWith(pos, pos + node.nodeSize, blocks)
  placeCaret(tr, pos + 1)
  return true
}

function reshapeColumns(tr: Transaction, pos: number, cols: ColumnCount, ratios?: number[]): boolean {
  const node = tr.doc.nodeAt(pos)
  if (!node || node.type.name !== 'columns') return false
  const next = buildColumns(
    tr.doc,
    cols,
    ratios,
    fitColumnBlocks(columnContents(node), cols, blankParagraph(tr.doc)),
    frameAttrs(node.attrs as Record<string, unknown>),
  )
  tr.replaceWith(pos, pos + node.nodeSize, next)
  placeCaret(tr, pos + 1)
  return true
}

/** 空栏退格：三栏及以上删掉这一栏；只剩两栏时取消分栏。 */
function dropColumn(tr: Transaction, pos: number, index: number): boolean {
  const node = tr.doc.nodeAt(pos)
  if (!node || node.type.name !== 'columns') return false
  if (index < 0 || index >= node.childCount) return false
  if (node.childCount <= 2) return liftColumns(tr, pos)
  const buckets = columnContents(node)
  buckets.splice(index, 1)
  const cols = clampCols(buckets.length)
  const next = buildColumns(
    tr.doc,
    cols,
    columnRatiosAfterRemoval(node.attrs.ratios ?? null, node.childCount, index),
    buckets,
    frameAttrs(node.attrs as Record<string, unknown>),
  )
  tr.replaceWith(pos, pos + node.nodeSize, next)
  let caret = pos + 1
  const focus = Math.min(index, next.childCount - 1)
  for (let item = 0; item < focus; item += 1) caret += next.child(item).nodeSize
  placeCaret(tr, caret + 1)
  return true
}

function wrapSelection(tr: Transaction, cols: ColumnCount, ratios?: number[]): boolean {
  const blank = blankParagraph(tr.doc)
  const probe = Fragment.from(buildColumns(tr.doc, cols, ratios, distributeBlocks([], cols, blank)))
  const { $from, $to } = tr.selection
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($to.pos > $from.end(depth)) continue
    const range = new NodeRange($from, $to, depth)
    if (!range.parent.canReplace(range.startIndex, range.endIndex, probe)) continue
    const blocks: PMNode[] = []
    for (let index = range.startIndex; index < range.endIndex; index += 1) blocks.push(range.parent.child(index))
    const from = range.start
    tr.replaceWith(from, range.end, buildColumns(tr.doc, cols, ratios, distributeBlocks(blocks, cols, blank)))
    placeCaret(tr, from + 1)
    return true
  }
  return false
}

export type ColumnBorderStyle = 'none' | 'solid' | 'dashed' | 'dotted'

export type ColumnFrameAttrs = {
  gap?: number
  margin?: number
  radius?: number
  padding?: number
  borderWidth?: number
  borderStyle?: ColumnBorderStyle
  borderColor?: string
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function borderStyleOf(value: unknown): ColumnBorderStyle {
  if (value === 'none' || value === 'solid' || value === 'dashed' || value === 'dotted') return value
  return 'dashed'
}

function borderColorOf(value: unknown): string {
  const text = String(value || '').trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return text
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(text)) return text
  return '#c9cdd4'
}

/** 分栏外框样式。用变量写进节点，避免全局 !important 把边框写死。 */
export function columnsFrameVars(attrs: ColumnFrameAttrs): string {
  const gap = clampNum(attrs.gap, 16, 0, 64)
  const margin = clampNum(attrs.margin, 12, 0, 64)
  const radius = clampNum(attrs.radius, 8, 0, 32)
  const padding = clampNum(attrs.padding, 10, 0, 48)
  const width = clampNum(attrs.borderWidth, 1, 0, 8)
  const style = borderStyleOf(attrs.borderStyle)
  const color = borderColorOf(attrs.borderColor)
  const border = style === 'none' || width === 0 ? 'none' : `${width}px ${style} ${color}`
  return [
    `--rte-col-gap:${gap}px`,
    `--rte-col-margin:${margin}px`,
    `--rte-col-radius:${radius}px`,
    `--rte-col-pad:${padding}px`,
    `--rte-col-border:${border}`,
  ].join(';')
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
          'min-width:0;min-height:64px;border:1px solid #e8eaed;border-radius:6px;background:#fff;box-sizing:border-box;',
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
      gap: numAttr('data-gap', 'gap', 16, 0, 64),
      margin: numAttr('data-margin', 'margin', 12, 0, 64),
      radius: numAttr('data-radius', 'radius', 8, 0, 32),
      padding: numAttr('data-pad', 'padding', 10, 0, 48),
      borderWidth: numAttr('data-border-width', 'borderWidth', 1, 0, 8),
      borderStyle: {
        default: 'dashed' as ColumnBorderStyle,
        parseHTML: (el: HTMLElement) => borderStyleOf(el.getAttribute('data-border-style')),
        renderHTML: (attrs: { borderStyle?: ColumnBorderStyle }) => ({
          'data-border-style': borderStyleOf(attrs.borderStyle),
        }),
      },
      borderColor: {
        default: '#c9cdd4',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-border-color') || '#c9cdd4',
        renderHTML: (attrs: { borderColor?: string }) => ({
          'data-border-color': String(attrs.borderColor || '#c9cdd4'),
        }),
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
      `--rte-col-grid:${grid}`,
      `grid-template-columns:${grid}`,
      columnsFrameVars(node.attrs),
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
        ({ tr }) => {
          // 改的是这条链上的事务。链的 dispatch 本身是空操作，run() 才会发出去。
          const count = clampCols(cols)
          const pos = columnsPosition(tr)
          if (pos != null) return reshapeColumns(tr, pos, count, ratios)
          return wrapSelection(tr, count, ratios)
        },
      unsetColumns:
        () =>
        ({ tr }) => {
          const pos = columnsPosition(tr)
          if (pos == null) return false
          return liftColumns(tr, pos)
        },
      focusColumn:
        (dir: 1 | -1, onlyAtEdge?: boolean) =>
        ({ tr }) => focusColumn(tr, dir, onlyAtEdge),
      joinColumnBackward:
        () =>
        ({ tr }) => joinColumnBackward(tr),
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.focusColumn(1),
      'Shift-Tab': () => this.editor.commands.focusColumn(-1),
      ArrowRight: () => this.editor.commands.focusColumn(1, true),
      ArrowLeft: () => this.editor.commands.focusColumn(-1, true),
      Backspace: () => this.editor.commands.joinColumnBackward(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const para = state.schema.nodes.paragraph
          if (!para) return null
          let tr = state.tr
          const fixes: Array<{ pos: number }> = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'columns') return
            const count = node.childCount
            if (count < 2 || count > 6) return
            const cols = clampCols(count)
            const next = columnsAttrs(cols, node.attrs.ratios)
            const current = node.attrs.ratios || null
            if (node.attrs.cols !== cols || current !== next.ratios) fixes.push({ pos })
          })
          for (let index = fixes.length - 1; index >= 0; index -= 1) {
            const pos = tr.mapping.map(fixes[index]!.pos)
            const node = tr.doc.nodeAt(pos)
            if (!node || node.type.name !== 'columns' || node.childCount < 2 || node.childCount > 6) continue
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...columnsAttrs(clampCols(node.childCount), node.attrs.ratios) })
          }
          const spots: number[] = []
          tr.doc.descendants((node, pos) => {
            if (node.type.name !== 'column') return
            const last = node.lastChild
            if (last?.isTextblock) return
            spots.push(pos + node.nodeSize - 1)
          })
          if (!fixes.length && !spots.length) return null
          for (let i = spots.length - 1; i >= 0; i -= 1) tr = tr.insert(spots[i]!, para.create())
          if (!tr.selection.$from.parent.isTextblock) {
            const hrPos = transactions[transactions.length - 1]?.selection.from ?? tr.selection.from
            let target = -1
            tr.doc.nodesBetween(hrPos, tr.doc.content.size, (node, pos) => {
              if (target >= 0) return false
              if (node.type === para) {
                target = pos + 1
                return false
              }
              return undefined
            })
            if (target > 0) tr = tr.setSelection(TextSelection.create(tr.doc, target))
          }
          return tr
        },
      }),
    ]
  },
})
