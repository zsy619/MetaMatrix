/**
 * 图表属性面板的「数据编辑」逻辑（表格 ⇄ JSON 双向同步）。
 *
 * 从 useChartPanel.ts 里拆出来，单独成文件，保证单文件 < 300 行。
 * 这里只管数据：读写表格单元格、增删行列、把结果写回 option 草稿。
 */
import {
  dataModelToJson,
  dataModelToOption,
  jsonToDataModel,
  rowsToDataModel,
  textToValue,
  type ChartDataModel,
  type ChartDataRow,
} from '../../../utils/echarts/chartDataTable'

/** 数据编辑需要的上下文（由 useChartPanel 提供）。 */
export type ChartPanelDataContext = {
  /** 读当前 option 草稿。 */
  getDraft: () => Record<string, unknown>
  /** 写回 option 草稿。 */
  setDraft: (next: Record<string, unknown>) => void
  /** 当前数据模型（表格与 JSON 的中间层）。 */
  getDataModel: () => ChartDataModel
  /** 当前表格行。 */
  getRows: () => ChartDataRow[]
  /** 当前系列名（表头）。 */
  getSeriesNames: () => string[]
  /** 写 JSON 视图的文本。 */
  setDataJson: (text: string) => void
  /** 写错误信息。 */
  setError: (text: string) => void
  /** 读当前操作的系列下标。 */
  getSeriesIndex: () => number
  /** 写当前操作的系列下标。 */
  setSeriesIndex: (index: number) => void
  /** 通知宿主「有本地改动」。 */
  bump: () => void
}

/** 数据编辑相关的方法集合。 */
export function useChartPanelData(ctx: ChartPanelDataContext) {
  /** 复制当前表格行（避免直接改计算值）。 */
  function cloneRows(): ChartDataRow[] {
    return ctx.getRows().map((row) => ({
      category: row.category,
      values: [...row.values],
    }))
  }

  /** 把行写回草稿与 JSON 视图。 */
  function commitRows(rows: ChartDataRow[], names: string[]) {
    const model = rowsToDataModel(rows, names, ctx.getDataModel())
    ctx.setDraft(dataModelToOption(ctx.getDraft(), model))
    ctx.setDataJson(dataModelToJson(model))
    ctx.bump()
  }

  /** 表格里改类目（第一列）。 */
  function setDataCategory(rowIndex: number, text: string) {
    const rows = cloneRows()
    const row = rows[rowIndex]
    if (!row) return
    row.category = text
    commitRows(rows, ctx.getSeriesNames())
  }

  /** 表格单元格改动：写回模型，再写回 option。 */
  function setDataCell(rowIndex: number, colIndex: number, text: string) {
    const rows = cloneRows()
    const row = rows[rowIndex]
    if (!row) return
    row.values[colIndex] = textToValue(text)
    commitRows(rows, ctx.getSeriesNames())
  }

  /** 表格里新增一行。 */
  function addDataRow() {
    const rows = cloneRows()
    const names = ctx.getSeriesNames()
    rows.push({
      category: `类目${rows.length + 1}`,
      values: names.map(() => 0),
    })
    commitRows(rows, names)
  }

  /** 改系列名。图例里的名字一起换。 */
  function renameDataSeries(index: number, text: string) {
    const names = [...ctx.getSeriesNames()]
    if (index < 0 || index >= names.length) return
    names[index] = text.trim() || `系列${index + 1}`
    commitRows(cloneRows(), names)
  }

  /** 表格里删除一行。 */
  function removeDataRow(index: number) {
    const rows = cloneRows().filter((_, i) => i !== index)
    commitRows(rows, ctx.getSeriesNames())
  }

  /** 表格里新增一个系列（列）。 */
  function addDataSeries() {
    const rows = cloneRows()
    const names = [...ctx.getSeriesNames(), `系列${ctx.getSeriesNames().length + 1}`]
    const model = rowsToDataModel(rows, names, ctx.getDataModel())
    const series = Array.isArray(ctx.getDraft().series)
      ? [...(ctx.getDraft().series as Array<Record<string, unknown>>)]
      : []
    const first = series[0]
    series.push({
      name: names[names.length - 1],
      type: typeof first?.type === 'string' ? first.type : 'bar',
      data: rows.map(() => 0),
    })
    ctx.setDraft({ ...ctx.getDraft(), series })
    ctx.setDraft(dataModelToOption(ctx.getDraft(), model))
    ctx.setDataJson(dataModelToJson(model))
    ctx.bump()
  }

  /** 表格里删除一个系列（列）。 */
  function removeDataSeries(index: number) {
    const draft = ctx.getDraft()
    const current = Array.isArray(draft.series)
      ? (draft.series as Array<Record<string, unknown>>)
      : []
    if (current.length <= 1) return
    const series = current.filter((_, i) => i !== index)
    const names = series.map((item, i) =>
      typeof item.name === 'string' && item.name ? item.name : `系列${i + 1}`,
    )
    const rows = ctx.getRows().map((row) => ({
      category: row.category,
      values: row.values.filter((_, i) => i !== index),
    }))
    const model = rowsToDataModel(rows, names, ctx.getDataModel())
    ctx.setDraft({ ...draft, series })
    ctx.setDraft(dataModelToOption(ctx.getDraft(), model))
    ctx.setDataJson(dataModelToJson(model))
    if (ctx.getSeriesIndex() >= series.length) ctx.setSeriesIndex(0)
    ctx.bump()
  }

  /** JSON 视图里应用文本。 */
  function applyDataJson(text: string) {
    const model = jsonToDataModel(text)
    if (!model) {
      ctx.setError('JSON 数据格式错误')
      return
    }
    ctx.setError('')
    ctx.setDraft(dataModelToOption(ctx.getDraft(), model))
    ctx.setDataJson(dataModelToJson(model))
    ctx.bump()
  }

  return {
    setDataCategory,
    setDataCell,
    addDataRow,
    renameDataSeries,
    removeDataRow,
    addDataSeries,
    removeDataSeries,
    applyDataJson,
  }
}
