import { computed, nextTick, reactive, ref, watch, type ShallowRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { moveTableGridHover, TABLE_QUICK_COLS, TABLE_QUICK_ROWS } from '../../../utils/rteTableGrid'
import {
  copyTableAs,
  applyTableRowFilter,
  findTablePos,
  mapTableFilterPos,
  paintTableFilterAt,
} from '../../../utils/rteWave21'
import {
  setCellVerticalAlign,
  sortTableByColumn,
  upsertTableSumRow,
  currentTableColIndex,
} from '../../rteWave20'
import { recalculateTable } from '../../../utils/rteTableFormula'
import { maskShouldDismiss } from '../../../utils/rteDialogMask'
import { duplicateTableRow, equalizeTableColumns } from '../../../utils/rteTableLayout'

/** 表格插入、单元格操作与表格菜单。模板绑定名与原先一致。 */
export function useTableOps(deps: {
  editor: () => ShallowRef<Editor | undefined>
  viewMode: () => { value: string }
  moreOpen: () => { value: boolean }
  headingOpen: () => { value: boolean }
  listOpen: () => { value: boolean }
  formOpen: () => { value: boolean }
  colorOpen: () => { value: boolean }
  highlightOpen: () => { value: boolean }
  alignOpen: () => { value: boolean }
  closeImportMenu: () => void
  closeExportMenu: () => void
  closeFontMenus: () => void
  focusOpenDialog: () => void
  onOpened?: () => void
  onClosed?: () => void
  announceRte: (msg: string) => void
  rteToast: (type: 'success' | 'warning' | 'error' | 'info', message: string) => void
  openRtePrompt: (opts: {
    title: string
    message?: string
    placeholder?: string
    defaultValue?: string
    confirmLabel?: string
    cancelLabel?: string
    maxlength?: number
  }) => Promise<string | null>
}) {
/** 表格菜单状态（须在 useEditor 之前声明，供 contextmenu 回调闭包使用） */
const tableMenuOpen = ref(false)
const tableOpsSheetOpen = ref(false)
const tableCtx = ref<{ open: boolean; x: number; y: number }>({
  open: false,
  x: 0,
  y: 0,
})

function closeTableCtx() {
  if (!tableCtx.value.open) return
  tableCtx.value = { ...tableCtx.value, open: false }
}

function openTableContextMenu(event: MouseEvent) {
  rememberTableInsertSelection()
  tableCtx.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
  }
  tableMenuOpen.value = false
  tableOpsSheetOpen.value = false
  nextTick(() => {
    const el = document.querySelector('.rte-table-ctx')
    if (!(el instanceof HTMLElement) || !tableCtx.value.open) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    const x = Math.max(pad, Math.min(tableCtx.value.x, window.innerWidth - rect.width - pad))
    const y = Math.max(pad, Math.min(tableCtx.value.y, window.innerHeight - rect.height - pad))
    if (x !== tableCtx.value.x || y !== tableCtx.value.y) {
      tableCtx.value = { open: true, x, y }
    }
  })
}

const tableHeaderSticky = ref(false)
const tableColSticky = ref(false)
const tableFilterQuery = ref('')
const tableFilterPos = ref<number | null>(null)

function reapplyTableFilter(
  ed: Editor,
  transaction: { mapping: { map: (pos: number, assoc?: number) => number } },
  appended: ReadonlyArray<{ mapping: { map: (pos: number, assoc?: number) => number } }> = [],
) {
  if (!tableFilterQuery.value) {
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table' || !node.attrs.rowFilter) return
      tableFilterQuery.value = String(node.attrs.rowFilter)
      tableFilterPos.value = pos
      return false
    })
  }
  if (!tableFilterQuery.value || tableFilterPos.value == null) return
  const pos = mapTableFilterPos(tableFilterPos.value, [transaction, ...appended])
  tableFilterPos.value = pos
  if (paintTableFilterAt(ed, pos, tableFilterQuery.value) < 0) tableFilterPos.value = null
}

function applyCellValign(v: string) {
  const ed = deps.editor().value
  if (!ed || !isInTable()) {
    ElMessage.info('请在表格单元格内操作')
    return
  }
  setCellVerticalAlign(ed, v || null)
  deps.moreOpen().value = false
}

function doSortTable(asc: boolean) {
  const ed = deps.editor().value
  if (!ed || !isInTable()) {
    ElMessage.info('请将光标放在表格中')
    return
  }
  const col = currentTableColIndex(ed)
  if (sortTableByColumn(ed, col, asc)) {
    ElMessage.success(`已按第 ${col + 1} 列${asc ? '升序' : '降序'}排序`)
  } else {
    ElMessage.warning('排序失败（需至少 2 行）')
  }
  deps.moreOpen().value = false
}

function doTableSumRow() {
  const ed = deps.editor().value
  if (!ed || !isInTable()) {
    ElMessage.info('请将光标放在表格中')
    return
  }
  if (upsertTableSumRow(ed)) ElMessage.success('已更新合计行')
  else ElMessage.warning('无法生成合计行')
  deps.moreOpen().value = false
}

function toggleTableStickyHeader() {
  tableHeaderSticky.value = !tableHeaderSticky.value
  ElMessage.success(tableHeaderSticky.value ? '已开启表头冻结' : '已关闭表头冻结')
  deps.moreOpen().value = false
}

function toggleTableStickyCol() {
  tableColSticky.value = !tableColSticky.value
  ElMessage.success(tableColSticky.value ? '已开启首列冻结' : '已关闭首列冻结')
  deps.moreOpen().value = false
}

async function copyCurrentTable(format: 'csv' | 'tsv') {
  const ed = deps.editor().value
  if (!ed) return
  const ok = await copyTableAs(ed, format)
  if (!ok) ElMessage.info('请将光标放在表格中')
  else ElMessage.success(format === 'csv' ? '已复制为 CSV' : '已复制为 TSV')
  deps.moreOpen().value = false
}

async function promptTableRowFilter() {
  const ed = deps.editor().value
  if (!ed) return
  const raw = await deps.openRtePrompt({
    title: '表格行筛选',
    message: '输入关键词隐藏不含该词的数据行；留空则清除筛选（仅视图，不改文档）',
    defaultValue: tableFilterQuery.value,
    placeholder: '关键词',
    maxlength: 80,
  })
  if (raw == null) return
  tableFilterQuery.value = raw.trim()
  tableFilterPos.value = tableFilterQuery.value ? findTablePos(ed) : null
  const filterPos = findTablePos(ed)
  const filterNode = filterPos == null ? null : ed.state.doc.nodeAt(filterPos)
  if (filterPos != null && filterNode?.type.name === 'table') {
    const saved = tableFilterQuery.value || null
    if ((filterNode.attrs.rowFilter || null) !== saved) {
      ed.view.dispatch(
        ed.state.tr.setNodeMarkup(filterPos, undefined, { ...filterNode.attrs, rowFilter: saved }).setMeta('addToHistory', false),
      )
    }
  }
  const hidden = tableFilterPos.value == null && tableFilterQuery.value
    ? -1
    : applyTableRowFilter(ed, tableFilterQuery.value)
  if (hidden < 0) ElMessage.info('请将光标放在表格中')
  else if (!tableFilterQuery.value) ElMessage.success('已清除行筛选')
  else ElMessage.success(`已隐藏 ${hidden} 行`)
}

/** —— 表格单元格背景 / 边框 —— */
function setTableCellBg(color: string) {
  const ed = deps.editor().value
  if (!ed || !isInTable()) return
  const value = color || null
  ed.chain().focus().setCellAttribute('backgroundColor', value).run()
  closeAllTableUi()
}
function setTableCellBorderColor(color: string) {
  const ed = deps.editor().value
  if (!ed || !isInTable()) return
  ed.chain().focus().setCellAttribute('borderColor', color || null).run()
}
function setTableCellBorderStyle(style: string) {
  const ed = deps.editor().value
  if (!ed || !isInTable()) return
  ed.chain().focus().setCellAttribute('borderStyle', style || null).run()
}

/** —— 插入表格 —— */
const tableDialogOpen = ref(false)
const tableQuickOpen = ref(false)
const tableQuickHover = ref({ rows: 0, cols: 0 })
const tableQuickCells = Array.from({ length: TABLE_QUICK_ROWS * TABLE_QUICK_COLS }, (_, index) => ({
  r: Math.floor(index / TABLE_QUICK_COLS) + 1,
  c: (index % TABLE_QUICK_COLS) + 1,
}))
const tableRows = ref(3)
const tableCols = ref(3)
const tableSizeBase = ref({ rows: 3, cols: 3 })
/** 尺寸网格悬停预览（Word 风格） */
const tableGridHover = ref({ rows: 0, cols: 0 })
const TABLE_GRID_MAX_ROWS = 8
const TABLE_GRID_MAX_COLS = 20

function resetTableDialog() {
  tableRows.value = 3
  tableCols.value = 3
  tableGridHover.value = { rows: 0, cols: 0 }
  tableSizeHint.value = ''
}

function onTableGridHover(r: number, c: number) {
  tableGridHover.value = { rows: r, cols: c }
  // 悬停即同步行/列数字输入（选择后更改对应数字）
  tableRows.value = clampInt(r, 1, 100)
  tableCols.value = clampInt(c, 1, TABLE_GRID_MAX_COLS)
}

function onTableGridLeave() {
  tableGridHover.value = { rows: 0, cols: 0 }
}

function pickTableGridSize(r: number, c: number) {
  tableRows.value = clampInt(r, 1, 100)
  tableCols.value = clampInt(c, 1, TABLE_GRID_MAX_COLS)
  tableGridHover.value = { rows: r, cols: c }
  confirmInsertTable()
}

function openTableDialog() {
  resetTableDialog()
  tableSizeBase.value = { rows: tableRows.value, cols: tableCols.value }
  tableDialogOpen.value = true
  deps.moreOpen().value = false
  if (deps.onOpened) deps.onOpened()
  else deps.focusOpenDialog()
  tableMenuOpen.value = false
  tableOpsSheetOpen.value = false
  closeTableCtx()
}

function closeTableDialog() {
  tableDialogOpen.value = false
  resetTableDialog()
  deps.onClosed?.()
}

function onTableDialogMask() {
  const dirty = tableRows.value !== tableSizeBase.value.rows || tableCols.value !== tableSizeBase.value.cols
  if (!maskShouldDismiss({ dirty, filePickActive: false })) return
  closeTableDialog()
}

function clampInt(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, Math.trunc(v)))
}

const tableSizeHint = ref('')

function noteTableSize(raw: string, n: number, min: number, max: number, label: string) {
  if (raw !== '' && (Number.isNaN(n) || n < min || n > max)) {
    tableSizeHint.value = `${label}只接受 ${min} 到 ${max}，已改到范围内，不会按超出的数字插入`
    return
  }
  tableSizeHint.value = ''
}

function onTableRowsInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const n = parseInt(raw, 10)
  noteTableSize(raw, n, 1, 100, '行数')
  tableRows.value = clampInt(Number.isNaN(n) ? 1 : n, 1, 100)
}

function onTableColsInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const n = parseInt(raw, 10)
  noteTableSize(raw, n, 1, TABLE_GRID_MAX_COLS, '列数')
  tableCols.value = clampInt(Number.isNaN(n) ? 1 : n, 1, TABLE_GRID_MAX_COLS)
}

function stepTableRows(delta: number) {
  tableSizeHint.value = ''
  tableRows.value = clampInt(tableRows.value + delta, 1, 100)
}

function stepTableCols(delta: number) {
  tableSizeHint.value = ''
  tableCols.value = clampInt(tableCols.value + delta, 1, TABLE_GRID_MAX_COLS)
}

function confirmInsertTable() {
  const ed = deps.editor().value
  if (!ed) return
  const rows = clampInt(tableRows.value, 1, 100)
  const cols = clampInt(tableCols.value, 1, TABLE_GRID_MAX_COLS)
  tableRows.value = rows
  tableCols.value = cols
  closeAllTableUi()
  // 优先在当前光标插入；失败时落到文末再试（嵌套块/异常选区）
  const opts = { rows, cols, withHeaderRow: true }
  let ok = ed.chain().focus().insertTable(opts).run()
  if (!ok) {
    ok = ed.chain().focus('end').insertTable(opts).run()
  }
  if (!ok) {
    deps.rteToast('warning', '无法插入表格，请将光标放到正文段落后再试')
    return
  }
  closeTableDialog()
}

/** —— 表格内常用操作（合并/拆分/插删行列） —— */
const TABLE_INSERT_MAX = 99

type TableOpItem = {
  key: string
  label: string
  run: () => void
  disabled?: () => boolean
  danger?: boolean
  sepBefore?: boolean
  /** 向上/下插行、向左/右插列：各自一个数量。 */
  insertCount?: boolean
  active?: () => boolean
}

const TABLE_READ_TONES = ['', 'blue', 'green', 'orange', 'gray', 'night'] as const
type TableReadTone = (typeof TABLE_READ_TONES)[number]

type TableInsertKey = 'row-before' | 'row-after' | 'col-before' | 'col-after'

const tableInsertCounts = reactive<Record<TableInsertKey, number>>({
  'row-before': 1,
  'row-after': 1,
  'col-before': 1,
  'col-after': 1,
})

function isTableInsertKey(key: string): key is TableInsertKey {
  return key in tableInsertCounts
}
let tableInsertAnchor: { fromJSON: (doc: unknown, json: unknown) => { eq: (other: unknown) => boolean }; json: unknown } | null = null

function clampTableInsertCount(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(TABLE_INSERT_MAX, n)
}

function normalizeTableInsertCount(key: string) {
  if (!isTableInsertKey(key)) return
  tableInsertCounts[key] = clampTableInsertCount(tableInsertCounts[key])
}

function rememberTableInsertSelection() {
  const ed = deps.editor().value
  const sel = ed?.state.selection
  const ctor = sel?.constructor as { fromJSON?: (doc: unknown, json: unknown) => { eq: (other: unknown) => boolean } } | undefined
  if (!ed || !sel || typeof ctor?.fromJSON !== 'function') {
    tableInsertAnchor = null
    return
  }
  tableInsertAnchor = { fromJSON: ctor.fromJSON.bind(ctor), json: sel.toJSON() }
}

function restoreTableInsertSelection() {
  const ed = deps.editor().value
  const anchor = tableInsertAnchor
  if (!ed || !anchor) return
  try {
    const sel = anchor.fromJSON(ed.state.doc, anchor.json)
    if (sel && !sel.eq(ed.state.selection)) ed.view.dispatch(ed.state.tr.setSelection(sel as never))
  } catch {
    /* 文档已经变过时，沿用当前光标 */
  }
}

function isInTable() {
  return deps.editor().value?.isActive('table') ?? false
}

function canMergeCells() {
  return deps.editor().value?.can().mergeCells() ?? false
}

function canSplitCell() {
  return deps.editor().value?.can().splitCell() ?? false
}

function closeTableMenu() {
  tableMenuOpen.value = false
  tableQuickOpen.value = false
}

watch(tableQuickOpen, (open) => {
  if (!open) return
  nextTick(() => {
    const el = document.querySelector('.rte-table-quick')
    if (el instanceof HTMLElement) el.focus()
  })
})

function insertQuickTable(rows: number, cols: number) {
  if (deps.viewMode().value !== 'edit') return
  tableRows.value = rows
  tableCols.value = cols
  tableQuickHover.value = { rows, cols }
  tableQuickOpen.value = false
  confirmInsertTable()
}

function onTableQuickKeydown(event: KeyboardEvent) {
  const next = moveTableGridHover(tableQuickHover.value, event.key)
  if (next == null) return
  event.preventDefault()
  event.stopPropagation()
  if (next === 'close') {
    closeTableMenu()
    return
  }
  if (next === 'insert') {
    const rows = tableQuickHover.value.rows || 1
    const cols = tableQuickHover.value.cols || 1
    insertQuickTable(rows, cols)
    return
  }
  tableQuickHover.value = next
}

function closeTableOpsSheet() {
  tableOpsSheetOpen.value = false
}

function closeAllTableUi() {
  closeTableMenu()
  closeTableOpsSheet()
  closeTableCtx()
}

function runTableCommand(command: () => boolean) {
  const ed = deps.editor().value
  if (!ed) return
  // 保持 CellSelection：菜单已 @mousedown.prevent，勿额外打乱选区
  command()
  closeAllTableUi()
}

function runTableInsert(key: TableInsertKey, command: () => boolean) {
  const count = clampTableInsertCount(tableInsertCounts[key])
  tableInsertCounts[key] = count
  restoreTableInsertSelection()
  runTableCommand(() => {
    let ok = false
    for (let i = 0; i < count; i += 1) {
      if (!command()) break
      ok = true
    }
    return ok
  })
}

function tableAddRowBefore() {
  runTableInsert('row-before', () => deps.editor().value!.chain().focus().addRowBefore().run())
}
function tableAddRowAfter() {
  runTableInsert('row-after', () => deps.editor().value!.chain().focus().addRowAfter().run())
}
function tableAddColBefore() {
  runTableInsert('col-before', () => deps.editor().value!.chain().focus().addColumnBefore().run())
}
function tableAddColAfter() {
  runTableInsert('col-after', () => deps.editor().value!.chain().focus().addColumnAfter().run())
}
function tableDeleteRow() {
  runTableCommand(() => deps.editor().value!.chain().focus().deleteRow().run())
}
function tableDeleteCol() {
  runTableCommand(() => deps.editor().value!.chain().focus().deleteColumn().run())
}
function tableMergeCells() {
  if (!canMergeCells()) return
  runTableCommand(() => deps.editor().value!.chain().focus().mergeCells().run())
}
function tableSplitCell() {
  if (!canSplitCell()) return
  runTableCommand(() => deps.editor().value!.chain().focus().splitCell().run())
}
function applyCellTextAlign(align: 'left' | 'center' | 'right') {
  const ed = deps.editor().value
  if (!ed || !isInTable()) return
  ed.chain().focus().setTextAlign(align).run()
  deps.announceRte(align === 'center' ? '单元格已居中' : align === 'right' ? '单元格已右对齐' : '单元格已左对齐')
}

function tableToggleHeaderRow() {
  runTableCommand(() => deps.editor().value!.chain().focus().toggleHeaderRow().run())
}
function tableToggleHeaderColumn() {
  runTableCommand(() => deps.editor().value!.chain().focus().toggleHeaderColumn().run())
}
async function tableDeleteTable() {
  const ed = deps.editor().value
  if (!ed || !isInTable()) {
    ElMessage.info('请将光标放在表格中')
    return
  }
  let rows = 0
  let cols = 0
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'table') continue
    rows = node.childCount
    cols = node.firstChild?.childCount || 0
    break
  }
  try {
    await ElMessageBox.confirm(`将删除这个 ${rows} 行 ${cols} 列的表格。`, '删除表格', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  ed.chain().focus().deleteTable().run()
  closeAllTableUi()
}
function tableClearCellFormat() {
  const ed = deps.editor().value
  if (!ed || !isInTable()) return
  ed.chain()
    .focus()
    .setCellAttribute('backgroundColor', null)
    .setCellAttribute('borderColor', null)
    .setCellAttribute('borderStyle', null)
    .run()
  closeAllTableUi()
  deps.announceRte('已清除单元格格式')
}

/** —— 单元格公式 —— */
/** 找到光标所在的表格节点。 */
function findCurrentTable(): { pos: number; node: any } | null {
  const ed = deps.editor().value
  if (!ed) return null
  const { $head } = ed.state.selection
  for (let d = $head.depth; d > 0; d -= 1) {
    if ($head.node(d).type.name === 'table') {
      return { pos: $head.before(d), node: $head.node(d) }
    }
  }
  return null
}

/**
 * 计算当前表格里的公式。
 * 单元格文本以 = 开头视为公式；算完后把结果写回单元格，
 * 公式本身存进单元格的 data-formula 属性，下次还能重算。
 */
function calcTableFormulas() {
  const ed = deps.editor().value
  const found = findCurrentTable()
  if (!ed || !found) {
    ElMessage.info('请在表格里操作')
    return
  }
  const table = found.node
  const cells: Array<{ row: number; col: number; formula: string; value: string }> = []
  const grid: string[][] = []
  table.forEach((row: any, rowIndex: number) => {
    const rowGrid: string[] = []
    row.forEach((cell: any, colIndex: number) => {
      const stored = typeof cell.attrs?.formula === 'string' ? cell.attrs.formula : ''
      const text = (cell.textContent || '').trim()
      const formula = text.startsWith('=') ? text : stored
      rowGrid.push(formula || text)
      cells.push({ row: rowIndex, col: colIndex, formula, value: text })
    })
    grid.push(rowGrid)
  })
  const results = recalculateTable(grid)
  let changed = 0
  cells.forEach((cell) => {
    if (!cell.formula) return
    const next = results[cell.row]?.[cell.col] ?? ''
    if (next !== cell.value) changed += 1
  })
  if (!changed) {
    ElMessage.info('表里没有需要计算的公式')
    closeAllTableUi()
    return
  }
  // 从后往前改，避免前面的替换影响后面的位置
  const tr = ed.state.tr
  const schema = ed.state.schema
  const rowNodes: any[] = []
  table.forEach((row: any) => rowNodes.push(row))
  for (let rowIndex = rowNodes.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const rowNode = rowNodes[rowIndex]
    const cellNodes: any[] = []
    rowNode.forEach((cell: any) => cellNodes.push(cell))
    for (let colIndex = cellNodes.length - 1; colIndex >= 0; colIndex -= 1) {
      const cellNode = cellNodes[colIndex]
      const cell = cells.find((c) => c.row === rowIndex && c.col === colIndex)
      if (!cell || !cell.formula) continue
      const value = results[rowIndex]?.[colIndex] ?? ''
      // 单元格位置：表内容起点 + 前面各行 + 行内容起点 + 前面各单元格
      let cellPos = found.pos + 1
      for (let r = 0; r < rowIndex; r += 1) cellPos += rowNodes[r].nodeSize
      cellPos += 1
      for (let c = 0; c < colIndex; c += 1) cellPos += cellNodes[c].nodeSize
      const first = cellNode.firstChild
      if (!first) continue
      const from = cellPos + 2
      const to = cellPos + first.nodeSize
      if (to < from) continue
      tr.setNodeMarkup(cellPos, undefined, {
        ...cellNode.attrs,
        formula: cell.formula,
      })
      if (value) tr.replaceWith(from, to, schema.text(value))
      else tr.delete(from, to)
    }
  }
  ed.view.dispatch(tr)
  closeAllTableUi()
  deps.announceRte('表格公式已计算')
  ElMessage.success(`已计算 ${changed} 个公式单元格`)
}

function duplicateCurrentTableRow() {
  const ed = deps.editor().value
  if (!ed || !duplicateTableRow(ed)) {
    ElMessage.info('请把光标放进表格')
    return
  }
  closeAllTableUi()
  deps.announceRte('已复制当前行')
  ElMessage.success('已复制当前行')
}

function equalizeCurrentTableColumns() {
  const ed = deps.editor().value
  if (!ed || !equalizeTableColumns(ed)) {
    ElMessage.info('请把光标放进表格')
    return
  }
  closeAllTableUi()
  deps.announceRte('已均分列宽')
  ElMessage.success('已均分列宽')
}

function currentTableReadTone(): string {
  return String(deps.editor().value?.getAttributes('table')?.readTone || '')
}

function setTableReadTone(tone: TableReadTone) {
  const ed = deps.editor().value
  if (!ed || !isInTable()) {
    ElMessage.info('请把光标放进表格')
    return
  }
  const ok = ed.chain().focus().setTableReadTone(tone).run()
  if (!ok) {
    ElMessage.info('请把光标放进表格')
    return
  }
  closeAllTableUi()
  const done: Record<TableReadTone, string> = {
    '': '已关闭阅读配色',
    blue: '已套用商务蓝',
    green: '已套用护眼绿',
    orange: '已套用暖橙',
    gray: '已套用淡灰',
    night: '已套用夜间',
  }
  ElMessage.success(done[tone])
}

/** 在当前单元格插入公式模板。 */
function insertCellFormula() {
  const ed = deps.editor().value
  if (!ed || !isInTable()) {
    ElMessage.info('请在表格单元格内操作')
    return
  }
  ed.chain().focus().insertContent('=SUM(ABOVE)').run()
  closeAllTableUi()
  deps.announceRte('已插入公式模板，可在表格菜单里计算')
}

const tableOpItems = computed((): TableOpItem[] => {
  void deps.editor().value?.state
  return [    { key: 'row-before', label: '向上插入行', run: tableAddRowBefore, insertCount: true },
    { key: 'row-after', label: '向下插入行', run: tableAddRowAfter, insertCount: true },
    { key: 'col-before', label: '向左插入列', run: tableAddColBefore, insertCount: true },
    { key: 'col-after', label: '向右插入列', run: tableAddColAfter, insertCount: true },
    { key: 'dup-row', label: '复制当前行', run: duplicateCurrentTableRow },
    { key: 'equal-cols', label: '均分列宽', run: equalizeCurrentTableColumns },
    {
      key: 'del-row',
      label: '删除行',
      run: tableDeleteRow,
      sepBefore: true,
    },
    { key: 'del-col', label: '删除列', run: tableDeleteCol },
    {
      key: 'merge',
      label: '合并单元格',
      run: tableMergeCells,
      disabled: () => !canMergeCells(),
      sepBefore: true,
    },
    {
      key: 'split',
      label: '拆分单元格',
      run: tableSplitCell,
      disabled: () => !canSplitCell(),
    },
    {
      key: 'header',
      label: '切换表头行',
      run: tableToggleHeaderRow,
      sepBefore: true,
    },
    {
      key: 'header-col',
      label: '切换表头列',
      run: tableToggleHeaderColumn,
    },
    {
      key: 'clear-cell',
      label: '清除单元格格式',
      run: tableClearCellFormat,
    },
    {
      key: 'cell-formula',
      label: '插入公式',
      run: insertCellFormula,
      sepBefore: true,
    },
    {
      key: 'calc-formula',
      label: '计算公式',
      run: calcTableFormulas,
    },
    {
      key: 'valign-top',
      label: '垂直对齐·顶',
      run: () => applyCellValign('top'),
    },
    {
      key: 'valign-middle',
      label: '垂直对齐·中',
      run: () => applyCellValign('middle'),
    },
    {
      key: 'valign-bottom',
      label: '垂直对齐·底',
      run: () => applyCellValign('bottom'),
    },
    {
      key: 'align-left',
      label: '单元格左对齐',
      run: () => applyCellTextAlign('left'),
    },
    {
      key: 'align-center',
      label: '单元格居中',
      run: () => applyCellTextAlign('center'),
    },
    {
      key: 'align-right',
      label: '单元格右对齐',
      run: () => applyCellTextAlign('right'),
    },
    {
      key: 'sort-asc',
      label: '按当前列升序',
      run: () => doSortTable(true),
    },
    {
      key: 'sort-desc',
      label: '按当前列降序',
      run: () => doSortTable(false),
    },
    {
      key: 'sum-row',
      label: '简易合计行',
      run: () => doTableSumRow(),
    },
    {
      key: 'sticky-header',
      label: '表头冻结开关',
      run: () => toggleTableStickyHeader(),
      sepBefore: true,
    },
    {
      key: 'sticky-col',
      label: '首列冻结开关',
      run: () => toggleTableStickyCol(),
    },
    {
      key: 'copy-csv',
      label: '复制为 CSV',
      run: () => { void copyCurrentTable('csv') },
      sepBefore: true,
    },
    {
      key: 'copy-tsv',
      label: '复制为 TSV',
      run: () => { void copyCurrentTable('tsv') },
    },
    {
      key: 'row-filter',
      label: '行筛选…',
      run: () => { void promptTableRowFilter() },
    },
    {
      key: 'read-off',
      label: '关闭阅读',
      run: () => setTableReadTone(''),
      active: () => currentTableReadTone() === '',
    },
    {
      key: 'read-blue',
      label: '商务蓝',
      run: () => setTableReadTone('blue'),
      active: () => currentTableReadTone() === 'blue',
    },
    {
      key: 'read-green',
      label: '护眼绿',
      run: () => setTableReadTone('green'),
      active: () => currentTableReadTone() === 'green',
    },
    {
      key: 'read-orange',
      label: '暖橙',
      run: () => setTableReadTone('orange'),
      active: () => currentTableReadTone() === 'orange',
    },
    {
      key: 'read-gray',
      label: '淡灰',
      run: () => setTableReadTone('gray'),
      active: () => currentTableReadTone() === 'gray',
    },
    {
      key: 'read-night',
      label: '夜间',
      run: () => setTableReadTone('night'),
      active: () => currentTableReadTone() === 'night',
    },
    {
      key: 'del-table',
      label: '删除表格',
      run: tableDeleteTable,
      danger: true,
      sepBefore: true,
    },
  ]
})


/**
 * 紧凑「更多」：表外直接开插入弹窗；表内开操作面板。
 * 最大化工具条请用 onTableToolbarButtonClick（表内下拉、表外弹窗）。
 */
function onTableToolClick() {
  if (deps.viewMode().value !== 'edit') return
  deps.moreOpen().value = false
  deps.closeImportMenu()
  deps.closeExportMenu()
  if (isInTable()) {
    rememberTableInsertSelection()
    tableMenuOpen.value = false
    tableOpsSheetOpen.value = true
    closeTableCtx()
    return
  }
  openTableDialog()
}

/** 最大化工具栏「表格」按钮：表外先出尺寸网格；表内切换操作下拉 */
function onTableToolbarButtonClick() {
  if (deps.viewMode().value !== 'edit') return
  deps.moreOpen().value = false
  deps.closeImportMenu()
  deps.headingOpen().value = false
  deps.listOpen().value = false
  deps.formOpen().value = false
  deps.colorOpen().value = false
  deps.highlightOpen().value = false
  deps.alignOpen().value = false
  deps.closeFontMenus()
  if (isInTable()) {
    if (!tableMenuOpen.value) rememberTableInsertSelection()
    tableMenuOpen.value = !tableMenuOpen.value
    tableQuickOpen.value = false
    closeTableCtx()
    return
  }
  const nextQuick = !tableQuickOpen.value
  closeTableMenu()
  if (nextQuick) tableQuickHover.value = { rows: 0, cols: 0 }
  tableQuickOpen.value = nextQuick
}


  return {
    tableMenuOpen,
    tableOpsSheetOpen,
    tableCtx,
    closeTableCtx,
    openTableContextMenu,
    tableHeaderSticky,
    tableColSticky,
    tableFilterQuery,
    reapplyTableFilter,
    applyCellValign,
    doSortTable,
    doTableSumRow,
    toggleTableStickyHeader,
    copyCurrentTable,
    promptTableRowFilter,
    setTableCellBg,
    setTableCellBorderColor,
    setTableCellBorderStyle,
    tableDialogOpen,
    tableQuickOpen,
    tableQuickHover,
    tableQuickCells,
    tableRows,
    tableCols,
    tableSizeHint,
    tableGridHover,
    TABLE_GRID_MAX_ROWS,
    TABLE_GRID_MAX_COLS,
    resetTableDialog,
    onTableGridHover,
    onTableGridLeave,
    pickTableGridSize,
    openTableDialog,
    closeTableDialog,
    onTableDialogMask,
    clampInt,
    onTableRowsInput,
    onTableColsInput,
    stepTableRows,
    stepTableCols,
    confirmInsertTable,
    isInTable,
    canMergeCells,
    canSplitCell,
    closeTableMenu,
    insertQuickTable,
    onTableQuickKeydown,
    closeTableOpsSheet,
    closeAllTableUi,
    runTableCommand,
    tableAddRowBefore,
    tableAddRowAfter,
    tableAddColBefore,
    tableAddColAfter,
    tableDeleteRow,
    tableDeleteCol,
    tableMergeCells,
    tableSplitCell,
    applyCellTextAlign,
    tableToggleHeaderRow,
    tableToggleHeaderColumn,
    tableDeleteTable,
    tableClearCellFormat,
    insertCellFormula,
    calcTableFormulas,
    tableOpItems,
    tableInsertCounts,
    normalizeTableInsertCount,
    rememberTableInsertSelection,
    onTableToolClick,
    onTableToolbarButtonClick,
  }
}
