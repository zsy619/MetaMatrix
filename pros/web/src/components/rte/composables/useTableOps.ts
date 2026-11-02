import { computed, nextTick, ref, watch, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { moveTableGridHover, TABLE_QUICK_COLS, TABLE_QUICK_ROWS } from '../../../utils/rteTableGrid'
import { copyTableAs, applyTableRowFilter } from '../../../utils/rteWave21'
import {
  setCellVerticalAlign,
  sortTableByColumn,
  upsertTableSumRow,
  currentTableColIndex,
} from '../../rteWave20'

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
  tableCtx.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
  }
  tableMenuOpen.value = false
  tableOpsSheetOpen.value = false
}

const tableHeaderSticky = ref(false)
const tableFilterQuery = ref('')

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
  const hidden = applyTableRowFilter(ed, tableFilterQuery.value)
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
/** 尺寸网格悬停预览（Word 风格） */
const tableGridHover = ref({ rows: 0, cols: 0 })
const TABLE_GRID_MAX_ROWS = 8
const TABLE_GRID_MAX_COLS = 20

function resetTableDialog() {
  tableRows.value = 3
  tableCols.value = 3
  tableGridHover.value = { rows: 0, cols: 0 }
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
  tableDialogOpen.value = true
  deps.moreOpen().value = false
  deps.focusOpenDialog()
  tableMenuOpen.value = false
  tableOpsSheetOpen.value = false
  closeTableCtx()
}

function closeTableDialog() {
  tableDialogOpen.value = false
  resetTableDialog()
}

function clampInt(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, Math.trunc(v)))
}

function onTableRowsInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const n = parseInt(raw, 10)
  tableRows.value = clampInt(Number.isNaN(n) ? 1 : n, 1, 100)
}

function onTableColsInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const n = parseInt(raw, 10)
  tableCols.value = clampInt(Number.isNaN(n) ? 1 : n, 1, TABLE_GRID_MAX_COLS)
}

function stepTableRows(delta: number) {
  tableRows.value = clampInt(tableRows.value + delta, 1, 100)
}

function stepTableCols(delta: number) {
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
type TableOpItem = {
  key: string
  label: string
  run: () => void
  disabled?: () => boolean
  danger?: boolean
  sepBefore?: boolean
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

function tableAddRowBefore() {
  runTableCommand(() => deps.editor().value!.chain().focus().addRowBefore().run())
}
function tableAddRowAfter() {
  runTableCommand(() => deps.editor().value!.chain().focus().addRowAfter().run())
}
function tableAddColBefore() {
  runTableCommand(() => deps.editor().value!.chain().focus().addColumnBefore().run())
}
function tableAddColAfter() {
  runTableCommand(() => deps.editor().value!.chain().focus().addColumnAfter().run())
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
function tableDeleteTable() {
  runTableCommand(() => deps.editor().value!.chain().focus().deleteTable().run())
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

const tableOpItems = computed((): TableOpItem[] => {
  void deps.editor().value?.state
  return [
    { key: 'row-before', label: '向上插入行', run: tableAddRowBefore },
    { key: 'row-after', label: '向下插入行', run: tableAddRowAfter },
    { key: 'col-before', label: '向左插入列', run: tableAddColBefore },
    { key: 'col-after', label: '向右插入列', run: tableAddColAfter },
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
    tableMenuOpen.value = false
    tableOpsSheetOpen.value = true
    closeTableCtx()
    return
  }
  const nextQuick = !tableQuickOpen.value
  closeTableMenu()
  if (nextQuick) tableQuickHover.value = { rows: 0, cols: 0 }
  tableQuickOpen.value = nextQuick
}

/** 最大化工具栏「表格」按钮：表外网格插入；表内切换操作下拉 */
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
    tableFilterQuery,
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
    tableGridHover,
    TABLE_GRID_MAX_ROWS,
    TABLE_GRID_MAX_COLS,
    resetTableDialog,
    onTableGridHover,
    onTableGridLeave,
    pickTableGridSize,
    openTableDialog,
    closeTableDialog,
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
    tableOpItems,
    onTableToolClick,
    onTableToolbarButtonClick,
  }
}
