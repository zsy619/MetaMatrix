/**
 * 图表属性面板与编辑器的桥接。
 *
 * 职责：
 * - 监听编辑器选区，选中图表块（原子节点）时打开属性面板；
 * - 打开前保证图表块有稳定 chartId（旧文档插入的块没有）；
 * - 选中其它内容 / 面板关闭后不再跟随选区反复开关。
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'
import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { createChartId } from '../../../extensions/echartsBlock'
import { useChartPanelHost } from './useChartPanelHost'

export function useChartPanelBridge(editorRef: Ref<Editor | undefined>) {
  const host = useChartPanelHost(editorRef)
  /** 用户是否手动关过面板（关掉后不再自动弹出，直到再次选中图表块）。 */
  let dismissed = false

  /** 保证图表块有 chartId；没有就补一个。 */
  function ensureChartId(pos: number): string | null {
    const ed = editorRef.value
    if (!ed) return null
    const node = ed.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'echartsBlock') return null
    const chartId = String((node.attrs as { chartId?: string }).chartId || '')
    if (chartId) return chartId
    const nextId = createChartId()
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, chartId: nextId }),
    )
    return nextId
  }

  /** 打开某个图表块的面板。 */
  function openFor(pos: number) {
    const ed = editorRef.value
    if (!ed) return
    const node = ed.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'echartsBlock') return
    const chartId = ensureChartId(pos)
    if (!chartId) return
    const attrs = node.attrs as {
      chartType?: string
      option?: string
      dataSource?: string
      tableRef?: string
      chartTitle?: string
      chartUnit?: string
      chartSource?: string
    }
    host.show({
      chartId,
      chartType: attrs.chartType || 'bar',
      option: attrs.option || '',
      dataSource: attrs.dataSource || '',
      tableRef: attrs.tableRef || '',
      chartTitle: attrs.chartTitle || '',
      chartUnit: attrs.chartUnit || '',
      chartSource: attrs.chartSource || '',
    })
  }

  /** 选区变化时同步面板。 */
  function syncFromSelection() {
    const ed = editorRef.value
    if (!ed) return
    const selection = ed.state.selection
    if (!(selection instanceof NodeSelection)) {
      if (host.open) host.hide()
      return
    }
    const node = selection.node
    if (!node || node.type.name !== 'echartsBlock') {
      if (host.open) host.hide()
      return
    }
    if (dismissed) return
    openFor(selection.from)
  }

  const stop = watch(
    () => editorRef.value,
    (ed) => {
      if (!ed) return
      ed.on('selectionUpdate', syncFromSelection)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stop()
    const ed = editorRef.value
    if (ed) ed.off('selectionUpdate', syncFromSelection)
  })

  return {
    host,
    openFor,
    /** 用户主动关闭面板后记一笔，避免选区一变又弹出来。 */
    dismiss() {
      dismissed = true
      host.hide()
    },
    /** 再次选中图表块时恢复自动弹出。 */
    resume() {
      dismissed = false
    },
  }
}
