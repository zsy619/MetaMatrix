/**
 * 图表属性面板的宿主状态（哪个图表块被选中、面板写回文档）。
 *
 * 图表块是原子节点，位置会随编辑漂移，所以面板用稳定的 chartId 定位，
 * 每次写回都重新在文档里找一次该 id 的节点。
 */
import { computed, reactive, ref, shallowRef, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import { serializeEchartsOption } from '../../../utils/rteEchartsOption'
import {
  parseDataSourceConfig,
  serializeDataSourceConfig,
  type ChartDataSourceConfig,
} from '../../../utils/echarts/chartDataSource'

/** 面板当前目标。 */
export type ChartPanelHostTarget = {
  chartId: string
  chartType: string
  option: string
  dataSource: string
}

/** 找到文档里指定 chartId 的图表块位置。 */
export function findChartBlockPos(editor: Editor | undefined, chartId: string): number | null {
  if (!editor || !chartId) return null
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name !== 'echartsBlock') return true
    const attrs = node.attrs as { chartId?: string }
    if (attrs.chartId === chartId) {
      found = pos
      return false
    }
    return true
  })
  return found
}

export function useChartPanelHost(editorRef: Ref<Editor | undefined>) {
  const open = ref(false)
  const target = shallowRef<ChartPanelHostTarget | null>(null)
  const error = ref('')

  /** 当前图表类型（面板 schema 的依据）。 */
  const chartType = computed(() => target.value?.chartType || '')

  /** 打开面板。 */
  function show(next: ChartPanelHostTarget) {
    target.value = next
    error.value = ''
    open.value = true
  }

  /** 关闭面板。 */
  function hide() {
    open.value = false
    target.value = null
  }

  /** 写回节点属性。 */
  function patchAttrs(patch: Record<string, unknown>): boolean {
    const ed = editorRef.value
    const id = target.value?.chartId
    if (!ed || !id) return false
    const pos = findChartBlockPos(ed, id)
    if (pos === null) {
      error.value = '图表块已被删除'
      return false
    }
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(pos, undefined, {
        ...(ed.state.doc.nodeAt(pos)?.attrs as Record<string, unknown>),
        ...patch,
      }),
    )
    return true
  }

  /** 写回 option。 */
  function applyOption(option: unknown): boolean {
    return patchAttrs({ option: serializeEchartsOption(option) })
  }

  /** 写回数据接口配置（不含明文密钥）。 */
  function applyDataSource(config: ChartDataSourceConfig): boolean {
    return patchAttrs({ dataSource: serializeDataSourceConfig(config) })
  }

  /** 读取当前数据接口配置。 */
  function currentDataSource(): ChartDataSourceConfig {
    return parseDataSourceConfig(target.value?.dataSource || '')
  }

  /** 删除图表块。 */
  function remove(): boolean {
    const ed = editorRef.value
    const id = target.value?.chartId
    if (!ed || !id) return false
    const pos = findChartBlockPos(ed, id)
    if (pos === null) {
      error.value = '图表块已被删除'
      return false
    }
    const node = ed.state.doc.nodeAt(pos)
    if (!node) return false
    ed.view.dispatch(ed.state.tr.delete(pos, pos + node.nodeSize))
    hide()
    return true
  }

  return reactive({
    open,
    target,
    error,
    chartType,
    show,
    hide,
    patchAttrs,
    applyOption,
    applyDataSource,
    currentDataSource,
    remove,
  })
}
