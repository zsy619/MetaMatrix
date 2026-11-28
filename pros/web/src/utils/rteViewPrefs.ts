/**
 * 表头冻结、暗色编辑区、缩放。按面板记在本机，不进画布 JSON，也不改页面大小和页边距。
 * 缺省值不落键。旧文档没有这些键时仍是关闭、100%。
 * 专注模式和纸张参考线仍只留在当前会话。
 */

export const RTE_VIEW_ZOOMS = [0.75, 0.9, 1, 1.25, 1.5] as const

export type RteViewPref = {
  sticky: boolean
  stickyCol: boolean
  dark: boolean
  zoom: number
}

const DEFAULT_PREF: RteViewPref = { sticky: false, stickyCol: false, dark: false, zoom: 1 }

export function rteViewPrefKey(panelId: string): string {
  return `mm.rte.viewPrefs.v1:${panelId}`
}

export function readRteViewPref(storage: Storage | null | undefined, panelId: string | null | undefined): RteViewPref {
  if (!storage || !panelId) return { ...DEFAULT_PREF }
  try {
    const raw = storage.getItem(rteViewPrefKey(panelId))
    if (!raw) return { ...DEFAULT_PREF }
    const data = JSON.parse(raw) as Record<string, unknown>
    const zoom = typeof data.zoom === 'number' && (RTE_VIEW_ZOOMS as readonly number[]).includes(data.zoom) ? data.zoom : 1
    return {
      sticky: data.sticky === true,
      stickyCol: data.stickyCol === true,
      dark: data.dark === true,
      zoom,
    }
  } catch {
    return { ...DEFAULT_PREF }
  }
}

export function writeRteViewPref(
  storage: Storage | null | undefined,
  panelId: string | null | undefined,
  pref: RteViewPref,
): void {
  if (!storage || !panelId) return
  const key = rteViewPrefKey(panelId)
  if (!pref.sticky && !pref.stickyCol && !pref.dark && pref.zoom === 1) {
    storage.removeItem(key)
    return
  }
  const stored: Record<string, boolean | number> = {}
  if (pref.sticky) stored.sticky = true
  if (pref.stickyCol) stored.stickyCol = true
  if (pref.dark) stored.dark = true
  if (pref.zoom !== 1) stored.zoom = pref.zoom
  storage.setItem(key, JSON.stringify(stored))
}
