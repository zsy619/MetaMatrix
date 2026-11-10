import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { checkDocumentLinks, checkHeadingHierarchy } from './rteWave21'

export type DeepOptimizeChange = {
  detail: string
}

export type DeepOptimizeResult = {
  changes: DeepOptimizeChange[]
  remaining: Array<{ text: string; pos?: number }>
}

const LIST_NAMES = new Set(['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem'])

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

/**
 * 一次事务做安全整理：跳级标题收成连续层级、去掉不该有的首行缩进、
 * 去掉不安全链接、合并连续空段、重排图片题注。措辞、评论和图表数据不动。
 */
export function deepOptimizeDocument(editor: Editor): DeepOptimizeResult {
  const { state } = editor
  const { doc } = state
  let tr = state.tr
  let headingFixed = 0
  let indentFixed = 0
  let linksFixed = 0
  let captionsFixed = 0
  let imageNo = 0

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
      const indent = node.attrs.textIndent ? null : node.attrs.textIndent
      if (nextLevel !== level || node.attrs.textIndent) {
        if (node.attrs.textIndent) indentFixed += 1
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: nextLevel, textIndent: indent })
      }
      return
    }
    if (node.type.name === 'image') {
      imageNo += 1
      const raw = String(node.attrs.caption || '').trim()
      const rest = raw.replace(/^图\s*\d+\s*[：:\-]?\s*/, '')
      const caption = rest ? `图 ${imageNo}：${rest}` : `图 ${imageNo}`
      if (caption !== raw) {
        captionsFixed += 1
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption })
      }
      return
    }
    if (
      (node.type.name === 'paragraph' || node.type.name === 'codeBlock') &&
      node.attrs.textIndent &&
      inSkippedIndent(doc, pos, node.type.name)
    ) {
      indentFixed += 1
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, textIndent: null })
    }
    if (!node.isText) return
    const link = node.marks.find((mark) => mark.type.name === 'link')
    const href = String(link?.attrs.href || '')
    if (link && (!href || /^(javascript:|data:text\/html)/i.test(href))) {
      linksFixed += 1
      tr = tr.removeMark(pos, pos + node.nodeSize, link.type)
    }
  })

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
  for (const range of deletes) tr = tr.delete(range.from, range.to)

  if (tr.docChanged) editor.view.dispatch(tr)

  const changes: DeepOptimizeChange[] = []
  if (headingFixed) changes.push({ detail: `已把 ${headingFixed} 个跳级标题收成连续层级` })
  if (indentFixed) changes.push({ detail: `已去掉 ${indentFixed} 处标题、列表或代码上的首行缩进` })
  if (linksFixed) changes.push({ detail: `已去掉 ${linksFixed} 个空链接或不安全链接` })
  if (deletes.length) changes.push({ detail: `已合并 ${deletes.length} 处连续空段` })
  if (captionsFixed) changes.push({ detail: `已重排 ${captionsFixed} 条图片题注` })

  const remaining: Array<{ text: string; pos?: number }> = []
  for (const issue of checkHeadingHierarchy(editor)) {
    if (!issue.text || issue.text === '(空)' || issue.message.includes('为空') || issue.message.includes('开头')) {
      remaining.push({ text: `H${issue.level}「${issue.text}」— ${issue.message}`, pos: issue.pos })
    }
  }
  for (const issue of checkDocumentLinks(editor)) {
    remaining.push({ text: `${issue.message}｜「${issue.text || '无文本'}」`, pos: issue.pos })
  }
  return { changes, remaining }
}
