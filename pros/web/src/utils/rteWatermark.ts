/** 富文本页水印。只盖在版面上，不写进正文 HTML。旧文档没有这个字段时不显示。 */

export const WATERMARK_TEXT_MAX = 24

export const WATERMARK_PRESETS = ['机密', '内部', '草稿', '样本'] as const

export type PanelWatermark = {
  enabled: boolean
  text: string
}

export const EMPTY_WATERMARK: PanelWatermark = {
  enabled: false,
  text: '',
}

export type WatermarkByPanelId = Record<string, PanelWatermark>

function watermarkText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, WATERMARK_TEXT_MAX)
}

export function normalizeWatermark(raw: unknown): PanelWatermark {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WATERMARK }
  const row = raw as Record<string, unknown>
  const text = watermarkText(row.text)
  return {
    enabled: row.enabled === true && text.length > 0,
    text,
  }
}

export function watermarkIsEmpty(mark: PanelWatermark): boolean {
  return !normalizeWatermark(mark).enabled
}

export function readWatermark(
  map: Record<string, unknown> | null | undefined,
  panelId: string | null | undefined,
): PanelWatermark {
  if (!map || !panelId) return { ...EMPTY_WATERMARK }
  return normalizeWatermark(map[panelId])
}

export function writeWatermark(
  map: Record<string, unknown> | null | undefined,
  panelId: string,
  mark: PanelWatermark,
): WatermarkByPanelId | undefined {
  const next: WatermarkByPanelId = {}
  if (map) {
    for (const [id, value] of Object.entries(map)) next[id] = normalizeWatermark(value)
  }
  if (!panelId) return Object.keys(next).length ? next : undefined
  const normalized = normalizeWatermark(mark)
  if (watermarkIsEmpty(normalized)) delete next[panelId]
  else next[panelId] = normalized
  return Object.keys(next).length ? next : undefined
}
