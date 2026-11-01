import type { QuadrantItem } from '../types/canvas'

/** 顶层块级标签（TipTap 文档根下的兄弟节点；img/video 为块级媒体） */
const BLOCK_TAG_RE =
  /^(p|h[1-6]|ul|ol|blockquote|pre|hr|table|div|img|video)$/i

/** 即使没有可见文本也要保留的结构块（空表格、分隔线、图片、视频） */
const STRUCTURAL_BLOCK_RE = /^(hr|table|img|video)$/i

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function itemTextToHtml(text: string | undefined | null): string {
  const raw = text ?? ''
  if (!raw.trim()) return '<p></p>'
  if (looksLikeHtml(raw)) return raw
  return `<p>${escapeHtml(raw)}</p>`
}

/** 将条目列表合成为一份编辑器 HTML */
export function itemsToHtml(items: QuadrantItem[] | undefined | null): string {
  if (!items || items.length === 0) return '<p></p>'
  return items.map((it) => itemTextToHtml(it.text)).join('')
}

function normalizeHtml(html: string): string {
  // 标签间空白在 getHTML ↔ itemsToHtml 往返中常被吃掉；比较时忽略以免误判变更
  return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

/** 是否空文档（仅空段落 / 无可见文本；含图片/视频则非空） */
export function isEmptyHtml(html: string): boolean {
  // <img>/<video> 无文本节点，剥离标签后为空，但属于有效内容
  if (/<(img|video)\b/i.test(html)) return false
  if (/data-type=["'](columns|column|image-group|link-card|date-chip|doc-title|callout|math-display)["']/i.test(html)) return false
  if (/data-annotation\b/i.test(html)) return false
  if (/data-type=["']form-(text-input|radio-group|checkbox-group|select|textarea|number-input|date-input|switch)["']/i.test(html)) return false
  if (/class=["'][^"']*rte-form/i.test(html)) return false
  const plain = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
  return plain.length === 0
}

function isStructuralBlock(tagName: string): boolean {
  return STRUCTURAL_BLOCK_RE.test(tagName)
}

/** 空段落按上下文保留；table/hr/img/video/空列表即使无文字也保留 */
export function blockHtmlIsKept(html: string): boolean {
  const tag = /^<([a-z0-9]+)/i.exec(html.trim())?.[1] || 'div'
  return shouldKeepBlock(html, tag)
}

function shouldKeepBlock(html: string, tagName: string): boolean {
  if (isStructuralBlock(tagName)) return true
  if (/^<(hr|table|img|video)\b/i.test(html.trim())) return true
  // 块内嵌媒体（少数情况下包在 p/div 里）
  if (/<(img|video)\b/i.test(html)) return true
  // 块级公式：文本可能仅在 data-tex，仍需保留
  if (/data-type=["']math-display["']/i.test(html)) return true
  if (/data-type=["'](columns|column|image-group|link-card|date-chip|doc-title|callout)["']/i.test(html)) return true
  if (/data-annotation\b/i.test(html)) return true
  // 表单控件：选项/值在 data-*，可能无可见文本
  if (/data-type=["']form-(text-input|radio-group|checkbox-group|select|textarea|number-input|date-input|switch)["']/i.test(html)) return true
  if (/class=["'][^"']*rte-form/i.test(html)) return true
  // 空 ul/ol 仍是占位结构（模板常用 bullet('') / ordered('')）
  if (/^(ul|ol)$/i.test(tagName)) return true
  return !isEmptyHtml(html)
}

/**
 * 从 open 标签起始位置找到配对的闭合标签结束位置（按同名标签嵌套计数）。
 * 用于把整张 <table>…</table> 当作一块，避免被单元格内的 <p> 拆碎。
 */
function findMatchingClose(html: string, openStart: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi')
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi')
  const firstGt = html.indexOf('>', openStart)
  if (firstGt < 0) return -1

  let depth = 1
  let pos = firstGt + 1
  while (pos < html.length && depth > 0) {
    openRe.lastIndex = pos
    closeRe.lastIndex = pos
    const openM = openRe.exec(html)
    const closeM = closeRe.exec(html)
    if (!closeM) return -1
    if (openM && openM.index < closeM.index) {
      depth += 1
      pos = openM.index + openM[0].length
    } else {
      depth -= 1
      pos = closeM.index + closeM[0].length
      if (depth === 0) return pos
    }
  }
  return -1
}

/**
 * 把编辑器 HTML 拆成顶层块文本数组。
 * 按顶层 p/h1-h6/ul/ol/blockquote/pre/hr/table/div/img/video 切分；
 * 不切开 table 等块内部的嵌套标签（否则单元格里的 <p> 会把表格拆碎）。
 * <img> 按 void 块整段保留；<video>…</video> 按配对闭合保留，避免输入文字时丢掉。
 * 拆不出则整份 HTML 作为单条。
 */
export function htmlToBlockTexts(html: string): string[] {
  const trimmed = (html ?? '').trim()
  if (!trimmed) return []

  const parts: string[] = []
  let i = 0
  const s = trimmed

  while (i < s.length) {
    if (/\s/.test(s[i]!)) {
      i += 1
      continue
    }

    if (s[i] !== '<') {
      let j = i
      while (j < s.length && s[j] !== '<') j += 1
      const text = s.slice(i, j).trim()
      if (text) parts.push(`<p>${escapeHtml(text)}</p>`)
      i = j
      continue
    }

    const afterLt = s.slice(i + 1)
    const nameMatch = afterLt.match(/^([a-zA-Z][\w:-]*)/)
    if (!nameMatch) {
      const gt = s.indexOf('>', i)
      i = gt < 0 ? s.length : gt + 1
      continue
    }

    const tagName = nameMatch[1]!
    const tagLower = tagName.toLowerCase()
    const openEnd = s.indexOf('>', i)
    if (openEnd < 0) break

    // 非顶层块：整段兜底（避免丢内容）
    if (!BLOCK_TAG_RE.test(tagLower)) {
      // 跳过未知标签，或把剩余当作一块
      if (parts.length === 0 && i === 0) {
        return shouldKeepBlock(trimmed, tagLower) ? [trimmed] : []
      }
      const gt = openEnd + 1
      i = gt
      continue
    }

    // <hr> / <img> 等 void / 自闭合：整段标签作为一块
    if (tagLower === 'hr' || tagLower === 'img') {
      const block = s.slice(i, openEnd + 1)
      if (shouldKeepBlock(block, tagLower)) parts.push(block)
      i = openEnd + 1
      continue
    }

    // 空元素写法 <p />
    if (s[openEnd - 1] === '/') {
      const block = s.slice(i, openEnd + 1)
      if (shouldKeepBlock(block, tagLower)) {
        parts.push(block)
      } else if (
        tagLower === 'p' &&
        parts.length > 0 &&
        isEmptyHtml(block)
      ) {
        parts.push(block)
      }
      i = openEnd + 1
      continue
    }

    const end = findMatchingClose(s, i, tagLower)
    if (end < 0) {
      const block = s.slice(i)
      if (shouldKeepBlock(block, tagLower)) parts.push(block)
      break
    }

    const block = s.slice(i, end)
    if (shouldKeepBlock(block, tagLower)) {
      parts.push(block)
    } else if (
      tagLower === 'p' &&
      parts.length > 0 &&
      isEmptyHtml(block)
    ) {
      // 保留「已有内容之后」的空段落：表单原子后的可编辑落点。
      // 若丢掉尾段，items 回写后文末落在 form* 上 → NodeSelection / 误开属性面板。
      parts.push(block)
    }
    i = end
  }

  // 整份只有空段落时视为无条目
  if (parts.length === 0) return []
  return parts
}

export function normalizeHtmlForCompare(html: string): string {
  return normalizeHtml(html || '')
}

export interface ItemsSyncOps {
  update: (id: string, text: string) => void
  add: (text: string) => { id: string } | null | undefined
  remove: (id: string) => void
}

/**
 * 把编辑器 HTML 写回 items：按索引对齐，多删少增，尽量保留原 id。
 */
export function syncItemsFromHtml(
  items: QuadrantItem[],
  html: string,
  ops: ItemsSyncOps,
): void {
  const texts = htmlToBlockTexts(html)
  const current = items.slice()

  const n = Math.min(current.length, texts.length)
  for (let i = 0; i < n; i++) {
    const next = texts[i]!
    if (
      normalizeHtmlForCompare(itemTextToHtml(current[i]!.text)) !==
      normalizeHtmlForCompare(next)
    ) {
      // 纯文本条目若内容相同也跳过
      if (
        !looksLikeHtml(current[i]!.text) &&
        !looksLikeHtml(next) &&
        current[i]!.text === next
      ) {
        continue
      }
      // 比较纯文本剥离后
      const strip = (s: string) =>
        s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      if (
        strip(current[i]!.text) === strip(next) &&
        current[i]!.text === next
      ) {
        continue
      }
      if (current[i]!.text === next) continue
      ops.update(current[i]!.id, next)
    }
  }

  for (let i = current.length; i < texts.length; i++) {
    ops.add(texts[i]!)
  }

  for (let i = current.length - 1; i >= texts.length; i--) {
    ops.remove(current[i]!.id)
  }
}
