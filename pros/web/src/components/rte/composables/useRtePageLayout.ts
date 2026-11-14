import { computed, ref, watch } from 'vue'
import {
  cssPageSize,
  DEFAULT_PAGE_SIZE,
  normalizePageSize,
  pageSizeOption,
  readPageSize,
  sheetBox,
  type RtePageSizeId,
} from '../../../utils/rtePageSize'
import {
  PAGE_MARGIN_PRESETS,
  cssPageMargin,
  defaultPageMargin,
  marginsEqual,
  readPageMargin,
  screenMargin,
  type PageMargin,
} from '../../../utils/rtePageMargin'
import { bumpToolbarUndoEpoch } from '../../../utils/rteToolbarGroups'
import { applyChromeReserve, EMPTY_PAGE_CHROME, printSheetCss, shiftGutterSide, type PanelPageChrome } from '../../../utils/rtePageChrome'

/** 页面大小、页边距和打印 @page。与工具栏分组共用一次 Ctrl+Z。 */
export function useRtePageLayout(deps: {
  panelId: () => string | undefined
  pageSizeMap: () => Parameters<typeof readPageSize>[0]
  pageMarginMap: () => Parameters<typeof readPageMargin>[0]
  setPanelPageSize: (panelId: string, size: RtePageSizeId) => void
  setPanelPageMargin: (panelId: string, margin: PageMargin, paper: boolean) => void
  viewMode: () => string
  closePageMenus: () => void
  announce: (message: string) => void
  disarmToolbarUndo: () => void
  toolbarUndoIsNewer: (marginStamp: number) => boolean
  chrome?: () => PanelPageChrome
  /**
   * 是否按「纸张」排版（默认 true）。
   * 画布里嵌入的紧凑区块传 false：正文按内容流式排版，不再撑出 A4 纸张高度。
   * 该开关只影响渲染，不会把页面大小写回文档。
   */
  pageSheet?: () => boolean
}) {
  const localPageSize = ref<RtePageSizeId>(DEFAULT_PAGE_SIZE)
  const localPageMargin = ref<PageMargin | null>(null)
  const pageMarginUndo = ref<PageMargin[]>([])
  let pageMarginUndoArmed = false
  let pageMarginUndoStamp = 0

  const pageSize = computed(() => {
    const panelId = deps.panelId()
    if (panelId) return readPageSize(deps.pageSizeMap(), panelId)
    return localPageSize.value
  })
  const pageSizeMeta = computed(() => pageSizeOption(pageSize.value))
  /** 画布里的紧凑区块按内容流式排版，不套纸张。 */
  const pageSheetEnabled = computed(() => (deps.pageSheet?.() ?? true) !== false)
  /** 只有「允许纸张 + 页面本身就是纸」时才套 A4 白纸样式。 */
  const renderPaper = computed(() => pageSheetEnabled.value && pageSizeMeta.value.paper)
  const pageMargin = computed(() => {
    const panelId = deps.panelId()
    if (panelId) return readPageMargin(deps.pageMarginMap(), panelId, pageSizeMeta.value.paper)
    return localPageMargin.value || defaultPageMargin(pageSizeMeta.value.paper)
  })
  const pageScreenMargin = computed(() => {
    const chrome = deps.chrome?.() || EMPTY_PAGE_CHROME
    const reserved = applyChromeReserve(screenMargin(pageMargin.value, !pageSizeMeta.value.paper), chrome)
    const gutter = chrome.gutter || 0
    return gutter ? { ...reserved, left: reserved.left + gutter } : reserved
  })
  const pageSheetStyle = computed(() => {
    const box = sheetBox(pageSize.value)
    const margin = pageScreenMargin.value
    const style: Record<string, string> = {
      '--rte-margin-top': `${margin.top}mm`,
      '--rte-margin-right': `${margin.right}mm`,
      '--rte-margin-bottom': `${margin.bottom}mm`,
      '--rte-margin-left': `${margin.left}mm`,
    }
    if (box) {
      style['--rte-sheet-width'] = `${box.widthPx}px`
      style['--rte-sheet-min-height'] = `${box.heightPx}px`
    }
    return style
  })
  function printPreviewPaperStyle(page = 1) {
    const chrome = deps.chrome?.() || EMPTY_PAGE_CHROME
    const box = shiftGutterSide(pageScreenMargin.value, chrome.gutter, page)
    const sheet = sheetBox(pageSize.value)
    return {
      padding: cssPageMargin(box),
      width: sheet ? `${sheet.widthPx}px` : '100%',
      minHeight: sheet ? `${sheet.heightPx}px` : undefined,
      maxWidth: '100%',
      margin: '0 auto',
      boxSizing: 'border-box' as const,
    }
  }
  const printPreviewMarginStyle = computed(() => printPreviewPaperStyle(1))

  function applyPrintPageStyle(id: RtePageSizeId) {
    const size = cssPageSize(id)
    const chrome = deps.chrome?.() || EMPTY_PAGE_CHROME
    const box = applyChromeReserve(screenMargin(pageMargin.value, !pageSizeMeta.value.paper), chrome)
    let el = document.getElementById('rte-print-page-size')
    if (!el) {
      el = document.createElement('style')
      el.id = 'rte-print-page-size'
      document.head.appendChild(el)
    }
    el.textContent = printSheetCss(size, box, chrome.gutter)
  }

  function applyPageMargin(next: PageMargin, recordUndo: boolean) {
    if (deps.viewMode() !== 'edit') return
    // 嵌入区块不按纸张渲染：不写回文档里的页边距。
    if (!pageSheetEnabled.value) return
    const prev = pageMargin.value
    if (marginsEqual(prev, next)) return
    if (recordUndo) {
      pageMarginUndo.value = [...pageMarginUndo.value, prev].slice(-20)
      pageMarginUndoStamp = bumpToolbarUndoEpoch()
      pageMarginUndoArmed = true
      deps.disarmToolbarUndo()
    }
    const panelId = deps.panelId()
    if (panelId) deps.setPanelPageMargin(panelId, next, pageSizeMeta.value.paper)
    else localPageMargin.value = next
    deps.announce(`页边距：${next.preset === 'custom' ? '自定义' : next.preset}`)
    applyPrintPageStyle(pageSize.value)
  }

  function undoPageMargin(): boolean {
    if (!pageMarginUndoArmed || !pageMarginUndo.value.length) return false
    if (!pageSheetEnabled.value) return false
    if (deps.toolbarUndoIsNewer(pageMarginUndoStamp)) return false
    const prev = pageMarginUndo.value[pageMarginUndo.value.length - 1]!
    pageMarginUndo.value = pageMarginUndo.value.slice(0, -1)
    pageMarginUndoArmed = pageMarginUndo.value.length > 0
    const panelId = deps.panelId()
    if (panelId) deps.setPanelPageMargin(panelId, prev, pageSizeMeta.value.paper)
    else localPageMargin.value = prev
    deps.announce('已撤销页边距')
    applyPrintPageStyle(pageSize.value)
    return true
  }

  function replacePageMargin(next: PageMargin) {
    applyPageMargin(next, false)
  }

  function setMarginPreset(id: string) {
    const preset = PAGE_MARGIN_PRESETS.find((item) => item.id === id)
    if (preset) {
      applyPageMargin({ preset: preset.id, ...preset.box }, true)
      return
    }
    if (id === 'custom') {
      applyPageMargin({ ...pageMargin.value, preset: 'custom' }, true)
    }
  }

  function setMarginSide(side: 'top' | 'right' | 'bottom' | 'left', value: string) {
    const current = pageMargin.value
    applyPageMargin(
      {
        preset: 'custom',
        top: current.top,
        right: current.right,
        bottom: current.bottom,
        left: current.left,
        [side]: Number(value),
      },
      true,
    )
  }

  function setPageSize(id: string) {
    // 嵌入区块按内容流式排版：不改文档里的页面大小，也不写回。
    if (!pageSheetEnabled.value) {
      deps.closePageMenus()
      deps.announce('嵌入区块按内容排版，页面大小请在独立文档或最大化后设置')
      return
    }
    const next = normalizePageSize(id)
    const panelId = deps.panelId()
    if (panelId) deps.setPanelPageSize(panelId, next)
    else localPageSize.value = next
    deps.closePageMenus()
    applyPrintPageStyle(next)
  }

  watch([pageSize, pageScreenMargin], () => applyPrintPageStyle(pageSize.value), { immediate: true })

  return {
    pageSize,
    pageSizeMeta,
    pageSheetEnabled,
    renderPaper,
    pageMargin,
    pageScreenMargin,
    pageSheetStyle,
    printPreviewMarginStyle,
    printPreviewPaperStyle,
    applyPrintPageStyle,
    undoPageMargin,
    setMarginPreset,
    replacePageMargin,
    setMarginSide,
    setPageSize,
    marginUndoArmed: () => pageMarginUndoArmed,
    marginUndoStamp: () => pageMarginUndoStamp,
    disarmMarginUndo: () => {
      pageMarginUndoArmed = false
    },
  }
}
