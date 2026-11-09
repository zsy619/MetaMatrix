/** 面板内操作记录。随画布 JSON 保存，只留最近若干条，不另建审计服务。 */

export const AUDIT_LIMIT = 80
export const AUDIT_DETAIL_MAX = 180

export const AUDIT_ACTIONS = [
  'watermark',
  'outbound-open',
  'outbound-block',
  'link-set',
  'policy',
  'ai',
  'export',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  watermark: '水印',
  'outbound-open': '打开外链',
  'outbound-block': '拦截外链',
  'link-set': '写入外链',
  policy: '外链策略',
  ai: '文内改写',
  export: '导出',
}

export type AuditEvent = {
  id: string
  at: number
  action: AuditAction
  detail: string
  actor: string
}

export type AuditLogByPanelId = Record<string, AuditEvent[]>

function createAuditId(at: number): string {
  return `aud_${at.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function cleanDetail(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUDIT_DETAIL_MAX)
}

function asAuditEvent(raw: unknown): AuditEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const action = row.action
  if (typeof action !== 'string' || !AUDIT_ACTIONS.includes(action as AuditAction)) return null
  const detail = cleanDetail(row.detail)
  const at = Number(row.at)
  const id = String(row.id ?? '').trim()
  if (!detail || !id || !Number.isFinite(at)) return null
  const actor = cleanDetail(row.actor).slice(0, 40) || '我'
  return { id, at, action: action as AuditAction, detail, actor }
}

export function normalizeAuditLog(raw: unknown): AuditEvent[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: AuditEvent[] = []
  for (const item of raw) {
    const event = asAuditEvent(item)
    if (!event || seen.has(event.id)) continue
    seen.add(event.id)
    out.push(event)
  }
  return out.slice(-AUDIT_LIMIT)
}

export function appendAudit(
  list: readonly AuditEvent[],
  event: { at: number; action: AuditAction; detail: string; actor?: string; id?: string },
): AuditEvent[] {
  const detail = cleanDetail(event.detail)
  if (!detail || !Number.isFinite(event.at)) return normalizeAuditLog(list)
  const row: AuditEvent = {
    id: event.id?.trim() || createAuditId(event.at),
    at: event.at,
    action: event.action,
    detail,
    actor: cleanDetail(event.actor).slice(0, 40) || '我',
  }
  return normalizeAuditLog([...list, row])
}

export function formatAuditTime(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function readAuditLog(
  map: Record<string, unknown> | null | undefined,
  panelId: string | null | undefined,
): AuditEvent[] {
  if (!map || !panelId) return []
  return normalizeAuditLog(map[panelId])
}

export function writeAuditLog(
  map: Record<string, unknown> | null | undefined,
  panelId: string,
  events: readonly AuditEvent[],
): AuditLogByPanelId | undefined {
  const next: AuditLogByPanelId = {}
  if (map) {
    for (const [id, value] of Object.entries(map)) {
      const list = normalizeAuditLog(value)
      if (list.length) next[id] = list
    }
  }
  if (!panelId) return Object.keys(next).length ? next : undefined
  const list = normalizeAuditLog(events)
  if (!list.length) delete next[panelId]
  else next[panelId] = list
  return Object.keys(next).length ? next : undefined
}
