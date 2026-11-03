/**
 * 轻量 HTML 缩进格式化（源码模式使用）。
 *
 * 设计取向：
 * - 不引第三方美化库，纯字符串实现，产物可控、可单测；
 * - 只调整空白与换行，不改标签/属性/文本内容（`<pre>`、`<script>` 等原样保留）；
 * - 块级元素独占行，行内元素（span/b/a…）保持同行。
 */

/** 自闭合（void）元素：不会产生结束标签。 */
export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** 块级元素：独占一行。 */
export const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'base', 'blockquote', 'body', 'canvas', 'caption',
  'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head',
  'header', 'hgroup', 'html', 'legend', 'li', 'link', 'main', 'meta', 'nav',
  'noscript', 'ol', 'option', 'p', 'pre', 'section', 'select', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul',
])

/** 原始文本元素：内容按原样保留，不折叠空白。 */
export const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'pre'])

export type FormatHtmlOptions = {
  /** 缩进字符串，默认两空格。 */
  indent?: string
}

type Tok =
  | { kind: 'open'; name: string; text: string; selfClosing: boolean; spaceBefore: boolean }
  | { kind: 'close'; name: string; text: string; spaceBefore: boolean }
  | { kind: 'text'; body: string; spaceBefore: boolean }
  | { kind: 'comment'; text: string }
  | { kind: 'doctype'; text: string }
  | { kind: 'raw'; text: string }

const NAME_RE = /^[A-Za-z][A-Za-z0-9:-]*/

function readTagName(inner: string): string {
  const m = NAME_RE.exec(inner)
  return m ? m[0].toLowerCase() : ''
}

/** 找到 `>` 的位置，跳过引号内的内容。 */
function findTagEnd(src: string, from: number): number {
  let quote = ''
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

/** 把 HTML 切成 token 序列。 */
export function tokenizeHtml(src: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  let pendingSpace = false
  /** 上一个 token 是结束标签：紧随其后的空白需要保留（`</b> 文字`）。 */
  let afterCloseTag = false

  const pushText = (raw: string) => {
    const body = raw.replace(/\s+/g, ' ').trim()
    const spaceBefore = pendingSpace || (afterCloseTag && /^\s/.test(raw))
    if (body) tokens.push({ kind: 'text', body, spaceBefore })
    pendingSpace = /\s$/.test(raw)
    afterCloseTag = false
  }

  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      const stop = end === -1 ? src.length : end + 3
      tokens.push({ kind: 'comment', text: src.slice(i, stop) })
      i = stop
      pendingSpace = false
      afterCloseTag = false
      continue
    }
    if (src.startsWith('<!', i)) {
      const end = src.indexOf('>', i)
      const stop = end === -1 ? src.length : end + 1
      tokens.push({ kind: 'doctype', text: src.slice(i, stop) })
      i = stop
      pendingSpace = false
      afterCloseTag = false
      continue
    }
    if (src[i] === '<') {
      const end = findTagEnd(src, i + 1)
      if (end === -1) {
        pushText(src.slice(i))
        i = src.length
        break
      }
      const raw = src.slice(i, end + 1)
      const inner = raw.slice(1, -1)
      const spaceBefore = pendingSpace
      if (inner.startsWith('/')) {
        tokens.push({ kind: 'close', name: readTagName(inner.slice(1)), text: raw, spaceBefore })
        i = end + 1
        pendingSpace = false
        afterCloseTag = true
        continue
      }
      const name = readTagName(inner)
      const selfClosing = inner.trimEnd().endsWith('/') || VOID_ELEMENTS.has(name)
      tokens.push({ kind: 'open', name, text: raw, selfClosing, spaceBefore })
      i = end + 1
      pendingSpace = false
      afterCloseTag = false

      if (!selfClosing && RAW_TEXT_ELEMENTS.has(name)) {
        const closeRe = new RegExp(`</${name}\\s*>`, 'i')
        const rest = src.slice(i)
        const m = closeRe.exec(rest)
        const rawEnd = m ? i + m.index : src.length
        const rawText = src.slice(i, rawEnd)
        if (rawText) tokens.push({ kind: 'raw', text: rawText })
        i = rawEnd
      }
      continue
    }
    const next = src.indexOf('<', i)
    const stop = next === -1 ? src.length : next
    pushText(src.slice(i, stop))
    i = stop
  }

  return tokens
}

type Frame = {
  name: string
  block: boolean
  /** 打开标签之后是否还没写入任何内容（用于 `<div></div>` 合并成一行）。 */
  pendingOpen: boolean
}

/** 上一段结尾是单词字符时，补一个空格更贴近原文本语义。 */
function needsSpaceBefore(cur: string): boolean {
  return /[A-Za-z0-9一-龥]$/.test(cur)
}

/**
 * 格式化 HTML：只调整缩进与换行，不改变标签与文本内容。
 */
export function formatHtml(source: string, options: FormatHtmlOptions = {}): string {
  if (typeof source !== 'string') return ''
  if (!source.trim()) return source
  const indentUnit = options.indent ?? '  '
  const tokens = tokenizeHtml(source)

  const lines: string[] = []
  let cur = ''
  let indent = 0
  const stack: Frame[] = []

  const pad = () => indentUnit.repeat(Math.max(0, indent))
  const isBlank = () => cur.trim() === ''
  const flush = () => {
    if (!isBlank()) lines.push(cur.replace(/\s+$/, ''))
    cur = ''
  }
  const startLine = () => {
    if (isBlank()) cur = pad()
  }
  const markContent = () => {
    const frame = stack[stack.length - 1]
    if (frame) frame.pendingOpen = false
  }

  for (const tok of tokens) {
    if (tok.kind === 'doctype' || tok.kind === 'comment') {
      flush()
      cur = pad() + tok.text
      flush()
      continue
    }
    if (tok.kind === 'raw') {
      flush()
      const body = tok.text.replace(/^\n+/, '').replace(/\s+$/, '')
      const rawLines = body.split('\n').map((l) => (l.trim() ? pad() + l.replace(/^\s+/, '') : ''))
      cur = rawLines.join('\n')
      flush()
      continue
    }
    if (tok.kind === 'text') {
      if (!stack.length) {
        flush()
        cur = pad() + tok.body
        flush()
        continue
      }
      startLine()
      if (!isBlank() && tok.spaceBefore && !cur.endsWith(' ')) cur += ' '
      cur += tok.body
      markContent()
      continue
    }
    if (tok.kind === 'open') {
      const block = BLOCK_ELEMENTS.has(tok.name)
      if (block) {
        flush()
        startLine()
        cur += tok.text
        if (tok.selfClosing) {
          flush()
        } else {
          indent += 1
          stack.push({ name: tok.name, block, pendingOpen: true })
        }
        continue
      }
      // 行内元素：保持同行
      startLine()
      if (!isBlank() && tok.spaceBefore && !cur.endsWith(' ') && needsSpaceBefore(cur)) cur += ' '
      cur += tok.text
      if (tok.selfClosing) markContent()
      else stack.push({ name: tok.name, block: false, pendingOpen: true })
      continue
    }
    // close
    const name = tok.name
    let frame: Frame | undefined
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      if (stack[k].name === name) {
        frame = stack[k]
        stack.length = k
        break
      }
    }
    if (frame?.block) {
      indent = Math.max(0, stack.length)
      if (frame.pendingOpen && !isBlank()) {
        // `<div></div>` 合并成一行
        cur += tok.text
        flush()
      } else if (isBlank()) {
        flush()
        cur = pad() + tok.text
        flush()
      } else {
        cur += tok.text
        flush()
      }
      continue
    }
    // 行内结束标签
    startLine()
    if (!isBlank() && tok.spaceBefore && !cur.endsWith(' ') && needsSpaceBefore(cur)) cur += ' '
    cur += tok.text
    markContent()
  }
  flush()

  return lines.join('\n')
}

export default formatHtml
