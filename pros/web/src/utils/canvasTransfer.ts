import type { CanvasDocumentJSON } from '../types/canvas'

export type ParsedCanvasImport = {
  data: CanvasDocumentJSON
  title: string
  canvasType: string
  templateId: string | null
}

/** Client-side check before upload. The server repeats the same rules. */
export function parseCanvasImport(text: string): ParsedCanvasImport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('这不是有效的 JSON 文件。')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('画布文件必须是一个 JSON 对象。')
  }
  const obj = raw as Record<string, unknown>
  const canvasType = typeof obj.type === 'string' ? obj.type.trim() : ''
  if (!canvasType || canvasType.length > 64) {
    throw new Error('文件里缺少有效的 type 字段，无法识别画布类型。')
  }
  if ('schemaVersion' in obj && obj.schemaVersion != null) {
    const sv = obj.schemaVersion
    if (typeof sv !== 'number' || !Number.isInteger(sv) || sv < 1 || sv > 100) {
      throw new Error('schemaVersion 必须是 1 到 100 的整数。')
    }
  }
  if (text.length > 2 * 1024 * 1024) {
    throw new Error('文件超过 2MB，请缩小后再导入。')
  }
  const title = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '导入的画布'
  const templateId = typeof obj.templateId === 'string' ? obj.templateId : null
  return { data: obj as unknown as CanvasDocumentJSON, title, canvasType, templateId }
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/[\\/:*?"<>|]+/g, '_')
  a.click()
  URL.revokeObjectURL(url)
}

export type RecentOpen = {
  id: string
  title: string
  templateId: string
  openedAt: string
}

const RECENT_KEY = 'metamatrix:recent-opens'

export function readRecentOpens(): RecentOpen[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentOpen[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.id === 'string' && typeof item.templateId === 'string').slice(0, 8)
  } catch {
    return []
  }
}

export function rememberRecentOpen(item: Omit<RecentOpen, 'openedAt'>) {
  if (!item.id) return
  const next = [
    { ...item, openedAt: new Date().toISOString() },
    ...readRecentOpens().filter((row) => row.id !== item.id),
  ].slice(0, 8)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}

export function clearRecentOpens() {
  try {
    localStorage.removeItem(RECENT_KEY)
  } catch {
    /* ignore */
  }
}
