/**
 * Markdown → HTML 转换（导入 .md 与粘贴 Markdown 共用）。
 *
 * 覆盖范围（按导入真实文档的需要挑的，不是玩具级正则）：
 * - 标题：ATX（# ~ ######）与 Setext（=== / ---）
 * - 段落：软换行保留为换行符
 * - 列表：无序 / 有序 / 多级嵌套 / 任务列表（- [ ] / - [x]）
 * - 引用：> 引用块（支持嵌套与懒续行）
 * - 代码：``` 围栏代码块（含语言）、缩进代码块
 * - 表格：GFM 管道表格（含对齐行）
 * - 分隔线：--- / *** / ___
 * - 行内：转义 \X、行内代码、粗体、斜体、粗斜体、删除线、链接、图片、
 *         引用式链接、自动链接、硬换行
 *
 * 安全约定：
 * - 危险协议（javascript: / data:）的链接按纯文本输出；
 * - 原始 HTML 一律转义成文本（script / style / iframe 整块丢弃），
 *   不会把 Markdown 文件里的标签变成可执行内容。
 */

import { isSafeMarkdownHref } from './rteMarkdownLinks'

export type SoftBreakMode = 'br' | 'space'

export type MarkdownToHtmlOptions = {
  /** 段落内软换行的处理：br 保留换行（默认），space 折成空格。 */
  softBreak?: SoftBreakMode
}

type LinkDef = { url: string; title?: string }

type Ctx = {
  refs: Map<string, LinkDef>
  softBreak: SoftBreakMode
}

const BLOCK_TAGS_TO_DROP = /^(script|style|iframe|object|embed|noscript|template)$/i

function escapeText(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function stripTags(text: string): string {
  return String(text ?? '').replace(/<[^>]*>/g, '')
}

/** Markdown 转义：\ + ASCII 标点 → 字面标点。 */
function unescapeMarkdown(text: string): string {
  return String(text ?? '').replace(/\\([!-/:-@[-`{-~])/g, '$1')
}

/** 展开 tab（4 空格）并统一换行。 */
function normalizeSource(md: string): string {
  return String(md ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '    ')
}

/** 找到与 start 处 '[' 配对的 ']'（支持嵌套与转义）。 */
function matchBracket(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 找到与 start 处 '(' 配对的 ')'（支持嵌套与转义）。 */
function matchParen(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

type LinkLike = { label: string; url: string; title?: string; end: number }

/** 解析 [label](url "title") 形式的链接。 */
function parseInlineLink(text: string, start: number): LinkLike | null {
  if (text[start] !== '[') return null
  const labelEnd = matchBracket(text, start)
  if (labelEnd < 0) return null
  if (text[labelEnd + 1] !== '(') return null
  const urlEnd = matchParen(text, labelEnd + 1)
  if (urlEnd < 0) return null
  const inner = text.slice(labelEnd + 2, urlEnd).trim()
  let url = inner
  let title: string | undefined
  const titleMatch = inner.match(/^(\S*)\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))$/)
  if (titleMatch) {
    url = titleMatch[1] ?? ''
    title = titleMatch[2] ?? titleMatch[3] ?? titleMatch[4]
  }
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1)
  return {
    label: text.slice(start + 1, labelEnd),
    url: unescapeMarkdown(url),
    title: title ? unescapeMarkdown(title) : undefined,
    end: urlEnd + 1,
  }
}

/** 解析 [text][ref] / [ref][] / [ref] 形式的引用链接。 */
function parseReferenceLink(text: string, start: number, ctx: Ctx): LinkLike | null {
  if (text[start] !== '[') return null
  const labelEnd = matchBracket(text, start)
  if (labelEnd < 0) return null
  const label = text.slice(start + 1, labelEnd)
  let ref = label
  let end = labelEnd + 1
  if (text[labelEnd + 1] === '[') {
    const refEnd = matchBracket(text, labelEnd + 1)
    if (refEnd < 0) return null
    const explicit = text.slice(labelEnd + 2, refEnd).trim()
    if (explicit) ref = explicit
    end = refEnd + 1
  }
  const key = ref.trim().toLowerCase()
  const def = ctx.refs.get(key)
  if (!def) return null
  return { label, url: def.url, title: def.title, end }
}

const EMPHASIS_PATTERNS: RegExp[] = [
  /^\*\*\*([^\s*][\s\S]*?)\*\*\*/,
  /^___([^\s_][\s\S]*?)___/,
  /^\*\*([^\s*][\s\S]*?)\*\*/,
  /^__([^\s_][\s\S]*?)__/,
  /^\*([^\s*][\s\S]*?)\*(?!\*)/,
  /^_([^\s_][\s\S]*?)_(?![A-Za-z0-9_])/,
]

/** 行内解析。 */
export function renderInlineMarkdown(source: string, ctx: Ctx): string {
  const text = String(source ?? '')
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]

    // 反斜杠转义
    if (ch === '\\' && i + 1 < text.length && /[\\`*{}\[\]()#+\-.!_>~|]/.test(text[i + 1]!)) {
      out += escapeText(text[i + 1]!)
      i += 2
      continue
    }

    // 行内代码
    if (ch === '`') {
      const match = /^(`+)([\s\S]*?)\1/.exec(text.slice(i))
      if (match) {
        let code = match[2] ?? ''
        if (/^ /.test(code) && / $/.test(code) && /[^ ]/.test(code)) code = code.slice(1, -1)
        out += `<code>${escapeText(code)}</code>`
        i += match[0].length
        continue
      }
    }

    // 图片
    if (ch === '!' && text[i + 1] === '[') {
      const link = parseInlineLink(text, i + 1)
      if (link) {
        if (isSafeMarkdownHref(link.url)) {
          const title = link.title ? ` title="${escapeAttr(link.title)}"` : ''
          out += `<img src="${escapeAttr(link.url)}" alt="${escapeAttr(stripTags(link.label))}"${title} />`
        } else {
          out += escapeText(text.slice(i, link.end))
        }
        i = link.end
        continue
      }
    }

    // 链接（行内式 / 引用式）
    if (ch === '[') {
      const link = parseInlineLink(text, i) ?? parseReferenceLink(text, i, ctx)
      if (link) {
        if (isSafeMarkdownHref(link.url)) {
          const title = link.title ? ` title="${escapeAttr(link.title)}"` : ''
          out += `<a href="${escapeAttr(link.url)}" class="rte-link"${title}>${renderInlineMarkdown(link.label, ctx)}</a>`
        } else {
          out += escapeText(text.slice(i, link.end))
        }
        i = link.end
        continue
      }
    }

    // 自动链接
    if (ch === '<') {
      const match = /^<((?:https?|mailto|tel):[^>\s]+)>/.exec(text.slice(i))
      if (match) {
        out += `<a href="${escapeAttr(match[1]!)}" class="rte-link">${escapeText(match[1]!)}</a>`
        i += match[0].length
        continue
      }
    }

    // 删除线
    if (ch === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2)
      if (end > 0) {
        out += `<s>${renderInlineMarkdown(text.slice(i + 2, end), ctx)}</s>`
        i = end + 2
        continue
      }
    }

    // 粗体 / 斜体
    if (ch === '*' || ch === '_') {
      let matched = false
      for (const pattern of EMPHASIS_PATTERNS) {
        const match = pattern.exec(text.slice(i))
        if (!match) continue
        if (match[0][0] !== ch) continue
        const inner = match[1] ?? ''
        const raw = match[0]
        const rendered = renderInlineMarkdown(inner, ctx)
        if (raw.startsWith('***') || raw.startsWith('___')) {
          out += `<strong><em>${rendered}</em></strong>`
        } else if (raw.startsWith('**') || raw.startsWith('__')) {
          out += `<strong>${rendered}</strong>`
        } else {
          out += `<em>${rendered}</em>`
        }
        i += match[0].length
        matched = true
        break
      }
      if (matched) continue
    }

    // 原始 HTML 标签：按文本转义
    if (ch === '<') {
      const match = /^<\/?[a-zA-Z][^>]*>/.exec(text.slice(i))
      if (match) {
        out += escapeText(match[0])
        i += match[0].length
        continue
      }
    }

    // 软换行 / 硬换行
    if (ch === '\n') {
      const hard = /[ ]{2,}$/.test(out)
      out = out.replace(/[ ]{2,}$/, '')
      out += hard ? '<br />' : ctx.softBreak === 'space' ? ' ' : '<br />'
      i += 1
      continue
    }

    out += escapeText(ch)
    i += 1
  }
  return out
}

/** 解析表格行的单元格（支持 \| 转义）。 */
function splitTableRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells: string[] = []
  let buf = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '|') {
      buf += '|'
      i += 1
      continue
    }
    if (ch === '|') {
      cells.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  cells.push(buf.trim())
  return cells
}

function isTableDelimiter(line: string): boolean {
  const cells = splitTableRow(line)
  if (!cells.length) return false
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()))
}

const RE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/
const RE_ATX = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
const RE_HR = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/
const RE_QUOTE = /^ {0,3}>\s?(.*)$/
const RE_UL = /^(\s*)([-*+])(\s+)(.*)$/
const RE_OL = /^(\s*)(\d{1,9})([.)])(\s+)(.*)$/
const RE_REF_DEF = /^ {0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/
const RE_SETEXT = /^ {0,3}(=+|-+)\s*$/

function isBlockStart(line: string): boolean {
  return (
    RE_FENCE.test(line) ||
    RE_ATX.test(line) ||
    RE_HR.test(line) ||
    RE_QUOTE.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line) ||
    RE_SETEXT.test(line)
  )
}

/** 解析块级结构，返回 HTML 片段数组。 */
function parseBlocks(lines: string[], ctx: Ctx): string[] {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (!line.trim()) {
      i += 1
      continue
    }

    // 引用式链接定义
    const refDef = RE_REF_DEF.exec(line)
    if (refDef && !line.trim().startsWith('>')) {
      const key = (refDef[1] ?? '').trim().toLowerCase()
      let url = refDef[2] ?? ''
      if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1)
      const title = refDef[3] ?? refDef[4] ?? refDef[5]
      if (key && !ctx.refs.has(key)) {
        ctx.refs.set(key, { url: unescapeMarkdown(url), title: title ? unescapeMarkdown(title) : undefined })
      }
      i += 1
      continue
    }

    // 围栏代码块
    const fence = RE_FENCE.exec(line)
    if (fence) {
      const marker = fence[1]!
      const lang = fence[2] ?? ''
      const indent = line.length - line.trimStart().length
      const body: string[] = []
      i += 1
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const closing = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
        if (closing.test(current)) {
          i += 1
          break
        }
        body.push(current.slice(0, indent).trim() === '' ? current.replace(new RegExp(`^ {0,${indent}}`), '') : current)
        i += 1
      }
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : ''
      out.push(`<pre><code${cls}>${escapeText(body.join('\n'))}</code></pre>`)
      continue
    }

    // ATX 标题
    const atx = RE_ATX.exec(line)
    if (atx) {
      const level = atx[1]!.length
      const content = (atx[2] ?? '').trim()
      out.push(`<h${level}>${renderInlineMarkdown(content, ctx)}</h${level}>`)
      i += 1
      continue
    }

    // 分隔线
    if (RE_HR.test(line)) {
      out.push('<hr />')
      i += 1
      continue
    }

    // 引用块
    const quote = RE_QUOTE.exec(line)
    if (quote) {
      const body: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const matched = RE_QUOTE.exec(current)
        if (matched) {
          body.push(matched[1] ?? '')
          i += 1
          continue
        }
        // 懒续行：非空且不是新的块起点
        if (current.trim() && !isBlockStart(current)) {
          body.push(current)
          i += 1
          continue
        }
        break
      }
      out.push(`<blockquote>${parseBlocks(body, ctx).join('\n')}</blockquote>`)
      continue
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1] ?? '')) {
      const header = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        if (!current.trim() || !current.includes('|')) break
        rows.push(splitTableRow(current))
        i += 1
      }
      const head = header
        .map((cell) => `<th>${renderInlineMarkdown(cell, ctx)}</th>`)
        .join('')
      const body = rows
        .map((row) => {
          const cells = header
            .map((_, index) => `<td>${renderInlineMarkdown(row[index] ?? '', ctx)}</td>`)
            .join('')
          return `<tr>${cells}</tr>`
        })
        .join('')
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
      continue
    }

    // 列表
    const ul = RE_UL.exec(line)
    const ol = RE_OL.exec(line)
    if (ul || ol) {
      const result = parseList(lines, i, ctx)
      out.push(result.html)
      i = result.next
      continue
    }

    // 缩进代码块
    if (/^ {4}/.test(line)) {
      const body: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        if (!current.trim()) {
          // 后面还有缩进代码才继续
          const next = lines[i + 1] ?? ''
          if (!/^ {4}/.test(next)) break
          body.push('')
          i += 1
          continue
        }
        if (!/^ {4}/.test(current)) break
        body.push(current.replace(/^ {4}/, ''))
        i += 1
      }
      out.push(`<pre><code>${escapeText(body.join('\n'))}</code></pre>`)
      continue
    }

    // 原始 HTML 块：危险标签整块丢弃，其余按文本转义
    // （自动链接 <https://...> 不是 HTML 块，走段落分支）
    if (/^ {0,3}</.test(line) && !/^ {0,3}<(?:https?|mailto|tel):[^>\s]+>/.test(line)) {
      const body: string[] = []
      let dropped = false
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const tag = /^ {0,3}<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(current)
        if (tag && BLOCK_TAGS_TO_DROP.test(tag[1]!)) {
          dropped = true
          body.push(current)
          i += 1
          continue
        }
        if (!current.trim()) break
        body.push(current)
        i += 1
      }
      const text = body.join('\n')
      out.push(dropped ? `<p>${escapeText(text.replace(/<\/?(?:script|style|iframe|object|embed|noscript|template)[^>]*>/gi, ''))}</p>` : `<p>${escapeText(text)}</p>`)
      continue
    }

    // 段落（含 Setext 标题）
    const paragraph: string[] = [line]
    i += 1
    while (i < lines.length) {
      const current = lines[i] ?? ''
      if (!current.trim()) break
      const setext = RE_SETEXT.exec(current)
      if (setext && paragraph.length === 1) {
        const level = setext[1]!.startsWith('=') ? 1 : 2
        out.push(`<h${level}>${renderInlineMarkdown(paragraph[0]!.trim(), ctx)}</h${level}>`)
        paragraph.length = 0
        i += 1
        break
      }
      if (isBlockStart(current)) break
      if (current.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1] ?? '')) break
      paragraph.push(current)
      i += 1
    }
    if (paragraph.length) {
      out.push(`<p>${renderInlineMarkdown(paragraph.join('\n').trim(), ctx)}</p>`)
    }
  }
  return out
}

type ListResult = { html: string; next: number }

/** 去掉首尾的 <p> 包裹（紧凑列表用）。 */
function unwrapParagraph(block: string): string {
  if (block.startsWith('<p>') && block.endsWith('</p>')) return block.slice(3, -4)
  return block
}

/** 解析列表块（无序 / 有序 / 嵌套 / 任务列表）。 */
function parseList(lines: string[], start: number, ctx: Ctx): ListResult {
  const first = lines[start] ?? ''
  const firstUl = RE_UL.exec(first)
  const firstOl = RE_OL.exec(first)
  const ordered = !firstUl && !!firstOl
  const bullet = firstUl ? firstUl[2] : firstOl ? firstOl[3] : '-'
  const items: string[] = []
  let i = start

  while (i < lines.length) {
    const line = lines[i] ?? ''
    const ul = RE_UL.exec(line)
    const ol = RE_OL.exec(line)
    const isUl = !!ul
    const isOl = !!ol
    if (!isUl && !isOl) break
    // 同级列表的标记不同（项目符号不同 / 有序分隔符不同）→ 视为另一个列表
    const marker = isUl ? ul![2] : ol![3]
    const isOrdered = isOl
    if (isOrdered !== ordered) break
    if (marker !== bullet) break

    const indent = (isUl ? ul![1] : ol![1])!.length
    const markerLen = isUl ? ul![2]!.length : ol![2]!.length + ol![3]!.length
    const spaceLen = (isUl ? ul![3] : ol![4])!.length
    const contentIndent = indent + markerLen + spaceLen
    const content = (isUl ? ul![4] : ol![5]) ?? ''
    const body: string[] = [content]
    i += 1

    while (i < lines.length) {
      const current = lines[i] ?? ''
      if (!current.trim()) {
        // 空行后若还是同级/更深的内容则继续，否则结束该列表项
        const next = lines[i + 1] ?? ''
        if (!next.trim()) break
        const nextIndent = next.length - next.trimStart().length
        if (nextIndent >= contentIndent || RE_UL.test(next) || RE_OL.test(next)) {
          body.push('')
          i += 1
          continue
        }
        break
      }
      const currentIndent = current.length - current.trimStart().length
      if (currentIndent >= contentIndent) {
        body.push(current.slice(contentIndent))
        i += 1
        continue
      }
      // 懒续行：非空且不是新块起点 → 并入当前项
      if (!isBlockStart(current) && !RE_UL.test(current) && !RE_OL.test(current)) {
        body.push(current.trim())
        i += 1
        continue
      }
      break
    }

    const task = /^\[([ xX])\]\s+(.*)$/.exec(body[0] ?? '')
    if (task) {
      const checked = task[1]!.toLowerCase() === 'x'
      body[0] = task[2] ?? ''
      const inner = parseBlocks(body, ctx).join('\n')
      const checkedAttr = checked ? 'true' : 'false'
      items.push(
        `<li data-type="taskItem" data-checked="${checkedAttr}"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div>${inner}</div></li>`,
      )
      continue
    }

    const inner = parseBlocks(body, ctx)
    // 紧凑列表（条目内部没有空行）时把段落标签去掉，和 Markdown 语义一致。
    const loose = body.some((line, index) => index > 0 && line === '' && body[index + 1] !== undefined)
    const contentHtml = loose ? inner.join('\n') : inner.map(unwrapParagraph).join('\n')
    items.push(`<li>${contentHtml}</li>`)
  }

  const tag = ordered ? 'ol' : 'ul'
  const allTasks = !ordered && items.length > 0 && items.every((item) => item.includes('data-type="taskItem"'))
  const attrs = allTasks ? ' data-type="taskList"' : ''
  return { html: `<${tag}${attrs}>${items.join('')}</${tag}>`, next: i }
}

/**
 * Markdown → HTML。
 */
export function markdownToHtml(md: string, options: MarkdownToHtmlOptions = {}): string {
  const src = normalizeSource(md)
  if (!src.trim()) return '<p></p>'
  const ctx: Ctx = { refs: new Map(), softBreak: options.softBreak ?? 'br' }
  // 引用式链接的定义可以出现在文档任意位置，先全量收集再解析正文。
  const lines = collectReferenceDefinitions(src.split('\n'), ctx)
  const html = parseBlocks(lines, ctx).join('\n')
  return html || '<p></p>'
}

/** 抽出引用式链接定义（跳过代码块内部），返回剩余正文行。 */
function collectReferenceDefinitions(lines: string[], ctx: Ctx): string[] {
  const rest: string[] = []
  let fenceMarker = ''
  for (const line of lines) {
    const fence = RE_FENCE.exec(line)
    if (fence) {
      const marker = fence[1]![0]!
      if (!fenceMarker) fenceMarker = marker
      else if (marker === fenceMarker) fenceMarker = ''
      rest.push(line)
      continue
    }
    if (!fenceMarker) {
      const def = RE_REF_DEF.exec(line)
      if (def) {
        const key = (def[1] ?? '').trim().toLowerCase()
        let url = def[2] ?? ''
        if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1)
        const title = def[3] ?? def[4] ?? def[5]
        if (key && !ctx.refs.has(key)) {
          ctx.refs.set(key, {
            url: unescapeMarkdown(url),
            title: title ? unescapeMarkdown(title) : undefined,
          })
        }
        continue
      }
    }
    rest.push(line)
  }
  return rest
}
