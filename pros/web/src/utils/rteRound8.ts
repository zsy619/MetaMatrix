/** 第八轮：只读快捷键、大文档粘贴、目录扫描节奏、弹层焦点。 */

export function pasteVolume(chars: number): 'ok' | 'warn' | 'reject' {
  if (!Number.isFinite(chars) || chars < 200_000) return 'ok'
  if (chars < 1_200_000) return 'warn'
  return 'reject'
}

export function previewShortcutAllowed(input: {
  key: string
  alt: boolean
  shift: boolean
}): boolean {
  const key = input.key.toLowerCase()
  if (!input.alt && !input.shift && (key === 'c' || key === 'a' || key === '/')) return true
  if (input.alt && !input.shift && (key === 'p' || key === 'e' || key === '\\' || key === '|')) {
    return true
  }
  return false
}

/** 正文越长，标题/批注扫描越疏，避免每次击键都序列化整篇 HTML。 */
export function docChromeDelay(nodeSize: number): number {
  if (!Number.isFinite(nodeSize) || nodeSize < 20_000) return 280
  if (nodeSize < 80_000) return 520
  return 900
}

export function snapshotDue(
  previousSize: number,
  nextSize: number,
  elapsedMs: number,
  minGapMs = 15000,
  minDelta = 80,
): boolean {
  if (previousSize <= 0) return true
  if (nextSize === previousSize && elapsedMs < minGapMs) return false
  if (elapsedMs >= minGapMs) return true
  return Math.abs(nextSize - previousSize) >= minDelta
}

export function topOpenModal(
  flags: Readonly<Record<string, boolean>>,
  order: readonly string[],
): string | null {
  for (const id of order) {
    if (flags[id]) return id
  }
  return null
}

export const DIALOG_FOCUS_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export function focusDialogRoot(
  root: { querySelector: (selector: string) => unknown } | null,
): boolean {
  const el = root?.querySelector(DIALOG_FOCUS_SELECTOR) as { focus?: () => void } | null
  if (!el || typeof el.focus !== 'function') return false
  el.focus()
  return true
}

export const RTE_OVERLAY_CLOSE_ORDER = [
  'ask',
  'linkImport',
  'image',
  'video',
  'formula',
  'table',
  'note',
  'attach',
  'snippet',
  'xref',
  'readTime',
  'linkCard',
  'wave21',
  'find',
  'link',
  'print',
  'wordCount',
  'shortcuts',
  'blockMenu',
  'notes',
  'history',
] as const
