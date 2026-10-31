import { Extension } from '@tiptap/core'

export type ParagraphAttrsOptions = {
  types: string[]
  indentStepEm: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphAttrs: {
      indent: () => ReturnType
      outdent: () => ReturnType
      setParagraphSpacing: (attrs: {
        marginTop?: string | null
        marginBottom?: string | null
      }) => ReturnType
      unsetParagraphSpacing: () => ReturnType
      setTextIndent: (textIndent: string | null) => ReturnType
      setTextDir: (dir: 'ltr' | 'rtl' | null) => ReturnType
    }
  }
}

function parseIndent(el: HTMLElement): number {
  const raw = el.getAttribute('data-indent') || el.style.paddingLeft || ''
  if (el.getAttribute('data-indent')) {
    const n = parseInt(el.getAttribute('data-indent') || '0', 10)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
  const m = String(raw).match(/([\d.]+)/)
  if (!m) return 0
  const em = parseFloat(m[1])
  return Number.isFinite(em) ? Math.max(0, Math.round(em / 2)) : 0
}

/** 段落缩进 + 段前/段后间距（paragraph / heading） */
export const ParagraphAttrs = Extension.create<ParagraphAttrsOptions>({
  name: 'paragraphAttrs',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      indentStepEm: 2,
    }
  },

  addGlobalAttributes() {
    const step = this.options.indentStepEm
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => parseIndent(element),
            renderHTML: (attributes: { indent?: number }) => {
              const n = attributes.indent || 0
              if (!n) return {}
              return {
                'data-indent': String(n),
                style: `padding-left: ${n * step}em`,
              }
            },
          },
          marginTop: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.style.marginTop ||
              element.getAttribute('data-mt') ||
              null,
            renderHTML: (attributes: { marginTop?: string | null }) => {
              if (!attributes.marginTop) return {}
              return {
                'data-mt': attributes.marginTop,
                style: `margin-top: ${attributes.marginTop}`,
              }
            },
          },
          marginBottom: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.style.marginBottom ||
              element.getAttribute('data-mb') ||
              null,
            renderHTML: (attributes: { marginBottom?: string | null }) => {
              if (!attributes.marginBottom) return {}
              return {
                'data-mb': attributes.marginBottom,
                style: `margin-bottom: ${attributes.marginBottom}`,
              }
            },
          },
          textIndent: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.style.textIndent ||
              element.getAttribute('data-text-indent') ||
              null,
            renderHTML: (attributes: { textIndent?: string | null }) => {
              if (!attributes.textIndent) return {}
              return {
                'data-text-indent': attributes.textIndent,
                style: `text-indent: ${attributes.textIndent}`,
              }
            },
          },
          dir: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const d = element.getAttribute('dir') || element.getAttribute('data-dir')
              return d === 'rtl' || d === 'ltr' ? d : null
            },
            renderHTML: (attributes: { dir?: string | null }) => {
              if (!attributes.dir) return {}
              return { dir: attributes.dir, 'data-dir': attributes.dir }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive('listItem') || editor.isActive('taskItem')) {
            const ok =
              commands.sinkListItem('listItem') || commands.sinkListItem('taskItem')
            if (ok) return true
          }
          const types = this.options.types
          let changed = false
          for (const type of types) {
            if (!editor.isActive(type)) continue
            const cur = Number(editor.getAttributes(type).indent || 0)
            const next = Math.min(8, cur + 1)
            changed = commands.updateAttributes(type, { indent: next }) || changed
          }
          if (changed) return true
          // 默认对当前段落试一次
          const cur = Number(editor.getAttributes('paragraph').indent || 0)
          return commands.updateAttributes('paragraph', {
            indent: Math.min(8, cur + 1),
          })
        },
      outdent:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive('listItem') || editor.isActive('taskItem')) {
            const ok =
              commands.liftListItem('listItem') || commands.liftListItem('taskItem')
            if (ok) return true
          }
          const types = this.options.types
          let changed = false
          for (const type of types) {
            if (!editor.isActive(type)) continue
            const cur = Number(editor.getAttributes(type).indent || 0)
            const next = Math.max(0, cur - 1)
            changed = commands.updateAttributes(type, { indent: next }) || changed
          }
          if (changed) return true
          const cur = Number(editor.getAttributes('paragraph').indent || 0)
          return commands.updateAttributes('paragraph', {
            indent: Math.max(0, cur - 1),
          })
        },
      setParagraphSpacing:
        (attrs) =>
        ({ editor, commands }) => {
          const types = this.options.types
          let ok = false
          for (const type of types) {
            if (!editor.isActive(type) && type !== 'paragraph') continue
            const patch: Record<string, string | null | undefined> = {}
            if ('marginTop' in attrs) patch.marginTop = attrs.marginTop
            if ('marginBottom' in attrs) patch.marginBottom = attrs.marginBottom
            ok = commands.updateAttributes(type, patch) || ok
          }
          if (ok) return true
          return commands.updateAttributes('paragraph', attrs)
        },
      unsetParagraphSpacing:
        () =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', {
            marginTop: null,
            marginBottom: null,
          }),
      setTextIndent:
        (textIndent) =>
        ({ editor, commands }) => {
          const types = this.options.types
          let ok = false
          for (const type of types) {
            if (!editor.isActive(type) && type !== 'paragraph') continue
            ok =
              commands.updateAttributes(type, { textIndent }) || ok
          }
          if (ok) return true
          return commands.updateAttributes('paragraph', { textIndent })
        },
      setTextDir:
        (dir) =>
        ({ editor, commands }) => {
          const types = this.options.types
          let ok = false
          for (const type of types) {
            if (!editor.isActive(type) && type !== 'paragraph') continue
            ok = commands.updateAttributes(type, { dir }) || ok
          }
          if (ok) return true
          return commands.updateAttributes('paragraph', { dir })
        },
    }
  },
})
