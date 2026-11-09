/** 外链：绝对 http(s) 且主机不同于当前页面。打开前可确认，白名单里的主机直接打开。 */

export const OUTBOUND_HOST_LIMIT = 20

export type OutboundPolicy = {
  confirmExternal: boolean
  hosts: string[]
}

export const DEFAULT_OUTBOUND_POLICY: OutboundPolicy = {
  confirmExternal: true,
  hosts: [],
}

export type OutboundPolicyByPanelId = Record<string, OutboundPolicy>

export type HrefKind = 'empty' | 'internal' | 'external' | 'unsafe'

const UNSAFE_PROTOCOL = /^(javascript|data|vbscript|blob):/i

export function normalizeHost(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
}

export function normalizeOutboundPolicy(raw: unknown): OutboundPolicy {
  if (!raw || typeof raw !== 'object') return { confirmExternal: true, hosts: [] }
  const row = raw as Record<string, unknown>
  const hosts = Array.isArray(row.hosts) ? row.hosts : []
  const unique = [...new Set(hosts.map((item) => normalizeHost(String(item))).filter(Boolean))].slice(0, OUTBOUND_HOST_LIMIT)
  return {
    confirmExternal: row.confirmExternal !== false,
    hosts: unique,
  }
}

export function policyIsDefault(policy: OutboundPolicy): boolean {
  const normalized = normalizeOutboundPolicy(policy)
  return normalized.confirmExternal && normalized.hosts.length === 0
}

export function readOutboundPolicy(
  map: Record<string, unknown> | null | undefined,
  panelId: string | null | undefined,
): OutboundPolicy {
  if (!map || !panelId) return { confirmExternal: true, hosts: [] }
  return normalizeOutboundPolicy(map[panelId])
}

export function writeOutboundPolicy(
  map: Record<string, unknown> | null | undefined,
  panelId: string,
  policy: OutboundPolicy,
): OutboundPolicyByPanelId | undefined {
  const next: OutboundPolicyByPanelId = {}
  if (map) {
    for (const [id, value] of Object.entries(map)) next[id] = normalizeOutboundPolicy(value)
  }
  if (!panelId) return Object.keys(next).length ? next : undefined
  const normalized = normalizeOutboundPolicy(policy)
  if (policyIsDefault(normalized)) delete next[panelId]
  else next[panelId] = normalized
  return Object.keys(next).length ? next : undefined
}

function browserOrigin(): string {
  if (typeof location === 'undefined' || !location.origin || location.origin === 'null') return ''
  return location.origin
}

export function linkHost(href: string): string {
  const value = href.trim()
  if (!value || UNSAFE_PROTOCOL.test(value)) return ''
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function classifyHref(href: string, pageOrigin = ''): HrefKind {
  const value = href.trim()
  if (!value) return 'empty'
  if (UNSAFE_PROTOCOL.test(value)) return 'unsafe'
  if (
    value.startsWith('#')
    || value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || /^mailto:/i.test(value)
  ) {
    return 'internal'
  }
  if (!/^https?:/i.test(value)) return 'internal'
  try {
    const url = new URL(value)
    const origin = pageOrigin || browserOrigin()
    if (origin) {
      const page = new URL(origin)
      if (url.origin === page.origin) return 'internal'
    }
    return 'external'
  } catch {
    return 'unsafe'
  }
}

export function hostAllowed(policy: OutboundPolicy, href: string): boolean {
  const host = linkHost(href)
  if (!host) return false
  return normalizeOutboundPolicy(policy).hosts.includes(host)
}

export function collectHrefs(html: string): string[] {
  const out: string[] = []
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const href = (match[1] ?? match[2] ?? '').trim()
    if (href) out.push(href)
  }
  return out
}

export function externalHrefRows(html: string, pageOrigin = ''): Array<{ href: string; host: string }> {
  const seen = new Set<string>()
  const rows: Array<{ href: string; host: string }> = []
  for (const href of collectHrefs(html)) {
    if (classifyHref(href, pageOrigin) !== 'external') continue
    if (seen.has(href)) continue
    seen.add(href)
    rows.push({ href, host: linkHost(href) })
  }
  return rows
}
