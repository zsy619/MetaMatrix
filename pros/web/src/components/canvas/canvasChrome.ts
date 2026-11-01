import type { CanvasTheme } from '../../types/canvas'
import { toneAt, type TableTone } from './fiveStepPalette'

/** Soft worksheet chrome shared with the human-AI dual triangle and five-step sheets. */
export const CANVAS_CHROME = {
  page: '#f7f7f7',
  frame: '#ececec',
  hairline: 'rgba(60, 50, 20, 0.08)',
  ink: '#3c4043',
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

export function canvasPageColor(theme?: Partial<CanvasTheme> | null): string {
  const page = theme?.page?.trim()
  if (page) return page
  const raw = theme?.background?.color?.trim() || ''
  if (raw && !LEGACY_PAGE.has(raw.toLowerCase())) return raw
  return CANVAS_CHROME.page
}

/** CSS variables plus the page wash. Missing theme fields fall back in CSS and here. */
export function canvasChromeStyle(
  theme?: Partial<CanvasTheme> | null,
): Record<string, string> {
  const page = canvasPageColor(theme)
  const frame = theme?.frame?.trim() || CANVAS_CHROME.frame
  const hairline = theme?.hairline?.trim() || CANVAS_CHROME.hairline
  return {
    '--cv-page': page,
    '--cv-frame': frame,
    '--cv-hairline': hairline,
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
