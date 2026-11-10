import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { findCrossRefPos } from '../utils/rteBlockRef'

export { findCrossRefPos }

export type CrossRefKind = 'heading' | 'figure' | 'table'

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
      const id = String(node.attrs.id || `h-${pos}`)
      out.push({ id, kind: 'heading', label: `§ ${text}`, pos })
    }
    if (node.type.name === 'image') {
      fig += 1
      const cap = String(node.attrs.caption || '').trim()
      const id = String(node.attrs.xrefId || `fig-${pos}`)
      out.push({
        id,
        kind: 'figure',
        label: cap || `图 ${fig}`,
        pos,
      })
    }
    if (node.type.name === 'table') {
      tbl += 1
      const id = String(node.attrs.xrefId || `tbl-${pos}`)
      out.push({ id, kind: 'table', label: `表 ${tbl}`, pos })
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
        class: 'rte-cross-ref',
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
          const labels = new Map<string, string>()
          let fig = 0
          let tbl = 0
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
              labels.set(String(node.attrs.id || `h-${pos}`), `§ ${node.textContent.trim() || '标题'}`)
            }
            if (node.type.name === 'image') {
              fig += 1
              labels.set(String(node.attrs.xrefId || `fig-${pos}`), String(node.attrs.caption || '').trim() || `图 ${fig}`)
            }
            if (node.type.name === 'table') {
              tbl += 1
              labels.set(String(node.attrs.xrefId || `tbl-${pos}`), `表 ${tbl}`)
            }
          })
          let tr = state.tr
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'crossRef') return
            const next = labels.get(String(node.attrs.targetId || ''))
            if (!next || next === node.attrs.label) return
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: next })
          })
          if (!tr.docChanged) return null
          tr.setMeta('xrefSync', true)
          return tr
        },
      }),
    ]
  },
})
