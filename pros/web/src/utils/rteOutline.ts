import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { BLOCK_IDENTITY_ATTR } from '../extensions/blockIdentity'

export type OutlineHeading = {
  level: number
  text: string
  blockId?: string
  htmlId?: string
}

const HEADING_RE = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi

function attrValue(attrs: string, name: string): string {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return (match?.[1] || match?.[2] || match?.[3] || '').trim()
}

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
}

/** 从 HTML 抽 h1–h6，带上 data-block-id / id，供大纲跳转。 */
export function outlineFromHTML(html: string): OutlineHeading[] {
  const out: OutlineHeading[] = []
  const source = String(html || '')
  HEADING_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HEADING_RE.exec(source))) {
    const text = stripTags(match[3] || '')
    if (!text) continue
    const attrs = match[2] || ''
    const blockId = attrValue(attrs, 'data-block-id')
    const htmlId = attrValue(attrs, 'id')
    out.push({
      level: Number(match[1]) || 1,
      text,
      ...(blockId ? { blockId } : {}),
      ...(htmlId ? { htmlId } : {}),
    })
  }
  return out
}

/** 从 ProseMirror 文档抽标题（含块身份）。 */
export function outlineFromPmDoc(doc: PmNode): OutlineHeading[] {
  const out: OutlineHeading[] = []
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    if (!text) return
    const blockId = String(node.attrs[BLOCK_IDENTITY_ATTR] || '').trim()
    const htmlId = String(node.attrs.id || '').trim()
    out.push({
      level: Number(node.attrs.level) || 1,
      text: text.slice(0, 200),
      ...(blockId ? { blockId } : {}),
      ...(htmlId ? { htmlId } : {}),
    })
  })
  return out
}

export function sameOutline(a: OutlineHeading[], b: OutlineHeading[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, index) =>
        item.level === b[index]?.level &&
        item.text === b[index]?.text &&
        (item.blockId || '') === (b[index]?.blockId || ''),
    )
  )
}

/** 在已渲染的编辑器根节点里找到对应标题元素。优先块身份，其次 html id，再按层级+文本。 */
export function findOutlineElement(root: ParentNode, heading: OutlineHeading): HTMLElement | null {
  if (heading.blockId) {
    const el = root.querySelector(`[data-block-id="${cssAttr(heading.blockId)}"]`)
    if (el instanceof HTMLElement) return el
  }
  if (heading.htmlId) {
    const el = root.querySelector(`#${cssIdent(heading.htmlId)}`)
    if (el instanceof HTMLElement) return el
  }
  const all = root.querySelectorAll(`h${heading.level}`)
  for (const el of all) {
    if (el instanceof HTMLElement && el.textContent?.trim() === heading.text) return el
  }
  return null
}

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function cssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

/** 把光标移到标题并滚入视野。找不到时返回 false。 */
export function selectOutlineHeading(editor: Editor, heading: OutlineHeading): boolean {
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found != null || node.type.name !== 'heading') return
    const level = Number(node.attrs.level) || 1
    const text = node.textContent.trim()
    const blockId = String(node.attrs[BLOCK_IDENTITY_ATTR] || '').trim()
    if (heading.blockId && blockId && blockId === heading.blockId) {
      found = pos
      return false
    }
    if (!heading.blockId && text === heading.text && level === heading.level) {
      found = pos
      return false
    }
  })
  if (found == null) return false
  return editor.chain().focus().setTextSelection(found + 1).scrollIntoView().run()
}
