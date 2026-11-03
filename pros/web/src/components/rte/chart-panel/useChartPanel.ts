/**
 * 图表属性面板的共享状态（组合式函数）。
 *
 * 面板本身只做「展示 + 收集意图」，真正的 option 改动都在这里落地：
 * - 字段改动按路径写入草稿（chartOptionPath）；
 * - 草稿每次改动都过一遍净化器（rteEchartsOption），保证写回文档的 option 合法；
 * - 数据表格与 JSON 双向同步（chartDataTable，逻辑在 useChartPanelData.ts）；
 * - 数据接口请求构造（chartDataRequest）不在这里做，只暴露配置。
 */
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import {
  getOptionPath,
  setOptionPath,
} from '../../../utils/echarts/chartOptionPath'
import {
  dataModelToJson,
  dataModelToRows,
  optionToDataModel,
  type ChartDataModel,
  type ChartDataRow,
} from '../../../utils/echarts/chartDataTable'
import {
  safeParseEchartsOption,
  sanitizeEchartsOption,
  serializeEchartsOption,
} from '../../../utils/rteEchartsOption'
import { getChartPanelSchema } from '../../../utils/echarts/panelSchemas'
import type { ChartPanelSchema, PanelField } from '../../../utils/echarts/panelSchemas'
import { useChartPanelData } from './useChartPanelData'

/** 面板目标：一个图表块。 */
export type ChartPanelTarget = {
  /** 图表块 id。 */
  chartId: string
  /** 图表类型（类别 id）。 */
  chartType: string
  /** 当前 option（JSON 字符串）。 */
  option: string
  /** 数据接口配置（JSON 字符串）。 */
  dataSource: string
}

/** 字段改动的目标位置。 */
export type ChartFieldScope = 'option' | 'axis' | 'series'

export function useChartPanel() {
  /** 当前选中的图表块。 */
  const target = shallowRef<ChartPanelTarget | null>(null)
  /** option 草稿。 */
  const draft = ref<Record<string, unknown>>({})
  /** 校验错误信息。 */
  const error = ref('')
  /** 提示信息。 */
  const hint = ref('')
  /** 数据编辑视图：表格 / JSON。 */
  const dataView = ref<'table' | 'json'>('table')
  /** JSON 编辑器里的文本。 */
  const dataJson = ref('')
  /** 当前操作的系列下标。 */
  const seriesIndex = ref(0)
  /** 改动计数：宿主据此把草稿写回文档（避免深比较整个 option）。 */
  const revision = ref(0)
  /** 载入时的改动计数：用来判断面板里有没有未写回的本地改动。 */
  const loadedRevision = ref(0)
  function bump() {
    revision.value += 1
  }

  /** 面板里是否有未写回文档的本地改动。 */
  const isDirty = computed(() => revision.value !== loadedRevision.value)

  const schema = computed<ChartPanelSchema>(() =>
    getChartPanelSchema(target.value?.chartType),
  )

  /** 当前图表的系列列表。 */
  const seriesList = computed<Array<Record<string, unknown>>>(() => {
    const list = draft.value.series
    return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []
  })

  /** 数据模型（表格与 JSON 的中间层）。 */
  const dataModel = computed<ChartDataModel>(() => optionToDataModel(draft.value))

  /** 表格行。 */
  const dataRows = computed<ChartDataRow[]>(() => dataModelToRows(dataModel.value))

  /** 系列名（表头）。 */
  const seriesNames = computed<string[]>(() =>
    seriesList.value.map((item, index) =>
      typeof item.name === 'string' && item.name ? item.name : `系列${index + 1}`,
    ),
  )

  /** 载入一个图表块。 */
  function load(next: ChartPanelTarget) {
    target.value = next
    const parsed = safeParseEchartsOption(next.option)
    draft.value = parsed.ok ? (parsed.option as Record<string, unknown>) : {}
    error.value = parsed.ok ? '' : parsed.error || 'option 解析失败'
    hint.value = ''
    dataView.value = 'table'
    seriesIndex.value = 0
    loadedRevision.value = revision.value
    dataJson.value = dataModelToJson(optionToDataModel(draft.value))
  }

  /** 关闭面板。 */
  function close() {
    target.value = null
    draft.value = {}
    error.value = ''
    hint.value = ''
  }

  /** 把草稿写回 option 文本（过净化器）。 */
  function serializeDraft(): string {
    const parsed = sanitizeEchartsOption(JSON.parse(JSON.stringify(draft.value)))
    if (!parsed.ok) {
      error.value = parsed.error || 'option 不合法'
      return ''
    }
    error.value = ''
    return serializeEchartsOption(parsed.option)
  }

  /** 读取字段当前值。 */
  function readField(scope: ChartFieldScope, path: string, index = 0): unknown {
    if (scope === 'option') return getOptionPath(draft.value, path)
    if (scope === 'axis') {
      const axis = getOptionPath(draft.value, path.startsWith('xAxis') ? 'xAxis' : 'yAxis')
      const first = Array.isArray(axis) ? axis[0] : axis
      return getOptionPath(first, path.replace(/^(xAxis|yAxis)\./, ''))
    }
    const series = seriesList.value[index]
    return getOptionPath(series, path)
  }

  /** 写入字段值。 */
  function writeField(scope: ChartFieldScope, path: string, value: unknown, index = 0) {
    if (scope === 'option') {
      setOptionPath(draft.value, path, value)
      return
    }
    if (scope === 'axis') {
      const key = path.startsWith('xAxis') ? 'xAxis' : 'yAxis'
      const axis = getOptionPath(draft.value, key)
      const first = Array.isArray(axis) ? axis[0] : axis
      if (first && typeof first === 'object') {
        setOptionPath(first, path.replace(/^(xAxis|yAxis)\./, ''), value)
      }
      return
    }
    const series = seriesList.value[index]
    if (series && typeof series === 'object') setOptionPath(series, path, value)
  }

  /** 按字段定义读取显示值（统一成字符串 / 布尔）。 */
  function fieldValue(scope: ChartFieldScope, field: PanelField, index = 0): unknown {
    const raw = readField(scope, field.path, index)
    if (field.kind === 'boolean') return raw === true
    if (raw === undefined || raw === null) return field.kind === 'number' ? null : ''
    if (field.kind === 'json') return JSON.stringify(raw)
    return String(raw)
  }

  /** 按字段定义写值（把字符串转成正确类型）。 */
  function setFieldValue(scope: ChartFieldScope, field: PanelField, raw: unknown, index = 0) {
    let value: unknown = raw
    if (field.kind === 'number') {
      const num = Number(raw)
      value = raw === '' || raw === null || !Number.isFinite(num) ? undefined : num
    } else if (field.kind === 'boolean') {
      value = raw === true
    } else if (field.kind === 'json') {
      const text = String(raw ?? '').trim()
      if (!text) {
        value = undefined
      } else {
        try {
          value = JSON.parse(text)
        } catch {
          error.value = 'JSON 格式错误'
          return
        }
      }
    } else {
      value = raw === '' ? undefined : String(raw)
    }
    writeField(scope, field.path, value, index)
    error.value = ''
    bump()
  }

  /** 用整个 option JSON 覆盖草稿。 */
  function applyFullJson(text: string): boolean {
    const parsed = safeParseEchartsOption(text)
    if (!parsed.ok) {
      error.value = parsed.error || 'option 不合法'
      return false
    }
    error.value = ''
    draft.value = parsed.option as Record<string, unknown>
    dataJson.value = dataModelToJson(optionToDataModel(draft.value))
    bump()
    return true
  }

  /** 数据编辑（表格 ⇄ JSON）相关方法。 */
  const data = useChartPanelData({
    getDraft: () => draft.value,
    setDraft: (next) => {
      draft.value = next
    },
    getDataModel: () => dataModel.value,
    getRows: () => dataRows.value,
    getSeriesNames: () => seriesNames.value,
    setDataJson: (text) => {
      dataJson.value = text
    },
    setError: (text) => {
      error.value = text
    },
    getSeriesIndex: () => seriesIndex.value,
    setSeriesIndex: (index) => {
      seriesIndex.value = index
    },
    bump,
  })

  watch(
    () => target.value?.chartId,
    () => {
      dataJson.value = dataModelToJson(optionToDataModel(draft.value))
    },
  )

  return reactive({
    target,
    draft,
    error,
    hint,
    schema,
    seriesList,
    seriesNames,
    dataModel,
    dataRows,
    dataView,
    dataJson,
    seriesIndex,
    revision,
    isDirty,
    load,
    close,
    serializeDraft,
    fieldValue,
    setFieldValue,
    ...data,
    applyFullJson,
  })
}
