/** Allow only same-app paths. Reject protocol-relative and absolute URLs. */
export function safeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) {
    return fallback
  }
  return raw
}
