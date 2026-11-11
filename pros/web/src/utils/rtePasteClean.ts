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

const DROP_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'meta',
  'link',
  'svg',
  'math',
  'xml',
])

const KEEP_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'a',
  'img',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'span',
  'br',
  'mark',
  'hr',
])

/** 把粘贴进来的属性值里的常见实体解开，再判断协议。 */
export function decodePasteAttr(raw: string): string {
  return String(raw || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&#(\d+);?/g, (_, dec: string) => {
      const code = Number(dec)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;|&#0*9;?/gi, '')
    .replace(/\s+/g, '')
}

/** 链接只留 http(s) 和素材库 /media/{id}。图片还可留 data:image。 */
export function safePasteUrl(raw: string, kind: 'a' | 'img'): string | null {
  const value = decodePasteAttr(raw).trim()
  if (!value || value.length > 2_000_000) return null
  if (/^\/media\/[0-9a-zA-Z-]+$/.test(value)) return value
  if (kind === 'img' && /^data:image\/(?:png|jpe?g|gif|webp);/i.test(value)) return value
  if (/^(javascript|data|vbscript|blob):/i.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return value
  } catch {
    return null
  }
  return null
}

function stripDangerousMarkup(html: string): string {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?(?:<\/style>|$)/gi, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|svg|math|o:p)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|svg|math|o:p|w:[^>\s]+)[^>]*\/?>/gi, '')
    .replace(/<\/(xml|o:p|w:[^>\s]+)>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function rebuildPasted(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (DROP_TAGS.has(tag)) return null
  const parent = tag === 'font' || tag === 'div' ? null : KEEP_TAGS.has(tag) ? doc.createElement(tag === 'font' ? 'span' : tag) : null
  const host = parent ?? doc.createDocumentFragment()
  if (parent && (tag === 'span' || tag === 'mark' || tag === 'font')) {
    const fromStyle = keptInlineStyle(el.getAttribute('style') || '')
    const fromFont = tag === 'font' ? safeCssColor(el.getAttribute('color')) : null
    if (tag === 'font') {
      const span = doc.createElement('span')
      if (fromFont || fromStyle) span.setAttribute('style', fromStyle || `color: ${fromFont}`)
      el.childNodes.forEach((child) => {
        const next = rebuildPasted(child, doc)
        if (next) span.appendChild(next)
      })
      return span
    }
    if (fromStyle) parent.setAttribute('style', fromStyle)
  }
  if (parent && tag === 'a') {
    const href = safePasteUrl(el.getAttribute('href') || '', 'a')
    if (href) parent.setAttribute('href', href)
  }
  if (parent && tag === 'img') {
    const src = safePasteUrl(el.getAttribute('src') || '', 'img')
    if (!src) return null
    parent.setAttribute('src', src)
    const alt = (el.getAttribute('alt') || '').replace(/[<>"]/g, '').slice(0, 200)
    if (alt) parent.setAttribute('alt', alt)
    return parent
  }
  if (parent && (tag === 'td' || tag === 'th')) {
    for (const name of ['colspan', 'rowspan'] as const) {
      const raw = el.getAttribute(name)
      const span = Number(raw)
      if (raw && Number.isInteger(span) && span > 1 && span <= 50) parent.setAttribute(name, String(span))
    }
    const bg = el.getAttribute('bgcolor') || el.style?.backgroundColor || ''
    const hex = bg.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[0]
    if (hex) parent.setAttribute('data-bg', hex)
    const valign = el.getAttribute('data-valign') || ''
    if (valign === 'top' || valign === 'middle' || valign === 'bottom') parent.setAttribute('data-valign', valign)
  }
  if (parent && tag === 'code') {
    const lang = [...el.classList].find((name) => /^language-[\w-]+$/i.test(name) && !/mso/i.test(name))
    if (lang) parent.setAttribute('class', lang)
  }
  el.childNodes.forEach((child) => {
    const next = rebuildPasted(child, doc)
    if (next) host.appendChild(next)
  })
  return parent ?? host
}

function sanitizeWithDom(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const holder = parsed.createElement('div')
  parsed.body.childNodes.forEach((child) => {
    const next = rebuildPasted(child, parsed)
    if (next) holder.appendChild(next)
  })
  return holder.innerHTML
    .replace(/<p([^>]*)>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
}

export function sanitizePastedHtml(html: string): string {
  const stripped = stripDangerousMarkup(html)
  if (typeof DOMParser !== 'undefined') return sanitizeWithDom(stripped)
  let out = stripped
    .replace(/\s(href|src)\s*=\s*(['"])([^'"]*)\2/gi, (_all, attr: string, quote: string, value: string) => {
      const safe = safePasteUrl(value, attr.toLowerCase() === 'src' ? 'img' : 'a')
      if (!safe) return ''
      return ` ${attr}=${quote}${safe}${quote}`
    })

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
  out = out.replace(/<(td|th)\b([^>]*)>/gi, (all, tag: string, attrs: string) => {
    if (/data-bg=/i.test(attrs)) return all
    const bg = /bgcolor\s*=\s*["']?(#[0-9a-f]{3,8})/i.exec(attrs)?.[1]
    if (!bg) return all
    return `<${tag}${attrs} data-bg="${bg}">`
  })
  out = out
    .replace(/style\s*=\s*"[^"]*mso-[^"]*"/gi, '')
    .replace(/style\s*=\s*'[^']*mso-[^']*'/gi, '')
    .replace(/\s(lang|face|size)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<p([^>]*)>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return out
}

/** 纯文本粘贴：单行保持字符串，多行拆成段落。不把内容再解析成 HTML。 */
export function plainTextToPasteContent(
  text: string,
): string | Array<{ type: 'paragraph'; content?: Array<{ type: 'text'; text: string }> }> {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  if (!normalized.includes('\n')) return normalized
  return normalized.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n')
    const content: Array<{ type: 'text'; text: string } | { type: 'hardBreak' }> = []
    lines.forEach((line, index) => {
      if (index > 0) content.push({ type: 'hardBreak' })
      if (line) content.push({ type: 'text', text: line })
    })
    return { type: 'paragraph' as const, content }
  })
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
