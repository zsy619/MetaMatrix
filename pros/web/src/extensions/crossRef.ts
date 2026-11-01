import { Node, mergeAttributes } from '@tiptap/core'
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
})
