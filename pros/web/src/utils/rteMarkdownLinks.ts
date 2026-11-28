/**
 * 粘贴时的 Markdown 链接处理。
 *
 * 背景：编辑器会把粘贴文本里的裸网址自动变成链接（TipTap Link 扩展自带的粘贴规则）。
 * 这对 "[文字](地址)" 这种 Markdown 链接语法是灾难 ——
 * 网址被单独识别成 <a>，语法被拆成 "[文字](<a>地址</a>)"，结构就没了。
 *
 * 这里提供"只转换链接语法、其余按纯文本"的窄口径转换：
 * 粘贴 Markdown 链接时先走它，语法结构就不会被拆散。
 */

/** 允许的地址形态：绝对 http(s)、邮件/电话、站内相对路径、锚点。 */
export function isSafeMarkdownHref(url: string): boolean {
  const value = (url || '').trim()
  if (!value) return false
  if (/^(https?:|mailto:|tel:)/i.test(value)) return true
  if (value.startsWith('/') || value.startsWith('#')) return true
  return false
}

/** 文本里是否出现 Markdown 链接语法。 */
export function hasMarkdownLinkSyntax(text: string): boolean {
  return /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/.test(text || '')
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>')
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 把文本里的 Markdown 链接语法转成锚点，其余内容按纯文本处理。
 *
 * - 危险协议（javascript: / data:）不转换，原样当文本；
 * - 标签文字与地址都做转义，不会把粘贴内容变成可执行 HTML。
 */
export function markdownLinksToHtml(text: string): string {
  const source = text || ''
  const pattern = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g
  const parts: string[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    parts.push(escapeText(source.slice(last, match.index)))
    const label = escapeText(match[1] ?? '')
    const href = match[2] ?? ''
    if (isSafeMarkdownHref(href)) {
      parts.push(
        `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer nofollow" class="rte-link">${label}</a>`,
      )
    } else {
      parts.push(escapeText(match[0]))
    }
    last = match.index + match[0].length
  }
  parts.push(escapeText(source.slice(last)))
  return parts.join('')
}
