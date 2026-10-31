/**
 * 第 20 波企业能力：与 RichTextEditor 解耦的纯逻辑 / 常量
 */
import type { Editor } from '@tiptap/core'
import QRCode from 'qrcode'
import { htmlToMarkdown } from '../utils/rteExportMd'
import { transformCaseText, type CaseMode } from '../utils/rteCaseTransform'
import { renumberCaptions } from '../utils/rteCaptionNumber'
import {
  sortTableByColumn,
  upsertTableSumRow,
  currentTableColIndex,
} from '../utils/rteTableExtras'
import { TextSelection } from '@tiptap/pm/state'

export { transformCaseText, renumberCaptions, sortTableByColumn, upsertTableSumRow, currentTableColIndex }
export type { CaseMode }

export const RTE_ZOOM_PRESETS = [
  { label: '75%', value: 0.75 },
  { label: '90%', value: 0.9 },
  { label: '100%', value: 1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
] as const

export const CELL_VALIGN_OPTIONS = [
  { label: '顶端', value: 'top' },
  { label: '居中', value: 'middle' },
  { label: '底端', value: 'bottom' },
] as const

export function applyCaseToSelection(editor: Editor, mode: CaseMode): boolean {
  const { from, to, empty } = editor.state.selection
  if (empty) return false
  let tr = editor.state.tr
  const jobs: Array<{ from: number; to: number; text: string }> = []
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (start >= end) return
    const slice = node.text.slice(start - pos, end - pos)
    const next = transformCaseText(slice, mode)
    if (next !== slice) jobs.push({ from: start, to: end, text: next })
  })
  for (let i = jobs.length - 1; i >= 0; i--) {
    const j = jobs[i]!
    tr = tr.insertText(j.text, j.from, j.to)
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    return true
  }
  return false
}

export async function copySelectionOrDocAsMarkdown(editor: Editor): Promise<string> {
  const { from, to, empty } = editor.state.selection
  let html: string
  if (!empty) {
    try {
      const slice = editor.state.doc.slice(from, to)
      const div = document.createElement('div')
      const { DOMSerializer } = await import('@tiptap/pm/model')
      const serializer = DOMSerializer.fromSchema(editor.schema)
      div.appendChild(serializer.serializeFragment(slice.content))
      html = div.innerHTML || `<p>${editor.state.doc.textBetween(from, to, '\n')}</p>`
    } catch {
      html = `<p>${editor.state.doc.textBetween(from, to, '\n')}</p>`
    }
  } else {
    html = editor.getHTML()
  }
  return htmlToMarkdown(html)
}

export async function makeQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 256, errorCorrectionLevel: 'M' })
}

export function speakText(text: string, lang = 'zh-CN'): boolean {
  const t = (text || '').trim()
  if (!t || typeof window === 'undefined' || !window.speechSynthesis) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(t.slice(0, 4000))
  u.lang = lang
  window.speechSynthesis.speak(u)
  return true
}

export function stopSpeak(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

export type FootnoteItem = { id: string; text: string; n: number; from: number }

export function collectFootnotes(editor: Editor): FootnoteItem[] {
  const out: FootnoteItem[] = []
  const seen = new Set<string>()
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const m of node.marks) {
      if (m.type.name !== 'footnote') continue
      const id = String(m.attrs.id || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        text: String(m.attrs.text || ''),
        n: Number(m.attrs.n || out.length + 1),
        from: pos,
      })
    }
  })
  out.sort((a, b) => a.from - b.from)
  out.forEach((x, i) => {
    x.n = i + 1
  })
  return out
}

/** 按文档顺序重写脚注编号 attrs */
export function renumberFootnotes(editor: Editor): number {
  const items = collectFootnotes(editor)
  if (!items.length) return 0
  let tr = editor.state.tr
  const idToN = new Map(items.map((x) => [x.id, x.n]))
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const m of node.marks) {
      if (m.type.name !== 'footnote') continue
      const id = String(m.attrs.id || '')
      const n = idToN.get(id)
      if (n == null || m.attrs.n === n) continue
      const from = pos
      const to = pos + node.nodeSize
      tr = tr.removeMark(from, to, m.type)
      tr = tr.addMark(from, to, m.type.create({ ...m.attrs, n }))
    }
  })
  if (tr.docChanged) editor.view.dispatch(tr)
  return items.length
}

export function jumpToPos(editor: Editor, pos: number): void {
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size))
  const tr = editor.state.tr.setSelection(TextSelection.near($pos)).scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
}

export function setCellVerticalAlign(editor: Editor, verticalAlign: string | null): boolean {
  return editor
    .chain()
    .focus()
    .updateAttributes('tableCell', { verticalAlign })
    .updateAttributes('tableHeader', { verticalAlign })
    .run()
}
