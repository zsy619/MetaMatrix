/**
 * 属性面板顶部的小预览。和正文用同一套补轴，避免侧栏能画、正文报 xAxis "0" not found。
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { ensureRenderableChartOption } from '../../../utils/echarts/chartRenderGuard'
import { chartRenderOption, type ChartRenderMode } from '../../../utils/rteChartTheme'

type PreviewChart = {
  setOption: (option: unknown, opts?: { notMerge?: boolean }) => void
  dispose: () => void
  resize: (size?: { width?: number; height?: number }) => void
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
  let previewObserver: ResizeObserver | null = null
  let previewOpened = false

  function resizePreview() {
    const host = previewEl.value
    if (!previewChart || !host) return
    const width = host.clientWidth
    const height = host.clientHeight
    if (width < 2 || height < 2) return
    previewChart.resize({ width, height })
  }

  function watchPreviewSize() {
    const host = previewEl.value
    if (!host || previewObserver || typeof ResizeObserver === 'undefined') return
    previewObserver = new ResizeObserver(() => resizePreview())
    previewObserver.observe(host)
  }

  async function paintPreview() {
    const host = previewEl.value
    const token = ++previewToken
    if (!host || !source.visible.value) return
    const option = source.option.value
    if (!option || !Object.keys(option).length) {
      previewChart?.dispose()
      previewChart = null
      previewOpened = false
      previewError.value = ''
      host.replaceChildren()
      return
    }
    const mod = await import('echarts')
    if (token !== previewToken || !previewEl.value) return
    if (!previewChart) {
      previewEl.value.replaceChildren()
      const width = previewEl.value.clientWidth || 640
      const height = previewEl.value.clientHeight || 240
      previewChart = mod.init(previewEl.value, undefined, { renderer: 'svg', width, height })
    }
    try {
      const host = previewEl.value
      const mode: ChartRenderMode = host.closest('.rte-root')?.classList.contains('is-dark-editor') ? 'dark' : 'light'
      const opening = !previewOpened
      previewOpened = true
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      previewChart.setOption(
        ensureRenderableChartOption(chartRenderOption(option, mode, opening && !reduced ? 'play' : 'still')),
        { notMerge: true },
      )
      previewError.value = ''
      watchPreviewSize()
      resizePreview()
    } catch (err) {
      previewError.value = err instanceof Error ? err.message : '图表预览失败'
    }
  }

  watch([source.visible, source.tick], () => {
    void paintPreview()
  })

  onBeforeUnmount(() => {
    previewObserver?.disconnect()
    previewObserver = null
    previewChart?.dispose()
    previewChart = null
  })

  return { previewEl, previewError, paintPreview }
}
