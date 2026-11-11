/**
 * 表格十字光标：当前格所在的整行、整列一起淡淡亮起，和 WPS 表格里的定位方式一样。
 * 鼠标停在别的格子上时十字跟着鼠标；离开表格后回到文字光标那一格。
 */
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { ResolvedPos } from '@tiptap/pm/model'
import { CellSelection, TableMap, cellAround } from '@tiptap/pm/tables'

export const tableCrosshairKey = new PluginKey<number | null>('rteTableCrosshair')

function cellAt(state: EditorState, pos: number): ResolvedPos | null {
  const max = state.doc.content.size
  const $at = state.doc.resolve(Math.max(0, Math.min(pos, max)))
  const around = cellAround($at)
  if (around) return around
  const node = state.doc.nodeAt($at.pos)
  const role = node?.type.spec.tableRole
  if (role === 'cell' || role === 'header_cell') return $at
  return null
}

function caretCell(state: EditorState): ResolvedPos | null {
  const sel = state.selection
  if (sel instanceof CellSelection) return sel.$headCell
  return cellAround(sel.$head)
}

function crossRect(state: EditorState, $cell: ResolvedPos) {
  const table = $cell.node(-1)
  const start = $cell.start(-1)
  const map = TableMap.get(table)
  const sel = state.selection
  if (sel instanceof CellSelection && sel.$anchorCell.start(-1) === start) {
    return {
      map,
      start,
      table,
      rect: map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start),
    }
  }
  return { map, start, table, rect: map.findCell($cell.pos - start) }
}

function cellClass(map: TableMap, rel: number, rows: Set<number>, cols: Set<number>): string | null {
  const rect = map.findCell(rel)
  let onRow = false
  let onCol = false
  for (let row = rect.top; row < rect.bottom; row += 1) if (rows.has(row)) onRow = true
  for (let col = rect.left; col < rect.right; col += 1) if (cols.has(col)) onCol = true
  if (onRow && onCol) return 'rte-cross-both'
  if (onRow) return 'rte-cross-row'
  if (onCol) return 'rte-cross-col'
  return null
}

/** 给十字上的格子打装饰类。hoverPos 是鼠标所在格的文档位置；没有则用文字光标。 */
export function tableCrosshairDecorations(state: EditorState, hoverPos: number | null): DecorationSet {
  const $cell = hoverPos != null ? cellAt(state, hoverPos) : caretCell(state)
  if (!$cell) return DecorationSet.empty
  let located: ReturnType<typeof crossRect>
  try {
    located = crossRect(state, $cell)
  } catch {
    return DecorationSet.empty
  }
  const { map, start, rect } = located
  const rows = new Set<number>()
  const cols = new Set<number>()
  for (let row = rect.top; row < rect.bottom; row += 1) rows.add(row)
  for (let col = rect.left; col < rect.right; col += 1) cols.add(col)
  const seen = new Set<number>()
  const decos: Decoration[] = []
  for (let index = 0; index < map.map.length; index += 1) {
    const rel = map.map[index]!
    if (seen.has(rel)) continue
    seen.add(rel)
    const cls = cellClass(map, rel, rows, cols)
    if (!cls) continue
    const abs = start + rel
    const node = state.doc.nodeAt(abs)
    if (!node) continue
    decos.push(Decoration.node(abs, abs + node.nodeSize, { class: cls }))
  }
  return DecorationSet.create(state.doc, decos)
}

function hoverFromEvent(view: { posAtDOM: (node: Node, offset: number) => number; state: EditorState }, event: Event): number | 'clear' | null {
  const target = event.target
  if (!(target instanceof Element)) return 'clear'
  const cell = target.closest('td, th')
  if (!cell || cell.closest('thead')) return target.closest('table') ? null : 'clear'
  try {
    const pos = view.posAtDOM(cell, 0)
    const $cell = cellAround(view.state.doc.resolve(pos))
    return $cell ? $cell.pos : 'clear'
  } catch {
    return null
  }
}

export function createTableCrosshairPlugin(): Plugin {
  return new Plugin<number | null>({
    key: tableCrosshairKey,
    state: {
      init: () => null,
      apply(tr: Transaction, prev: number | null) {
        const meta = tr.getMeta(tableCrosshairKey)
        if (meta === 'clear') return null
        if (typeof meta === 'number') return meta
        if (prev == null || !tr.docChanged) return prev
        const mapped = tr.mapping.map(prev, -1)
        return mapped
      },
    },
    props: {
      decorations(state) {
        return tableCrosshairDecorations(state, tableCrosshairKey.getState(state) ?? null)
      },
      handleDOMEvents: {
        mousedown(view) {
          if (tableCrosshairKey.getState(view.state) != null) {
            view.dispatch(view.state.tr.setMeta(tableCrosshairKey, 'clear'))
          }
          return false
        },
        mousemove(view, event) {
          if (event.buttons) return false
          const next = hoverFromEvent(view, event)
          if (next == null) return false
          const current = tableCrosshairKey.getState(view.state) ?? null
          const value = next === 'clear' ? null : next
          if (value === current) return false
          view.dispatch(view.state.tr.setMeta(tableCrosshairKey, next === 'clear' ? 'clear' : next))
          return false
        },
        mouseleave(view) {
          if (tableCrosshairKey.getState(view.state) != null) {
            view.dispatch(view.state.tr.setMeta(tableCrosshairKey, 'clear'))
          }
          return false
        },
      },
    },
  })
}
