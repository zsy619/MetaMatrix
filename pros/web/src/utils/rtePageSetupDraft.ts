/**
 * 页面设置弹窗的草稿。确认前不写文档。
 * 没改过的尺寸和边距返回 null，调用方不要落库，避免把已有页面设置重写一遍。
 */
import { normalizePageChrome, type PanelPageChrome } from './rtePageChrome'
import { marginsEqual, PAGE_MARGIN_PRESETS, type PageMargin } from './rtePageMargin'
import { normalizePageSize, type RtePageSizeId } from './rtePageSize'

export type PageSetupDraft = {
  size: string
  marginPreset: string
  header: string
  footer: string
  pageNumber: string
}

export type PageSetupSnap = {
  size: RtePageSizeId
  margin: PageMargin
  chrome: PanelPageChrome
}

export function pageSetupDraftOf(snap: PageSetupSnap): PageSetupDraft {
  return {
    size: snap.size,
    marginPreset: snap.margin.preset,
    header: snap.chrome.header,
    footer: snap.chrome.footer,
    pageNumber: snap.chrome.pageNumber,
  }
}

export function pageSetupDraftDirty(base: PageSetupDraft, draft: PageSetupDraft): boolean {
  return (
    base.size !== draft.size ||
    base.marginPreset !== draft.marginPreset ||
    base.header !== draft.header ||
    base.footer !== draft.footer ||
    base.pageNumber !== draft.pageNumber
  )
}

function chromeEqual(a: PanelPageChrome, b: PanelPageChrome): boolean {
  return a.header === b.header && a.footer === b.footer && a.pageNumber === b.pageNumber
}

/** 有差异时返回确认后应写入的快照；与当前一致时返回 null。 */
export function resolvePageSetupDraft(current: PageSetupSnap, draft: PageSetupDraft): PageSetupSnap | null {
  const preset = PAGE_MARGIN_PRESETS.find((item) => item.id === draft.marginPreset)
  const margin: PageMargin = preset
    ? { preset: preset.id, ...preset.box }
    : draft.marginPreset === 'custom'
      ? { ...current.margin, preset: 'custom' }
      : { ...current.margin }
  const next: PageSetupSnap = {
    size: normalizePageSize(draft.size),
    margin,
    chrome: normalizePageChrome({
      header: draft.header,
      footer: draft.footer,
      pageNumber: draft.pageNumber,
    }),
  }
  if (next.size === current.size && marginsEqual(next.margin, current.margin) && chromeEqual(next.chrome, current.chrome)) {
    return null
  }
  return next
}
