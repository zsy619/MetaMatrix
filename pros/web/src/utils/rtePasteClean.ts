/** 飞书日常编辑：粘贴清洗与裸链接识别。保留标题、列表、强调和安全颜色。 */

export const FEISHU_TEXT_COLORS = [
  '#1f2329',
  '#d83931',
  '#de7802',
  '#dc9b04',
  '#2ea121',
  '#245bdb',
  '#6425d0',
  '#8f959e',
] as const

export const FEISHU_HIGHLIGHT_COLORS = [
  '#fff3bf',
  '#d9f5d6',
  '#d6e8ff',
  '#fde2e2',
  '#efe6fe',
  '#ffe8cc',
  '#e8eaed',
  '#c3fae8',
] as const

const NAMED_COLORS = new Set([
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'gray',
  'grey',
])

export function safeCssColor(raw: string | null | undefined): string | null {
  const value = (raw || '').trim().replace(/\s+/g, ' ')
  if (!value || value.length > 40) return null
  if (/url\(|expression\(|javascript:|@import/i.test(value)) return null
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(value)) {
    return value
  }
  if (NAMED_COLORS.has(value.toLowerCase())) return value.toLowerCase()
  return null
}

function keptInlineStyle(style: string): string {
  const color = safeCssColor(/(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1])
  const background = safeCssColor(
    /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style)?.[1],
  )
  const parts: string[] = []
  if (color) parts.push(`color: ${color}`)
  if (background) parts.push(`background-color: ${background}`)
  return parts.join('; ')
}

function styleAttr(attrs: string): string {
  const matched = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)
  return matched?.[2] || matched?.[3] || ''
}

export function sanitizePastedHtml(html: string): string {
  let out = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|o:p)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|o:p|w:[^>\s]+)[^>]*\/?>/gi, '')
    .replace(/<\/(xml|o:p|w:[^>\s]+)>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"')

  out = out.replace(/<font\b([^>]*)>/gi, (_all, attrs: string) => {
    const color = safeCssColor(/color\s*=\s*['"]?([^'"\s>]+)/i.exec(attrs)?.[1])
    return color ? `<span style="color: ${color}">` : '<span>'
  })
  out = out.replace(/<\/font>/gi, '</span>')
  out = out.replace(/<span\b([^>]*)>/gi, (_all, attrs: string) => {
    const kept = keptInlineStyle(styleAttr(attrs))
    return kept ? `<span style="${kept}">` : '<span>'
  })
  out = out.replace(/<mark\b([^>]*)>/gi, (_all, attrs: string) => {
    const kept = keptInlineStyle(styleAttr(attrs))
    const data = /data-color\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)
    const dataColor = safeCssColor(data?.[2] || data?.[3])
    const style = kept || (dataColor ? `background-color: ${dataColor}` : '')
    return style ? `<mark style="${style}">` : '<mark>'
  })
  out = out.replace(/\sclass\s*=\s*("[^"]*"|'[^']*')/gi, (_all, quoted: string) => {
    const value = quoted.slice(1, -1)
    const lang = value.match(/language-[\w-]+/i)?.[0]
    if (lang && !/mso/i.test(value)) return ` class="${lang}"`
    return ''
  })
  out = out
    .replace(/style\s*=\s*"[^"]*mso-[^"]*"/gi, '')
    .replace(/style\s*=\s*'[^']*mso-[^']*'/gi, '')
    .replace(/\s(lang|face|size)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<p([^>]*)>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return out
}

export function isBareHttpUrl(text: string): boolean {
  const value = text.trim()
  if (!value || /\s/.test(value) || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
