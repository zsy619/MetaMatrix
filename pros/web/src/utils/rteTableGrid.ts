/** 表格快速尺寸网格。默认约 10 列 × 8 行。 */

export const TABLE_QUICK_COLS = 10
export const TABLE_QUICK_ROWS = 8

export type TableGridHover = { rows: number; cols: number }

export function moveTableGridHover(
  current: TableGridHover,
  key: string,
  maxRows = TABLE_QUICK_ROWS,
  maxCols = TABLE_QUICK_COLS,
): TableGridHover | 'insert' | 'close' | null {
  if (key === 'Escape') return 'close'
  if (key === 'Enter') return 'insert'
  const dir =
    key === 'ArrowRight' ? { rows: 0, cols: 1 }
    : key === 'ArrowLeft' ? { rows: 0, cols: -1 }
    : key === 'ArrowDown' ? { rows: 1, cols: 0 }
    : key === 'ArrowUp' ? { rows: -1, cols: 0 }
    : null
  if (!dir) return null
  const rows0 = current.rows > 0 ? current.rows : 1
  const cols0 = current.cols > 0 ? current.cols : 1
  return {
    rows: Math.min(maxRows, Math.max(1, rows0 + dir.rows)),
    cols: Math.min(maxCols, Math.max(1, cols0 + dir.cols)),
  }
}
