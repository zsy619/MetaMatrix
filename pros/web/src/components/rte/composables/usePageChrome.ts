import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import {
  EMPTY_PAGE_CHROME,
  estimatePageCount,
  formatPageNumber,
  groupSlides,
  normalizePageChrome,
  pageChromeIsEmpty,
  readPageChrome,
  type PanelPageChrome,
  type PresentUnit,
  type SlideSource,
} from '../../../utils/rtePageChrome'
import { mmToPx, sheetBox, type RtePageSizeId } from '../../../utils/rtePageSize'

/** 页眉页脚页码，以及只读演示（按块 / 按屏）。 */
export function usePageChrome(deps: {
  pageChrome: Ref<PanelPageChrome>
  panelId: () => string | undefined
  chromeMap: () => Record<string, { header?: string; footer?: string; pageNumber?: string }> | null | undefined
  setPanelPageChrome: (panelId: string, chrome: PanelPageChrome) => void
  viewMode: () => string
  editor: () => Editor | undefined
  rootEl: Ref<HTMLElement | null>
  pageSize: () => RtePageSizeId
  margin: () => { top: number; right: number; bottom: number; left: number }
  announce: (message: string) => void
}) {
  const localChrome = ref<PanelPageChrome>({ ...EMPTY_PAGE_CHROME })
  const pageIndex = ref(1)
  const pageCount = ref(1)
  const presentOpen = ref(false)
  const presentUnit = ref<PresentUnit>('screen')
  const presentIndex = ref(0)
  const presentSlides = ref<string[]>(['<p class="rte-present-empty">空白文档</p>'])
  const presentRoot = ref<HTMLElement | null>(null)
  let presentWasEditable = true
  let sawFullscreen = false
  let measureRaf = 0
  let canvasEl: HTMLElement | null = null
  let observer: ResizeObserver | null = null

  const pageChromeActive = computed(() => !pageChromeIsEmpty(deps.pageChrome.value))
  const screenPageLabel = computed(() =>
    formatPageNumber(deps.pageChrome.value.pageNumber, pageIndex.value, pageCount.value),
  )
  const previewPageLabel = computed(() => formatPageNumber(deps.pageChrome.value.pageNumber, 1, pageCount.value))

  function syncFromStore() {
    const panelId = deps.panelId()
    deps.pageChrome.value = panelId ? readPageChrome(deps.chromeMap(), panelId) : { ...localChrome.value }
  }

  watch(() => [deps.panelId(), JSON.stringify(deps.chromeMap() ?? null)] as const, syncFromStore, { immediate: true })

  function publish(next: PanelPageChrome) {
    if (deps.viewMode() !== 'edit') return
    const normalized = normalizePageChrome(next)
    const panelId = deps.panelId()
    if (panelId) deps.setPanelPageChrome(panelId, normalized)
    else localChrome.value = normalized
    deps.pageChrome.value = panelId ? readPageChrome(deps.chromeMap(), panelId) : { ...localChrome.value }
    const label = normalized.header || normalized.footer || formatPageNumber(normalized.pageNumber, 1, pageCount.value) || '已清空'
    deps.announce(`页眉页脚：${label}`)
    scheduleMeasure()
  }

  function setPageHeader(value: string) {
    publish({ ...deps.pageChrome.value, header: value })
  }

  function setPageFooter(value: string) {
    publish({ ...deps.pageChrome.value, footer: value })
  }

  function setPageNumber(value: string) {
    publish({ ...deps.pageChrome.value, pageNumber: normalizePageChrome({ pageNumber: value }).pageNumber })
  }

  function placeChrome() {
    const root = deps.rootEl.value
    if (!root) return
    const body = root.querySelector('.rte-body') as HTMLElement | null
    const header = root.querySelector('.rte-page-header') as HTMLElement | null
    const footer = root.querySelector('.rte-page-footer') as HTMLElement | null
    if (!body) return
    const margin = deps.margin()
    const left = body.offsetLeft + mmToPx(margin.left)
    const width = Math.max(40, body.clientWidth - mmToPx(margin.left) - mmToPx(margin.right))
    const topPad = mmToPx(margin.top)
    const bottomPad = mmToPx(margin.bottom)
    if (header) {
      header.style.left = `${left}px`
      header.style.width = `${width}px`
      header.style.top = `${body.offsetTop + Math.max(2, Math.min(8, topPad - 16))}px`
    }
    if (footer) {
      footer.style.left = `${left}px`
      footer.style.width = `${width}px`
      footer.style.top = `${body.offsetTop + body.clientHeight - bottomPad + Math.max(2, Math.min(8, bottomPad - 16))}px`
    }
  }

  function measurePages() {
    const root = deps.rootEl.value
    const canvas = root?.querySelector('.rte-canvas') as HTMLElement | null
    const body = root?.querySelector('.rte-body') as HTMLElement | null
    if (!canvas || !body) return
    const box = sheetBox(deps.pageSize())
    const margin = deps.margin()
    const inner = box
      ? Math.max(1, box.heightPx - mmToPx(margin.top) - mmToPx(margin.bottom))
      : Math.max(1, canvas.clientHeight || 1)
    const content = Math.max(1, body.scrollHeight - mmToPx(margin.top) - mmToPx(margin.bottom))
    const total = estimatePageCount(content, inner)
    pageCount.value = total
    pageIndex.value = Math.min(total, Math.max(1, Math.floor(canvas.scrollTop / inner) + 1))
    placeChrome()
  }

  function scheduleMeasure() {
    if (measureRaf) return
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0
      measurePages()
    })
  }

  function presentHtml(dom: HTMLElement): string {
    const clone = dom.cloneNode(true) as HTMLElement
    clone.querySelectorAll(
      '.rte-image-drag-handle, .rte-image-group-bar, .rte-image-group-dividers, .rte-image-drop-line, .rte-image-drop-preview, .rte-image-size-tip, .rte-block-tools, [data-resize-handle], .column-resize-handle',
    ).forEach((el) => el.remove())
    return clone.outerHTML
  }

  function slideSources(editor: Editor): SlideSource[] {
    const doms = Array.from(editor.view.dom.childNodes)
    const blocks: SlideSource[] = []
    let index = 0
    editor.state.doc.forEach((node) => {
      const dom = doms[index]
      index += 1
      const html = dom instanceof HTMLElement ? presentHtml(dom) : ''
      const visible =
        !!node.textContent.trim() ||
        node.type.name === 'image' ||
        node.type.name === 'horizontalRule' ||
        /<(img|table|hr|video|svg|iframe)\b/i.test(html)
      if (!visible || !html.trim()) return
      blocks.push({
        html,
        text: node.textContent || '',
        heading: node.type.name === 'heading',
      })
    })
    return blocks
  }

  function rebuildSlides() {
    const ed = deps.editor()
    presentSlides.value = ed && !ed.isDestroyed
      ? groupSlides(slideSources(ed), presentUnit.value)
      : groupSlides([], presentUnit.value)
    if (presentIndex.value >= presentSlides.value.length) presentIndex.value = Math.max(0, presentSlides.value.length - 1)
  }

  function openPresent() {
    const ed = deps.editor()
    if (!ed || ed.isDestroyed) return
    presentWasEditable = ed.isEditable
    ed.setEditable(false)
    ed.commands.blur()
    presentUnit.value = 'screen'
    presentIndex.value = 0
    sawFullscreen = false
    presentOpen.value = true
    rebuildSlides()
    void nextTick(() => {
      presentRoot.value?.focus()
      presentRoot.value?.requestFullscreen?.().catch(() => {
        /* 全屏被拒绝时，固定遮罩仍然盖住编辑区 */
      })
    })
  }

  function closePresent() {
    if (!presentOpen.value) return
    sawFullscreen = false
    presentOpen.value = false
    const ed = deps.editor()
    if (ed && !ed.isDestroyed) ed.setEditable(presentWasEditable && deps.viewMode() === 'edit')
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {
        /* 已经不在全屏 */
      })
    }
  }

  function stepPresent(dir: number) {
    const next = presentIndex.value + dir
    if (next < 0 || next >= presentSlides.value.length) return
    presentIndex.value = next
  }

  function setPresentUnit(unit: PresentUnit) {
    if (presentUnit.value === unit) return
    presentUnit.value = unit
    presentIndex.value = 0
    rebuildSlides()
  }

  function onPresentStageClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('a')) event.preventDefault()
    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    stepPresent(event.clientX - rect.left < rect.width * 0.28 ? -1 : 1)
  }

  function onWindowPresentKey(event: KeyboardEvent) {
    if (!presentOpen.value) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePresent()
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      stepPresent(1)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault()
      event.stopPropagation()
      stepPresent(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      presentIndex.value = 0
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      presentIndex.value = Math.max(0, presentSlides.value.length - 1)
    }
  }

  function onFullscreenChange() {
    if (!presentOpen.value) return
    if (document.fullscreenElement) {
      sawFullscreen = true
      return
    }
    if (sawFullscreen) closePresent()
  }

  onMounted(() => {
    window.addEventListener('keydown', onWindowPresentKey, true)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    canvasEl = deps.rootEl.value?.querySelector('.rte-canvas') ?? null
    canvasEl?.addEventListener('scroll', scheduleMeasure, { passive: true })
    if (canvasEl && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => scheduleMeasure())
      observer.observe(canvasEl)
    }
    scheduleMeasure()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowPresentKey, true)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    canvasEl?.removeEventListener('scroll', scheduleMeasure)
    observer?.disconnect()
    if (measureRaf) cancelAnimationFrame(measureRaf)
    if (presentOpen.value) {
      presentOpen.value = false
      const ed = deps.editor()
      if (ed && !ed.isDestroyed) ed.setEditable(presentWasEditable && deps.viewMode() === 'edit')
    }
  })

  return {
    pageChromeActive,
    screenPageLabel,
    previewPageLabel,
    pageIndex,
    pageCount,
    setPageHeader,
    setPageFooter,
    setPageNumber,
    scheduleMeasure,
    presentOpen,
    presentUnit,
    presentIndex,
    presentSlides,
    presentRoot,
    openPresent,
    closePresent,
    stepPresent,
    setPresentUnit,
    onPresentStageClick,
  }
}
