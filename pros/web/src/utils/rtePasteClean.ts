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
  'figcaption',
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
    .replace(/<(iframe|object|embed|form|meta|link|xml|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|svg|math)[^>]*\/?>/gi, '')
    .replace(/<\/?(?:o:p|w:[a-z0-9]+|v:[a-z0-9]+)[^>]*>/gi, '')
    .replace(/\sxmlns(?::[a-z0-9]+)?\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function rebuildPasted(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (DROP_TAGS.has(tag) || tag === 'nav' || tag === 'button' || tag === 'aside' || tag === 'footer') return null
  if (tag === 'header' && !el.closest('table')) return null
  const structural = tag === 'div' ? structuralPasteType(el) : ''
  const parent = structural
    ? doc.createElement('div')
    : tag === 'font' || tag === 'div'
      ? null
      : KEEP_TAGS.has(tag)
        ? doc.createElement(tag === 'font' ? 'span' : tag)
        : null
  if (parent && structural) {
    parent.setAttribute('data-type', structural)
    if (structural === 'callout') {
      const variant = el.getAttribute('data-variant')
      if (variant) parent.setAttribute('data-variant', variant)
    }
    if (structural === 'image-group') {
      for (const name of ['data-layout', 'data-ratios', 'data-ratio-mode', 'data-stack-at', 'data-stack-side', 'data-stack-split', 'data-fit', 'data-gap', 'data-align']) {
        const value = el.getAttribute(name)
        if (value) parent.setAttribute(name, value)
      }
    }
  }
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
  if (parent && tag === 'ul' && (el.getAttribute('data-type') === 'taskList' || /todo|task-list/i.test(el.className))) {
    parent.setAttribute('data-type', 'taskList')
  }
  if (parent && tag === 'li' && el.hasAttribute('data-checked')) {
    parent.setAttribute('data-checked', el.getAttribute('data-checked') === 'true' ? 'true' : 'false')
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
  return absorbPastedFigureCaptions(
    holder.innerHTML
      .replace(/<p([^>]*)>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>'),
  )
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

function structuralPasteType(el: HTMLElement): string {
  const type = el.getAttribute('data-type') || ''
  if (type === 'callout' || type === 'columns' || type === 'column' || type === 'image-group') return type
  const className = el.className || ''
  if (/callout|highlight-block|ace-highlight/i.test(className)) return 'callout'
  if (/columns|column-block/i.test(className)) return 'columns'
  return ''
}

const PASTE_BULLET = /^[ \t]*[■●○□▪▫※・•·◆◇▶►]\s+(.*)$/
const PASTE_ORDERED = /^[ \t]*(\d+)[.、．]\s+(.*)$/

type PasteInline = { type: 'text'; text: string } | { type: 'hardBreak' }
type PasteParagraph = { type: 'paragraph'; content?: PasteInline[] }
type PasteList = {
  type: 'bulletList' | 'orderedList'
  attrs?: { start: number }
  content: Array<{ type: 'listItem'; content: PasteParagraph[] }>
}

function listFromLines(lines: string[]): PasteList | null {
  const items = lines.map((line) => line.trim()).filter(Boolean)
  if (items.length < 1) return null
  if (items.every((line) => PASTE_BULLET.test(line))) {
    return {
      type: 'bulletList',
      content: items.map((line) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: line.replace(PASTE_BULLET, '$1') }] }],
      })),
    }
  }
  if (items.every((line) => PASTE_ORDERED.test(line))) {
    const start = Number(PASTE_ORDERED.exec(items[0]!)?.[1] || 1) || 1
    return {
      type: 'orderedList',
      attrs: { start },
      content: items.map((line) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: line.replace(PASTE_ORDERED, '$2') }] }],
      })),
    }
  }
  return null
}

/** 已经在列表里时，整段粘贴的列表不再多套一层。 */
export function unwrapSinglePastedList(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const elements = [...doc.body.children]
  if (elements.length !== 1) return html
  const only = elements[0]!
  const tag = only.tagName.toLowerCase()
  if (tag !== 'ul' && tag !== 'ol') return html
  return only.innerHTML
}

const FIGURE_CAPTION_RE = /^图\s*\d+(?:\s*-\s*\d+)?\s*[：:\-]?\s*(.*)$/

function pastedCaptionRest(text: string): string | null {
  const matched = text.trim().match(FIGURE_CAPTION_RE)
  if (!matched) return null
  return (matched[1] || '').trim()
}

/** 这一段里只有一张图（空格和换行不算），题注才会写在下一段。 */
function imageOnlyHost(el: Element | null): Element | null {
  if (!el || el.tagName === 'BODY' || el.querySelectorAll('img').length !== 1) return null
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent || '').trim()) return null
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return null
    const tag = (child as Element).tagName
    if (tag !== 'IMG' && tag !== 'BR') return null
  }
  return el
}

function captionBlock(el: Element | null): el is Element {
  if (!el || el.querySelector('img')) return false
  return el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'FIGCAPTION'
}

function takePastedCaption(img: HTMLImageElement, text: string, remove: () => void, plain = false) {
  const numbered = pastedCaptionRest(text)
  if (numbered != null) {
    if (numbered && !img.getAttribute('data-caption')) img.setAttribute('data-caption', numbered)
    remove()
    return true
  }
  if (!plain) return false
  const caption = text.replace(/\s+/g, ' ').trim()
  if (caption && !img.getAttribute('data-caption')) img.setAttribute('data-caption', caption)
  remove()
  return true
}

/** 紧挨着图片的「图 1 说明」收进题注，避免和自动编号叠成两个图号。图片单独成段、或题注来自 figcaption 时也收。 */
export function absorbPastedFigureCaptions(html: string): string {
  if (typeof DOMParser === 'undefined' || (!/图\s*\d+/.test(html) && !/<figcaption\b/i.test(html))) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = [...doc.body.querySelectorAll('img')]
  images.forEach((img) => {
    const sibling = img.nextElementSibling
    const plain = sibling?.tagName === 'FIGCAPTION'
    if (captionBlock(sibling) && takePastedCaption(img, sibling.textContent || '', () => sibling.remove(), plain)) return
    const prev = img.previousElementSibling
    if (prev?.tagName === 'FIGCAPTION' && takePastedCaption(img, prev.textContent || '', () => prev.remove(), true)) return
    const text = img.nextSibling
    if (text && text.nodeType === Node.TEXT_NODE && takePastedCaption(img, text.textContent || '', () => text.remove())) {
      return
    }
    const host = imageOnlyHost(img.parentElement)
    const next = host?.nextElementSibling
    if (captionBlock(next ?? null)) takePastedCaption(img, next?.textContent || '', () => next?.remove())
  })
  return doc.body.innerHTML
}

/** 纯文本粘贴：单行保持字符串，多行拆成段落。项目符号收成列表。不把内容再解析成 HTML。 */
export function plainTextToPasteContent(text: string): string | Array<PasteParagraph | PasteList> {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  const listed = listFromLines(normalized.split('\n'))
  if (listed) return [listed]
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
