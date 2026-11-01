import type { CanvasTheme } from '../../types/canvas'
import { toneAt, type TableTone } from './fiveStepPalette'

/**
 * Soft worksheet chrome shared with the human-AI dual triangle and five-step sheets.
 * Selection and focus stay inside the same ink family as the column palette
 * (business-topic navy) so states don't jump to a separate link blue.
 */
export const CANVAS_CHROME = {
  page: '#f7f7f7',
  frame: '#ececec',
  hairline: 'rgba(60, 50, 20, 0.08)',
  ink: '#3c4043',
  inkStrong: '#202124',
  muted: '#5f6368',
  select: 'rgba(22, 40, 64, 0.9)',
  selectSoft: 'rgba(22, 40, 64, 0.42)',
  focus: '#163044',
  hoverWash: '#e8f1fa',
  headerShadow:
    '0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28)',
} as const

/**
 * Prototype page washes. Treated as unset so older documents pick up the soft page.
 * A custom color that is not in this set is kept.
 */
const LEGACY_PAGE = new Set([
  '#fff',
  '#ffffff',
  '#fcfcfc',
  '#f3f3f3',
  '#f4f5f7',
  '#f2f2f2',
  '#f7f5f0',
  '#f5efe6',
  '#f6f6f6',
  '#fafafa',
  '#f5f5f4',
  '#f8f2d4',
  '#f7f1cc',
  '#e6f7ff',
  '#fdf5e6',
  '#f5f0e8',
])

function trimmed(value: string | undefined | null): string {
  return value?.trim() || ''
}

export function isLegacyPageColor(color: string | undefined | null): boolean {
  const raw = trimmed(color).toLowerCase()
  return !!raw && LEGACY_PAGE.has(raw)
}

export function canvasPageColor(theme?: Partial<CanvasTheme> | null): string {
  const page = trimmed(theme?.page)
  if (page && !LEGACY_PAGE.has(page.toLowerCase())) return page
  const raw = trimmed(theme?.background?.color)
  if (raw && !LEGACY_PAGE.has(raw.toLowerCase())) return raw
  return CANVAS_CHROME.page
}

/**
 * Fill missing chrome tokens and collapse prototype page washes.
 * An explicit frame, hairline, or non-legacy page color is kept.
 */
export function normalizeCanvasTheme(
  theme?: Partial<CanvasTheme> | null,
): CanvasTheme {
  const page = canvasPageColor(theme)
  const background = theme?.background
  const frame = trimmed(theme?.frame) || CANVAS_CHROME.frame
  const hairline = trimmed(theme?.hairline) || CANVAS_CHROME.hairline
  return {
    background: {
      pattern: background?.pattern || 'none',
      color: trimmed(background?.color) || page,
    },
    page,
    frame,
    hairline,
  }
}

/** CSS variables plus the page wash. Missing theme fields fall back in CSS and here. */
export function canvasChromeStyle(
  theme?: Partial<CanvasTheme> | null,
): Record<string, string> {
  const normalized = normalizeCanvasTheme(theme)
  const page = normalized.page || CANVAS_CHROME.page
  const frame = normalized.frame || CANVAS_CHROME.frame
  const hairline = normalized.hairline || CANVAS_CHROME.hairline
  return {
    '--cv-page': page,
    '--cv-frame': frame,
    '--cv-hairline': hairline,
    '--cv-ink': CANVAS_CHROME.ink,
    '--cv-ink-strong': CANVAS_CHROME.inkStrong,
    '--cv-muted': CANVAS_CHROME.muted,
    '--cv-select': CANVAS_CHROME.select,
    '--cv-select-soft': CANVAS_CHROME.selectSoft,
    '--cv-focus': CANVAS_CHROME.focus,
    '--cv-hover-wash': CANVAS_CHROME.hoverWash,
    '--cv-header-shadow': CANVAS_CHROME.headerShadow,
    backgroundColor: page,
  }
}

/** Quadrant tone keys → shared table palette. Optional fill/accent override the wash and title. */
const QUADRANT_TONE_INDEX: Record<string, number> = {
  pink: 5,
  yellow: 1,
  cream: 2,
  green: 4,
  grey: 11,
  blue: 3,
  purple: 6,
  teal: 0,
  mustard: 1,
  red: 5,
  amber: 2,
}

export interface TonePaintInput {
  fill?: string
  accent?: string
}

export function paintForTone(
  tone: string | undefined,
  override?: TonePaintInput | null,
): TableTone & { fill: string; accent: string } {
  const base = toneAt(QUADRANT_TONE_INDEX[tone || ''] ?? 0)
  const accent = override?.accent?.trim() || base.header
  const fill = override?.fill?.trim() || base.body
  return {
    header: accent,
    body: fill,
    topic: override?.accent?.trim() ? accent : base.topic,
    fill,
    accent,
  }
}
