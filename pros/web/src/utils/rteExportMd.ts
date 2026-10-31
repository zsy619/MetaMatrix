/**
 * 轻量 HTML → Markdown（覆盖标题/列表/引用/代码/链接/粗斜体/表格粗略/分割线）
 */
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
      } else if (tag === 'pre') {
        const code = e.textContent || ''
        const lang = e.querySelector('code')?.className?.replace(/^language-/, '') || ''
        parts.push(`\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`)
      } else if (tag === 'hr') {
        parts.push('---\n\n')
      } else if (tag === 'table') {
        parts.push(tableToMd(e) + '\n\n')
      } else if (tag === 'img') {
        const src = e.getAttribute('src') || ''
        const alt = e.getAttribute('alt') || e.getAttribute('title') || 'image'
        parts.push(`![${alt}](${src})\n\n`)
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
