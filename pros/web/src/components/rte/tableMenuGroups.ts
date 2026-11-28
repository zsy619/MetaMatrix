/** 表格菜单分组。右键、工具栏下拉、操作面板共用，避免漏项。 */
export const TABLE_MENU_GROUPS = [
  { id: 'insert', label: '插入', title: '插入行或列', keys: ['row-before', 'row-after', 'col-before', 'col-after'] },
  { id: 'cell', label: '单元格', title: '合并、拆分和对齐', keys: ['merge', 'split', 'clear-cell', 'valign-top', 'valign-middle', 'valign-bottom', 'align-left', 'align-center', 'align-right'] },
  { id: 'head', label: '表头', title: '表头行、表头列和冻结', keys: ['header', 'header-col', 'sticky-header', 'sticky-col'] },
  { id: 'data', label: '数据', title: '排序、合计、筛选和复制', keys: ['dup-row', 'equal-cols', 'cell-formula', 'calc-formula', 'sum-row', 'sort-asc', 'sort-desc', 'row-filter', 'copy-csv', 'copy-tsv'] },
  { id: 'read', label: '阅读', title: '只改显示颜色，不改表格内容', keys: ['read-off', 'read-blue', 'read-green', 'read-orange', 'read-gray', 'read-night'] },
  { id: 'delete', label: '删除', title: '删除行、列或整张表', keys: ['del-row', 'del-col', 'del-table'] },
] as const

export function placeMenuFlyout(anchor: HTMLElement, flyoutWidth = 248): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect()
  const flip = rect.right + flyoutWidth + 8 > window.innerWidth
  return {
    top: Math.max(8, rect.top),
    left: flip ? Math.max(8, rect.left - flyoutWidth - 4) : rect.right + 4,
  }
}
