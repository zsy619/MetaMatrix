/**
 * 轻量 HTML → Markdown（覆盖标题/列表/引用/代码/链接/粗斜体/表格粗略/分割线）
 */
import { imageLinkHref } from './rteImageLayout'
/** 导出的 HTML 里，外链补上 rel，已有 rel 的不改。 */
export function withExternalLinkRel(html: string): string {
  return String(html || '').replace(/<a\b([^>]*?)>/gi, (full, attrs: string) => {
    if (!/\bhref\s*=\s*["']https?:/i.test(attrs)) return full
    if (/\brel\s*=/i.test(attrs)) return full
    return `<a${attrs} rel="noopener noreferrer">`
  })
}

export function htmlToMarkdown(html: string): string {
  const tmp = typeof document !== 'undefined' ? document.createElement('div') : null
  if (!tmp) return stripTags(html)
  tmp.innerHTML = html || ''
  return nodeToMd(tmp).replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function stripTags(s: string): string {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function nodeToMd(root: HTMLElement): string {
  const parts: string[] = []
  const walkBlocks = (el: Element) => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent || '').replace(/\s+/g, ' ')
        if (t.trim()) parts.push(t)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const e = child as HTMLElement
      const tag = e.tagName.toLowerCase()
      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        const n = Number(tag[1])
        parts.push(`${'#'.repeat(n)} ${inlineMd(e)}\n\n`)
      } else if (tag === 'p') {
        parts.push(`${inlineMd(e)}\n\n`)
      } else if (tag === 'blockquote') {
        const inner = inlineMd(e).split('\n').map((l) => `> ${l}`).join('\n')
        parts.push(`${inner}\n\n`)
      } else if (tag === 'ul' && e.getAttribute('data-type') === 'taskList') {
        e.querySelectorAll(':scope > li').forEach((li) => {
          const checked = li.getAttribute('data-checked') === 'true'
          parts.push(`- [${checked ? 'x' : ' '}] ${inlineMd(li as HTMLElement)}\n`)
        })
        parts.push('\n')
      } else if (e.getAttribute('data-type') === 'image-group') {
        const layout = e.getAttribute('data-layout') || 'row'
        const images = [...e.querySelectorAll('img')].map((img) => imageMarkdown(img).trimEnd())
        parts.push(`<!-- image-group:${layout} -->\n${images.join('\n')}\n\n`)
      } else if (tag === 'ul') {
        e.querySelectorAll(':scope > li').forEach((li) => {
          parts.push(`- ${inlineMd(li as HTMLElement)}\n`)
        })
        parts.push('\n')
      } else if (tag === 'ol') {
        let i = 1
        e.querySelectorAll(':scope > li').forEach((li) => {
          parts.push(`${i}. ${inlineMd(li as HTMLElement)}\n`)
          i += 1
        })
        parts.push('\n')
      } else if (e.getAttribute('data-type') === 'math-display' || e.classList.contains('rte-math-display')) {
        const tex = e.getAttribute('data-tex') || ''
        parts.push(tex ? `$$\n${tex}\n$$\n\n` : '')
      } else if (tag === 'pre') {
        const code = e.textContent || ''
        const langClass = `${e.querySelector('code')?.className || ''} ${e.getAttribute('class') || ''}`
        const lang = /language-([\w-]+)/.exec(langClass)?.[1] || ''
        parts.push(`\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`)
      } else if (tag === 'hr') {
        parts.push('---\n\n')
      } else if (tag === 'table') {
        parts.push(tableToMd(e) + '\n\n')
      } else if (tag === 'img') {
        parts.push(imageMarkdown(e))
      } else if (tag === 'br') {
        parts.push('  \n')
      } else {
        walkBlocks(e)
      }
    }
  }
  walkBlocks(root)
  return parts.join('')
}

function imageMarkdown(img: HTMLElement): string {
  const src = img.getAttribute('src') || ''
  const caption = (img.getAttribute('data-caption') || '').trim()
  const rawAlt = (img.getAttribute('alt') || '').trim()
  const title = (img.getAttribute('title') || '').trim()
  const alt = (rawAlt || (title && title !== caption ? title : '') || 'image')
    .replace(/\\/g, '\\\\')
    .replace(/[\[\]]/g, '\\$&')
    .replace(/\r?\n/g, ' ')
  // data URL 里可能有空格 / 括号（SVG 快照），用 <...> 包起来才不会截断链接
  const safeSrc = /[\s()]/.test(src) ? `<${src}>` : src
  const href = imageLinkHref(img.getAttribute('data-href') || '')
  const body = `![${alt}](${safeSrc})`
  const linked = href ? `[${body}](${/[\s()]/.test(href) ? `<${href}>` : href})` : body
  return `${linked}${caption ? `\n${caption}` : ''}\n\n`
}

function inlineMd(el: HTMLElement): string {
  let out = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent || '').replace(/\s+/g, ' ')
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const e = child as HTMLElement
    const tag = e.tagName.toLowerCase()
    if (tag === 'strong' || tag === 'b') out += `**${inlineMd(e)}**`
    else if (tag === 'em' || tag === 'i') out += `*${inlineMd(e)}*`
    else if (tag === 'code') out += `\`${e.textContent || ''}\``
    else if (e.getAttribute('data-type') === 'math-inline' || e.classList.contains('rte-math-inline')) {
      const tex = e.getAttribute('data-tex') || ''
      out += tex ? `$${tex}$` : ''
    }
    else if (tag === 'a') {
      const href = e.getAttribute('href') || ''
      out += `[${inlineMd(e)}](${href})`
    } else if (tag === 'br') out += '  \n'
    else if (tag === 'mark') out += `==${inlineMd(e)}==`
    else out += inlineMd(e)
  }
  return out.trim()
}

function tableToMd(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (!rows.length) return ''
  const cellsOf = (tr: Element) =>
    Array.from(tr.querySelectorAll('th,td')).map((c) => inlineMd(c as HTMLElement).replace(/\|/g, '\\|'))
  const lines: string[] = []
  rows.forEach((tr, i) => {
    const cells = cellsOf(tr)
    lines.push(`| ${cells.join(' | ')} |`)
    if (i === 0) lines.push(`| ${cells.map(() => '---').join(' | ')} |`)
  })
  return lines.join('\n')
}
