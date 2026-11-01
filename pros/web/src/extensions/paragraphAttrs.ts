import { Extension } from '@tiptap/core'
import { countNodeName, nextIndentLevel, tabAction } from '../utils/rteRound7'

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
            const next = nextIndentLevel(cur, 1)
            changed = commands.updateAttributes(type, { indent: next }) || changed
          }
          if (changed) return true
          // 默认对当前段落试一次
          const cur = Number(editor.getAttributes('paragraph').indent || 0)
          return commands.updateAttributes('paragraph', {
            indent: nextIndentLevel(cur, 1),
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
            const next = nextIndentLevel(cur, -1)
            changed = commands.updateAttributes(type, { indent: next }) || changed
          }
          if (changed) return true
          const cur = Number(editor.getAttributes('paragraph').indent || 0)
          return commands.updateAttributes('paragraph', {
            indent: nextIndentLevel(cur, -1),
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

  addKeyboardShortcuts() {
    const run = (shift: boolean) => () => {
      const editor = this.editor
      if (!editor.isEditable) return false
      const names: string[] = []
      const $from = editor.state.selection.$from
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        names.push($from.node(depth).type.name)
      }
      const inHeading = editor.isActive('heading')
      const paragraphIndent = Number(
        (inHeading ? editor.getAttributes('heading') : editor.getAttributes('paragraph')).indent ||
          0,
      )
      const action = tabAction({
        inTable: editor.isActive('table'),
        inCode: editor.isActive('codeBlock'),
        inList: editor.isActive('listItem') || editor.isActive('taskItem'),
        inQuote: editor.isActive('blockquote'),
        quoteDepth: countNodeName(names, 'blockquote'),
        paragraphIndent,
        shift,
      })
      if (action === 'pass') return false
      if (action === 'list-sink') {
        return (
          editor.commands.sinkListItem('taskItem') ||
          editor.commands.sinkListItem('listItem') ||
          editor.commands.indent()
        )
      }
      if (action === 'list-lift') {
        return (
          editor.commands.liftListItem('taskItem') ||
          editor.commands.liftListItem('listItem') ||
          editor.commands.outdent()
        )
      }
      if (action === 'quote-nest') {
        return editor.commands.wrapIn('blockquote') || editor.commands.indent()
      }
      if (action === 'quote-lift') {
        return editor.commands.lift('blockquote') || editor.commands.outdent()
      }
      return shift ? editor.commands.outdent() : editor.commands.indent()
    }
    return {
      Tab: run(false),
      'Shift-Tab': run(true),
    }
  },
})
