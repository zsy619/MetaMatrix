import type { Editor } from '@tiptap/core'
import { Fragment, type Node as PmNode } from '@tiptap/pm/model'

/** 行被挪走以后，公式里的行号跟着新位置走。 */
export function remapFormulaRows(formula: string, rowMap: Map<number, number>): string {
  if (!formula.startsWith('=')) return formula
  return formula.replace(/\b([A-Za-z]{1,3})([1-9][0-9]*)\b/g, (all, col: string, row: string) => {
    const next = rowMap.get(Number(row))
    return next ? `${col}${next}` : all
  })
}

function remapNode(node: PmNode, rowMap: Map<number, number>, schema: Editor['schema']): PmNode {
  if (node.isText && node.text?.startsWith('=')) {
    const next = remapFormulaRows(node.text, rowMap)
    return next === node.text ? node : schema.text(next, node.marks)
  }
  if (!node.childCount) return node
  let changed = false
  const kids: PmNode[] = []
  node.forEach((child) => {
    const mapped = remapNode(child, rowMap, schema)
    if (mapped !== child) changed = true
    kids.push(mapped)
  })
  return changed ? node.copy(Fragment.from(kids)) : node
}

function cellText(cell: PmNode): string {
  return cell.textContent.trim()
}

function findTable(editor: Editor): { table: PmNode; pos: number } | null {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'table') {
      return { table: node, pos: $from.before(d) }
    }
  }
  return null
}

/** 简单按列排序（无合并单元格时） */
export function sortTableByColumn(editor: Editor, colIndex: number, asc = true): boolean {
  const found = findTable(editor)
  if (!found) return false
  const { table, pos } = found
  const rows: PmNode[] = []
  table.forEach((row) => {
    if (row.type.name === 'tableRow') rows.push(row)
  })
  if (rows.length < 2) return false
  const header = rows[0]!
  const body = rows.slice(1)
  // 跳过合计行
  const isSum = (row: PmNode) => {
    const first = row.childCount ? cellText(row.child(0)) : ''
    return first === '合计' || first === 'SUM'
  }
  const sumRows = body.filter(isSum)
  const dataRows = body.filter((r) => !isSum(r))
  const sorted = [...dataRows].sort((a, b) => {
    const ca = a.childCount > colIndex ? cellText(a.child(colIndex)) : ''
    const cb = b.childCount > colIndex ? cellText(b.child(colIndex)) : ''
    const na = parseFloat(ca.replace(/,/g, ''))
    const nb = parseFloat(cb.replace(/,/g, ''))
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return asc ? na - nb : nb - na
    }
    return asc ? ca.localeCompare(cb, 'zh') : cb.localeCompare(ca, 'zh')
  })
  const newRows = [header, ...sorted, ...sumRows]
  const oldSheet = new Map<PmNode, number>()
  rows.forEach((row, index) => oldSheet.set(row, index + 1))
  const rowMap = new Map<number, number>()
  newRows.forEach((row, index) => rowMap.set(oldSheet.get(row) || index + 1, index + 1))
  const remapped = newRows.map((row) => remapNode(row, rowMap, editor.schema))
  const tableType = table.type
  const next = tableType.create(table.attrs, remapped)
  const tr = editor.state.tr.replaceWith(pos, pos + table.nodeSize, next)
  editor.view.dispatch(tr)
  return true
}

/** 简易合计行：对数值列求和，首列写「合计」 */
export function upsertTableSumRow(editor: Editor): boolean {
  const found = findTable(editor)
  if (!found) return false
  const { table, pos } = found
  const rows: PmNode[] = []
  table.forEach((row) => {
    if (row.type.name === 'tableRow') rows.push(row)
  })
  if (rows.length < 2) return false
  const header = rows[0]!
  const colCount = header.childCount
  const body = rows.slice(1).filter((r) => {
    const first = r.childCount ? cellText(r.child(0)) : ''
    return first !== '合计' && first !== 'SUM'
  })
  const sums: (string | null)[] = Array.from({ length: colCount }, () => null)
  for (let c = 1; c < colCount; c++) {
    let total = 0
    let n = 0
    for (const row of body) {
      if (row.childCount <= c) continue
      const t = cellText(row.child(c)).replace(/,/g, '')
      const v = parseFloat(t)
      if (Number.isFinite(v) && t !== '') {
        total += v
        n += 1
      }
    }
    if (n) sums[c] = String(Math.round(total * 1000) / 1000)
  }
  const cellType = header.child(0)!.type
  const para = editor.schema.nodes.paragraph!
  const makeCell = (text: string) =>
    cellType.create(
      null,
      text ? para.create(null, editor.schema.text(text)) : para.create(),
    )
  const sumCells = Array.from({ length: colCount }, (_, i) =>
    makeCell(i === 0 ? '合计' : sums[i] || ''),
  )
  const rowType = rows[0]!.type
  const sumRow = rowType.create(null, sumCells)
  const nextRows = [header, ...body, sumRow]
  const next = table.type.create(table.attrs, nextRows)
  const tr = editor.state.tr.replaceWith(pos, pos + table.nodeSize, next)
  editor.view.dispatch(tr)
  return true
}

export function currentTableColIndex(editor: Editor): number {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'tableCell' || $from.node(d).type.name === 'tableHeader') {
      return $from.index(d - 1)
    }
  }
  return 0
}


export { copyTableAs, applyTableRowFilter, clearTableRowFilter } from './rteWave21'
