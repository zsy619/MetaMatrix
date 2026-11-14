/** Plain text shown inside an IPO diagram box. Empty string means the box is still blank. */
export function ipoBlockPreview(
  items: Array<{ text?: string }> | undefined,
  limit = 180,
): string {
  const raw = (items ?? []).map((item) => item.text || '')
  const text = raw
    .map((item) => plainItemHtml(item))
    .filter(Boolean)
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  if (!text) {
    return raw.some((item) => /<(img|video|audio|figure)\b/i.test(item)) ? '图片' : ''
  }
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}…`
}

/** One short line sits in the middle of a diagram box; longer notes start at the top. */
export function ipoPreviewIsShort(text: string): boolean {
  return !!text && text !== '点击填写' && !text.includes('\n') && text.length <= 28
}

function plainItemHtml(text: string): string {
  return text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
