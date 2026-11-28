import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { findCrossRef, findCrossRefPos } from '../utils/rteBlockRef'

export { findCrossRef, findCrossRefPos }

export type CrossRefKind = 'heading' | 'figure' | 'table' | 'bookmark'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    crossRef: {
      insertCrossRef: (attrs: {
        kind: CrossRefKind
        targetId: string
        label: string
      }) => ReturnType
    }
  }
}

export type CrossRefTarget = {
  id: string
  kind: CrossRefKind
  label: string
  pos: number
}

/** 收集可交叉引用目标：标题 / 图题注 / 表题注段落 */
export function collectCrossRefTargets(editor: Editor): CrossRefTarget[] {
  const out: CrossRefTarget[] = []
  let fig = 0
  let tbl = 0
  const { doc } = editor.state
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level || 1
      const text = node.textContent.trim() || `标题 ${level}`
      const blockId = String(node.attrs.dataBlockId || '').trim()
      const id = blockId || String(node.attrs.id || `h-${pos}`)
      out.push({ id, kind: 'heading', label: `§ ${text}`, pos })
    }
    if (node.type.name === 'image') {
      fig += 1
      const cap = String(node.attrs.caption || '').trim()
      const blockId = String(node.attrs.dataBlockId || '').trim()
      const id = blockId || String(node.attrs.xrefId || `fig-${pos}`)
      out.push({
        id,
        kind: 'figure',
        label: cap || `图 ${fig}`,
        pos,
      })
    }
    if (node.isText) {
      for (const mark of node.marks) {
        if (mark.type.name !== 'bookmark') continue
        const id = String(mark.attrs.id || '')
        if (!id) continue
        out.push({
          id,
          kind: 'bookmark',
          label: String(mark.attrs.label || node.textContent || '书签').trim() || '书签',
          pos,
        })
      }
    }
    if (node.type.name === 'table') {
      tbl += 1
      const blockId = String(node.attrs.dataBlockId || '').trim()
      const id = blockId || String(node.attrs.xrefId || `tbl-${pos}`)
      out.push({
        id,
        kind: 'table',
        label: String(node.attrs.caption || '').trim() || `表 ${tbl}`,
        pos,
      })
    }
  })
  return out
}

export const CrossRef = Node.create({
  name: 'crossRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'heading' as CrossRefKind,
        parseHTML: (el: HTMLElement) =>
          (el.getAttribute('data-kind') as CrossRefKind) || 'heading',
        renderHTML: (attrs: { kind?: CrossRefKind }) => ({
          'data-kind': attrs.kind || 'heading',
        }),
      },
      targetId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-target') || '',
        renderHTML: (attrs: { targetId?: string }) => ({
          'data-target': attrs.targetId || '',
        }),
      },
      label: {
        default: '引用',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') || el.textContent || '引用',
        renderHTML: (attrs: { label?: string }) => ({
          'data-label': attrs.label || '引用',
        }),
      },
      lost: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-lost') === 'true',
        renderHTML: (attrs: { lost?: boolean }) => (attrs.lost ? { 'data-lost': 'true' } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="cross-ref"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'cross-ref',
        class: node.attrs.lost ? 'rte-cross-ref is-lost' : 'rte-cross-ref',
        contenteditable: 'false',
      }),
      node.attrs.label || '引用',
    ]
  },

  addCommands() {
    return {
      insertCrossRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              kind: attrs.kind,
              targetId: attrs.targetId,
              label: attrs.label || '引用',
            },
          }),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (transactions.some((tr) => tr.getMeta('xrefSync'))) return null
          return syncXrefTransaction(state)
        },
        view(editorView) {
          queueMicrotask(() => {
            if (editorView.isDestroyed) return
            const tr = syncXrefTransaction(editorView.state)
            if (!tr) return
            editorView.dispatch(tr.setMeta('addToHistory', false))
          })
          return {}
        },
      }),
    ]
  },
})

function nextAnchorId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

/** 给标题、图片、表格补稳定编号，并让交叉引用跟着目标文字走；目标没了就标成失锚。 */
export function syncXrefTransaction(state: EditorState): Transaction | null {
  let tr: Transaction = state.tr
  const missing: Array<{ pos: number; name: string }> = []
  tr.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && !node.attrs.id) missing.push({ pos, name: 'heading' })
    if ((node.type.name === 'image' || node.type.name === 'table') && !node.attrs.xrefId) {
      missing.push({ pos, name: node.type.name })
    }
  })
  for (let index = missing.length - 1; index >= 0; index -= 1) {
    const item = missing[index]!
    const node = tr.doc.nodeAt(item.pos)
    if (!node) continue
    if (item.name === 'heading' && !node.attrs.id) {
      tr = tr.setNodeMarkup(item.pos, undefined, { ...node.attrs, id: nextAnchorId('h') })
    } else if (item.name !== 'heading' && !node.attrs.xrefId) {
      tr = tr.setNodeMarkup(item.pos, undefined, {
        ...node.attrs,
        xrefId: nextAnchorId(item.name === 'image' ? 'fig' : 'tbl'),
      })
    }
  }
  const refs: Array<{ pos: number }> = []
  tr.doc.descendants((node, pos) => {
    if (node.type.name === 'crossRef') refs.push({ pos })
  })
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    const pos = refs[index]!.pos
    const node = tr.doc.nodeAt(pos)
    if (!node || node.type.name !== 'crossRef') continue
    const targetId = String(node.attrs.targetId || '')
    const current = String(node.attrs.label || '引用')
    const hit = findCrossRef(tr.doc, targetId, current)
    if (!hit) {
      const lostLabel = current.startsWith('失锚') ? current : `失锚：${current}`
      if (node.attrs.lost && current === lostLabel) continue
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, lost: true, label: lostLabel })
      continue
    }
    const target = tr.doc.nodeAt(hit.pos)
    let nextLabel = current.startsWith('失锚') ? current.replace(/^失锚：/, '') : current
    if (target?.type.name === 'heading') {
      nextLabel = `§ ${target.textContent.trim() || '标题'}`
    }
    const lost = hit.lost || hit.via === 'label'
    if (node.attrs.lost === lost && node.attrs.label === nextLabel) continue
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, lost, label: nextLabel })
  }
  if (!tr.docChanged) return null
  tr.setMeta('xrefSync', true)
  return tr
}
