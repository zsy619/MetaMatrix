import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { checkDocumentLinks, checkHeadingHierarchy } from './rteWave21'
import { collectSensitiveHits } from './rteSensitiveWords'
import { normalizeGroupLayout } from './rteImageGroup'

export type DeepOptimizeChange = {
  detail: string
}

export type OptimizeAction = {
  id: 'layout12' | 'layout21'
  label: string
  pos: number
}

export type OptimizeReportLine = {
  text: string
  pos?: number
  done?: boolean
  actions?: OptimizeAction[]
}

export type DeepOptimizeResult = {
  changes: DeepOptimizeChange[]
  remaining: OptimizeReportLine[]
  lines: OptimizeReportLine[]
}

const LIST_NAMES = new Set(['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem'])
const SKIPPED_NOTE = '措辞、图表数据和评论保持原样。'

function isEmptyParagraph(node: PmNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0
}

function inSkippedIndent(doc: PmNode, pos: number, name: string): boolean {
  if (name === 'heading' || name === 'codeBlock') return true
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (LIST_NAMES.has($pos.node(depth).type.name) || $pos.node(depth).type.name === 'codeBlock') return true
  }
  return false
}

function skipInlineTidy(doc: PmNode, pos: number, node: PmNode): boolean {
  if (node.marks.some((mark) => mark.type.name === 'code' || mark.type.name === 'commentAnchor')) return true
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name
    if (name === 'codeBlock' || name === 'math' || name === 'mermaid') return true
  }
  return false
}

export type TidyInline = { text: string; spaces: boolean; punct: boolean; gap: boolean }

/** 连续空格压成一个，重复标点收成一个，中文和英文或数字之间补一个空格。带网址的句子不补间距。 */
export function tidyInlineText(input: string): TidyInline {
  let text = input
  const spaced = text.replace(/[ \u00a0\u3000]{2,}/g, ' ')
  const spaces = spaced !== text
  text = spaced
  const puncted = text.replace(/([。！？，、；：!?])\1+/g, '$1')
  const punct = puncted !== text
  text = puncted
  let gap = false
  if (!text.includes('://')) {
    const gapped = text
      .replace(/([\u3400-\u9fff])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u3400-\u9fff])/g, '$1 $2')
    gap = gapped !== text
    text = gapped
  }
  return { text, spaces, punct, gap }
}

function headingNumbers(text: string): number[] | null {
  const matched = text.trim().match(/^(\d+(?:\.\d+)*)(?:[.、\s]|$)/)
  if (!matched) return null
  const parts = matched[1]!.split('.').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return null
  return parts
}

function headingNumberGap(prev: number[], next: number[]): boolean {
  if (prev.length !== next.length) return false
  for (let index = 0; index < prev.length - 1; index += 1) {
    if (prev[index] !== next[index]) return false
  }
  const last = prev.length - 1
  return next[last]! > prev[last]! + 1
}

type Hint = OptimizeReportLine & { pos: number }

function pushCapped(lines: OptimizeReportLine[], label: string, items: Hint[], limit = 6) {
  items.slice(0, limit).forEach((item) => lines.push(item))
  if (items.length > limit) lines.push({ text: `${label}另有 ${items.length - limit} 条` })
}

/**
 * 一次事务做安全整理，并给出仍需手工处理的清单。
 * 不改措辞、图表数据和评论。
 */
export function deepOptimizeDocument(editor: Editor): DeepOptimizeResult {
  const { state } = editor
  const { doc, schema } = state
  let tr = state.tr
  let headingFixed = 0
  let indentFixed = 0
  let linksFixed = 0
  let captionsFixed = 0
  let imageNo = 0
  let spacesFixed = 0
  let punctFixed = 0
  let gapFixed = 0

  const textEdits: Array<{ from: number; to: number; text: string; marks: PmNode['marks'] }> = []
  const hints: Hint[] = []
  let prevHeadingNo: number[] | null = null
  let prevLevel = 0

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level) || 1
      let nextLevel = level
      if (prevLevel > 0 && level > prevLevel + 1) {
        nextLevel = prevLevel + 1
        headingFixed += 1
      }
      prevLevel = nextLevel
      const numbers = headingNumbers(node.textContent)
      if (numbers && prevHeadingNo && headingNumberGap(prevHeadingNo, numbers)) {
        hints.push({ text: `标题编号从 ${prevHeadingNo.join('.')} 跳到 ${numbers.join('.')}`, pos })
      }
      if (numbers) prevHeadingNo = numbers
      if (nextLevel !== level || node.attrs.textIndent) {
        if (node.attrs.textIndent) indentFixed += 1
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: nextLevel, textIndent: null })
      }
      return
    }
    if (node.type.name === 'image') {
      imageNo += 1
      const raw = String(node.attrs.caption || '').trim()
      if (raw) {
        const rest = raw.replace(/^图\s*\d+\s*[：:\-]?\s*/, '')
        const caption = rest ? `图 ${imageNo}：${rest}` : `图 ${imageNo}`
        if (caption !== raw) {
          captionsFixed += 1
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption })
        }
      }
      const alt = String(node.attrs.alt || '').trim()
      if (!alt) hints.push({ text: `图片缺少替代文本（图 ${imageNo}）`, pos })
      return
    }
    if (node.type.name === 'imageGroup' && node.childCount === 3 && normalizeGroupLayout(node.attrs.layout) === 'row') {
      hints.push({
        text: '三张横排可以排成 12（左一右二）或 21（左二右一）',
        pos,
        actions: [
          { id: 'layout12', label: '套用 12', pos },
          { id: 'layout21', label: '套用 21', pos },
        ],
      })
    }
    if (node.type.name === 'table') {
      const row = node.firstChild
      if (row?.type.name === 'tableRow') {
        let headers = 0
        let empty = 0
        row.forEach((cell) => {
          if (cell.type.name !== 'tableHeader') return
          headers += 1
          if (!cell.textContent.trim()) empty += 1
        })
        if (headers > 0 && empty === headers) hints.push({ text: '表格表头是空的', pos })
      }
    }
    if (
      (node.type.name === 'paragraph' || node.type.name === 'codeBlock') &&
      node.attrs.textIndent &&
      inSkippedIndent(doc, pos, node.type.name)
    ) {
      indentFixed += 1
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, textIndent: null })
    }
    if (!node.isText || !node.text) return
    const link = node.marks.find((mark) => mark.type.name === 'link')
    const href = String(link?.attrs.href || '')
    const dropLink = !!link && (!href || /^(javascript:|data:text\/html)/i.test(href))
    if (dropLink && link) {
      linksFixed += 1
      tr = tr.removeMark(pos, pos + node.nodeSize, link.type)
    }
    if (!skipInlineTidy(doc, pos, node)) {
      const tidy = tidyInlineText(node.text)
      if (tidy.text !== node.text) {
        if (tidy.spaces) spacesFixed += 1
        if (tidy.punct) punctFixed += 1
        if (tidy.gap) gapFixed += 1
        const marks = dropLink && link ? node.marks.filter((mark) => mark !== link) : node.marks
        textEdits.push({ from: pos, to: pos + node.nodeSize, text: tidy.text, marks })
      }
    }
  })

  textEdits.sort((a, b) => b.from - a.from)
  for (const edit of textEdits) {
    const from = tr.mapping.map(edit.from)
    const to = tr.mapping.map(edit.to)
    const text = schema.text(edit.text, edit.marks)
    tr = tr.replaceWith(from, to, text)
  }

  const deletes: Array<{ from: number; to: number }> = []
  const visit = (node: PmNode, pos: number) => {
    if (node.type.name === 'codeBlock') return
    let run: Array<{ from: number; to: number }> = []
    const flush = () => {
      if (run.length >= 3) deletes.push({ from: run[1]!.from, to: run[run.length - 1]!.to })
      run = []
    }
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset
      if (isEmptyParagraph(child)) run.push({ from: childPos, to: childPos + child.nodeSize })
      else flush()
      if (child.childCount) visit(child, childPos)
    })
    flush()
  }
  visit(doc, -1)

  deletes.sort((a, b) => b.from - a.from)
  for (const range of deletes) {
    tr = tr.delete(tr.mapping.map(range.from), tr.mapping.map(range.to))
  }

  const walkLists = (node: PmNode, pos: number) => {
    let prevOrdered = false
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset
      if (child.type.name === 'orderedList') {
        const start = Number(child.attrs.start) || 1
        if (prevOrdered && start === 1) hints.push({ text: '有序列表从 1 重新编号', pos: childPos })
        prevOrdered = true
      } else if (!(child.type.name === 'paragraph' && child.content.size === 0)) {
        prevOrdered = false
      }
      if (child.childCount) walkLists(child, childPos)
    })
  }
  walkLists(doc, -1)

  if (tr.docChanged) editor.view.dispatch(tr)

  const changes: DeepOptimizeChange[] = []
  if (headingFixed) changes.push({ detail: `已把 ${headingFixed} 个跳级标题收成连续层级` })
  if (indentFixed) changes.push({ detail: `已去掉 ${indentFixed} 处标题、列表或代码上的首行缩进` })
  if (linksFixed) changes.push({ detail: `已去掉 ${linksFixed} 个空链接或不安全链接` })
  if (deletes.length) changes.push({ detail: `已合并 ${deletes.length} 处连续空段` })
  if (captionsFixed) changes.push({ detail: `已重排 ${captionsFixed} 条图片题注` })
  if (spacesFixed) changes.push({ detail: `已收紧 ${spacesFixed} 处连续空格` })
  if (punctFixed) changes.push({ detail: `已收起 ${punctFixed} 处重复标点` })
  if (gapFixed) changes.push({ detail: `已在 ${gapFixed} 处补上中英文间距` })

  const lines: OptimizeReportLine[] = changes.map((item) => ({ text: item.detail, done: true }))
  lines.push({ text: SKIPPED_NOTE, done: true })

  const mappedHints = hints.map((hint) => ({
    ...hint,
    pos: tr.mapping.map(hint.pos, -1),
    actions: hint.actions?.map((action) => ({ ...action, pos: tr.mapping.map(action.pos, -1) })),
  }))

  const remaining: OptimizeReportLine[] = []
  for (const issue of checkHeadingHierarchy(editor)) {
    if (!issue.text || issue.text === '(空)' || issue.message.includes('为空') || issue.message.includes('开头')) {
      remaining.push({ text: `H${issue.level}「${issue.text}」— ${issue.message}`, pos: issue.pos })
    }
  }
  const emptyLinks: Hint[] = []
  const unsafeLinks: Hint[] = []
  const externalLinks: Hint[] = []
  for (const issue of checkDocumentLinks(editor)) {
    const line = { text: `${issue.message}｜「${issue.text || '无文本'}」`, pos: issue.pos }
    if (issue.severity === 'empty') emptyLinks.push(line)
    else if (issue.message.includes('不安全')) unsafeLinks.push(line)
    else emptyLinks.push(line)
  }
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const link = node.marks.find((mark) => mark.type.name === 'link')
    const href = String(link?.attrs.href || '')
    if (link && /^https?:/i.test(href)) {
      externalLinks.push({ text: `外链｜「${node.text || href}」`, pos })
    }
  })
  const sensitive = collectSensitiveHits(editor.state.doc).filter((hit) => {
    const node = editor.state.doc.nodeAt(hit.from)
    return !!node && !skipInlineTidy(editor.state.doc, hit.from, node)
  })

  const layoutHints = mappedHints.filter((hint) => hint.actions?.length)
  const altHints = mappedHints.filter((hint) => hint.text.startsWith('图片缺少'))
  const otherHints = mappedHints.filter((hint) => !hint.actions?.length && !hint.text.startsWith('图片缺少'))
  if (
    layoutHints.length ||
    altHints.length ||
    otherHints.length ||
    remaining.length ||
    emptyLinks.length ||
    externalLinks.length ||
    sensitive.length
  ) {
    lines.push({ text: '下面这些仍要手工处理：' })
  }
  ;[...layoutHints, ...otherHints].forEach((hint) => {
    lines.push(hint)
    remaining.push(hint)
  })
  pushCapped(lines, '缺替代文本的图片', altHints)
  altHints.slice(0, 6).forEach((hint) => remaining.push(hint))
  remaining.forEach((line) => {
    if (!lines.includes(line)) lines.push(line)
  })
  pushCapped(lines, '空链或无效链接', emptyLinks)
  pushCapped(lines, '外链', externalLinks)
  if (unsafeLinks.length) pushCapped(lines, '不安全链接', unsafeLinks)
  pushCapped(
    lines,
    '敏感词或笔误',
    sensitive.map((hit) => ({ text: `${hit.hint}：「${hit.word}」`, pos: hit.from })),
  )
  emptyLinks.forEach((line) => remaining.push(line))
  externalLinks.slice(0, 6).forEach((line) => remaining.push(line))
  sensitive.slice(0, 6).forEach((hit) => remaining.push({ text: `${hit.hint}：「${hit.word}」`, pos: hit.from }))

  return { changes, remaining, lines }
}
