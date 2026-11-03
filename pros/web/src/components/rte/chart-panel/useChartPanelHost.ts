/**
 * 图表属性面板的宿主状态（哪个图表块被选中、面板写回文档）。
 *
 * 图表块是原子节点，位置会随编辑漂移，所以面板用稳定的 chartId 定位，
 * 每次写回都重新在文档里找一次该 id 的节点。
 */
import { computed, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
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
    const tr = ed.state.tr.setNodeMarkup(pos, undefined, {
      ...(ed.state.doc.nodeAt(pos)?.attrs as Record<string, unknown>),
      ...patch,
    })
    // 属性面板的每次改动都要能撤销
    tr.setMeta('addToHistory', true)
    ed.view.dispatch(tr)
    return true
  }

  /** 写回 option。 */
  function applyOption(option: unknown): boolean {
    return patchAttrs({ option: serializeEchartsOption(option) })
  }

  /** 读回文档里当前图表块的 option 文本（面板用来确认改动是否真的落到了文档）。 */
  function readOption(): string {
    return readOptionById(target.value?.chartId || '')
  }

  /** 按 chartId 读回 option 文本（面板关闭后也能用）。 */
  function readOptionById(chartId: string): string {
    const ed = editorRef.value
    if (!ed || !chartId) return ''
    const pos = findChartBlockPos(ed, chartId)
    if (pos === null) return ''
    const attrs = ed.state.doc.nodeAt(pos)?.attrs as { option?: string } | undefined
    return attrs?.option || ''
  }

  /** 按 chartId 写回 option（面板被外部回写关掉后也能用）。 */
  function applyOptionById(chartId: string, option: unknown): boolean {
    const ed = editorRef.value
    if (!ed || !chartId) return false
    const pos = findChartBlockPos(ed, chartId)
    if (pos === null) {
      error.value = '图表块已被删除'
      return false
    }
    const tr = ed.state.tr.setNodeMarkup(pos, undefined, {
      ...(ed.state.doc.nodeAt(pos)?.attrs as Record<string, unknown>),
      option: serializeEchartsOption(option),
    })
    tr.setMeta('addToHistory', true)
    ed.view.dispatch(tr)
    return true
  }

  /** 重新选中图表块（写回后保持选中，面板不会因为选区变化而关闭）。 */
  function reselect(): void {
    const ed = editorRef.value
    const id = target.value?.chartId
    if (!ed || !id) return
    const pos = findChartBlockPos(ed, id)
    if (pos === null) return
    const node = ed.state.doc.nodeAt(pos)
    if (!node) return
    try {
      const tr = ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos))
      ed.view.dispatch(tr)
    } catch {
      /* 位置无效时忽略 */
    }
  }

  /**
   * 订阅编辑器的每一次事务（面板用来发现「写回被外部覆盖」）。
   *
   * 监听 transaction 而不是 update：父组件回写 HTML 走的是
   * setContent(..., { emitUpdate: false })，不会触发 update 事件。
   *
   * 编辑器实例是 onMounted 才创建的（useEditor），所以订阅要跟着编辑器走：
   * 编辑器换了一个，就把监听重新挂上去。
   */
  const txListeners = new Set<() => void>()
  let boundEditor: Editor | undefined

  function bindEditor(next: Editor | undefined) {
    if (boundEditor) {
      for (const cb of txListeners) boundEditor.off('transaction', cb)
    }
    boundEditor = next
    if (boundEditor) {
      for (const cb of txListeners) boundEditor.on('transaction', cb)
    }
  }

  watch(
    () => editorRef.value,
    (ed) => bindEditor(ed),
    { immediate: true },
  )

  function onTransaction(cb: () => void): () => void {
    txListeners.add(cb)
    boundEditor?.on('transaction', cb)
    return () => {
      txListeners.delete(cb)
      boundEditor?.off('transaction', cb)
    }
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
    readOption,
    readOptionById,
    applyOptionById,
    reselect,
    onTransaction,
    applyDataSource,
    currentDataSource,
    remove,
  })
}
