import { computed, ref, watch } from 'vue'
import {
  cssPageSize,
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
}) {
  const localPageSize = ref<RtePageSizeId>('full')
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
  const pageMargin = computed(() => {
    const panelId = deps.panelId()
    if (panelId) return readPageMargin(deps.pageMarginMap(), panelId, pageSizeMeta.value.paper)
    return localPageMargin.value || defaultPageMargin(pageSizeMeta.value.paper)
  })
  const pageScreenMargin = computed(() => screenMargin(pageMargin.value, !pageSizeMeta.value.paper))
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
  const printPreviewMarginStyle = computed(() => {
    const box = pageSizeMeta.value.paper ? pageMargin.value : pageScreenMargin.value
    return {
      padding: cssPageMargin(box),
      width: pageSizeMeta.value.paper ? 'min(100%, var(--rte-sheet-width, 210mm))' : '100%',
      margin: '0 auto',
      boxSizing: 'border-box' as const,
    }
  })

  function applyPrintPageStyle(id: RtePageSizeId) {
    const size = cssPageSize(id)
    const paper = pageSizeOption(id).paper
    const margin = screenMargin(pageMargin.value, !paper)
    let el = document.getElementById('rte-print-page-size')
    if (!el) {
      el = document.createElement('style')
      el.id = 'rte-print-page-size'
      document.head.appendChild(el)
    }
    el.textContent = `@media print { @page { size: ${size}; margin: ${cssPageMargin(margin)}; } }`
  }

  function applyPageMargin(next: PageMargin, recordUndo: boolean) {
    if (deps.viewMode() !== 'edit') return
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
    const next = normalizePageSize(id)
    const panelId = deps.panelId()
    if (panelId) deps.setPanelPageSize(panelId, next)
    else localPageSize.value = next
    deps.closePageMenus()
    applyPrintPageStyle(next)
  }

  watch([pageSize, pageMargin], () => applyPrintPageStyle(pageSize.value), { immediate: true })

  return {
    pageSize,
    pageSizeMeta,
    pageMargin,
    pageScreenMargin,
    pageSheetStyle,
    printPreviewMarginStyle,
    applyPrintPageStyle,
    undoPageMargin,
    setMarginPreset,
    setMarginSide,
    setPageSize,
    marginUndoArmed: () => pageMarginUndoArmed,
    marginUndoStamp: () => pageMarginUndoStamp,
    disarmMarginUndo: () => {
      pageMarginUndoArmed = false
    },
  }
}
