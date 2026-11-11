/**
 * 属性面板顶部的小预览。和正文用同一套补轴，避免侧栏能画、正文报 xAxis "0" not found。
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { ensureRenderableChartOption } from '../../../utils/echarts/chartRenderGuard'

type PreviewChart = {
  setOption: (option: unknown, opts?: { notMerge?: boolean }) => void
  dispose: () => void
  resize: () => void
}

export function useChartPanelPreview(source: {
  visible: Ref<boolean>
  option: Ref<Record<string, unknown>>
  tick: Ref<number>
}) {
  const previewEl = ref<HTMLElement | null>(null)
  const previewError = ref('')
  let previewChart: PreviewChart | null = null
  let previewToken = 0

  async function paintPreview() {
    const host = previewEl.value
    const token = ++previewToken
    if (!host || !source.visible.value) return
    const option = source.option.value
    if (!option || !Object.keys(option).length) {
      previewChart?.dispose()
      previewChart = null
      previewError.value = ''
      host.replaceChildren()
      return
    }
    const mod = await import('echarts')
    if (token !== previewToken || !previewEl.value) return
    if (!previewChart) {
      previewEl.value.replaceChildren()
      previewChart = mod.init(previewEl.value, undefined, { renderer: 'svg', height: 180 })
    }
    try {
      previewChart.setOption(ensureRenderableChartOption(option), { notMerge: true })
      previewError.value = ''
      previewChart.resize()
    } catch (err) {
      previewError.value = err instanceof Error ? err.message : '图表预览失败'
    }
  }

  watch([source.visible, source.tick], () => {
    void paintPreview()
  })

  onBeforeUnmount(() => {
    previewChart?.dispose()
    previewChart = null
  })

  return { previewEl, previewError, paintPreview }
}
