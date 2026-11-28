import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      setFootnote: (attrs: { text: string; id?: string }) => ReturnType
      unsetFootnote: () => ReturnType
    }
  }
}

function fnId(): string {
  return `fn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 同一条注文再次引用时沿用原来的编号，不另计一条。 */
export function matchingFootnote(doc: PmNode, text: string): { id: string; n: number } | null {
  const note = text.trim()
  if (!note) return null
  let found: { id: string; n: number } | null = null
  doc.descendants((node) => {
    if (found || !node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name !== 'footnote' || mark.attrs.place === 'end') continue
      if (String(mark.attrs.text || '').trim() !== note) continue
      const id = String(mark.attrs.id || '')
      if (!id) continue
      found = { id, n: Number(mark.attrs.n || 1) || 1 }
    }
  })
  return found
}

/** 轻量脚注：上标标记，文末面板汇总 */
export const Footnote = Mark.create({
  name: 'footnote',
  excludes: '',
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fn-id'),
        renderHTML: (attrs: { id?: string | null }) =>
          attrs.id ? { 'data-fn-id': attrs.id, id: `ref-${attrs.id}` } : {},
      },
      text: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fn-text') || el.getAttribute('title') || '',
        renderHTML: (attrs: { text?: string }) =>
          attrs.text
            ? { 'data-fn-text': attrs.text, title: attrs.text }
            : {},
      },
      place: {
        default: 'foot',
        parseHTML: (el: HTMLElement) => (el.getAttribute('data-fn-place') === 'end' ? 'end' : 'foot'),
        renderHTML: (attrs: { place?: string }) =>
          attrs.place === 'end' ? { 'data-fn-place': 'end' } : {},
      },
      n: {
        default: 1,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-fn-n') || 1) || 1,
        renderHTML: (attrs: { n?: number }) => ({ 'data-fn-n': String(attrs.n || 1) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-fn-id]' }, { tag: 'span[data-fn-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'rte-footnote', 'data-type': 'footnote' }),
      0,
    ]
  },

  addCommands() {
    return {
      setFootnote:
        (attrs) =>
        ({ commands, state }) => {
          const text = (attrs.text || '').trim()
          if (!text) return false
          const existing = attrs.id ? null : matchingFootnote(state.doc, text)
          const id = attrs.id || existing?.id || fnId()
          // n 由宿主重编号；此处先写 1
          if (state.selection.empty) {
            return commands.insertContent({
              type: 'text',
              text: ' ',
              marks: [{ type: this.name, attrs: { id, text, n: 1 } }],
            })
          }
          return commands.setMark(this.name, { id, text, n: 1 })
        },
      unsetFootnote:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (transactions.some((tr) => tr.getMeta('footnoteRenumber'))) return null
          const seen = new Map<string, string>()
          const hits: Array<{ from: number; to: number; id: string; n: number; place: string; attrs: Record<string, unknown> }> = []
          state.doc.descendants((node, pos) => {
            if (!node.isText) return
            for (const mark of node.marks) {
              if (mark.type.name !== 'footnote') continue
              const id = String(mark.attrs.id || '')
              if (!id) continue
              const place = mark.attrs.place === 'end' ? 'end' : 'foot'
              hits.push({
                from: pos,
                to: pos + node.nodeSize,
                id,
                n: Number(mark.attrs.n || 0),
                place,
                attrs: mark.attrs as Record<string, unknown>,
              })
              if (!seen.has(id)) seen.set(id, place)
            }
          })
          if (!hits.length) return null
          const counters = { foot: 0, end: 0 }
          const expected = new Map<string, number>()
          for (const [id, place] of seen) {
            counters[place === 'end' ? 'end' : 'foot'] += 1
            expected.set(id, counters[place === 'end' ? 'end' : 'foot'])
          }
          if (hits.every((hit) => hit.n === expected.get(hit.id))) return null
          let tr = state.tr
          const type = state.schema.marks.footnote
          if (!type) return null
          for (let i = hits.length - 1; i >= 0; i -= 1) {
            const hit = hits[i]!
            const n = expected.get(hit.id) || 1
            if (hit.n === n) continue
            tr = tr.removeMark(hit.from, hit.to, type)
            tr = tr.addMark(hit.from, hit.to, type.create({ ...hit.attrs, n }))
          }
          if (!tr.docChanged) return null
          tr.setMeta('footnoteRenumber', true)
          return tr
        },
      }),
    ]
  },
})
