import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggleBlock: {
      insertToggleBlock: (attrs?: { summary?: string }) => ReturnType
      setToggleOpen: (open: boolean) => ReturnType
    }
  }
}

/** Notion 式折叠块（div 实现，避免 details 与 PM 内容孔冲突） */
export const ToggleBlock = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      summary: {
        default: '折叠标题',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-summary') || '折叠标题',
        renderHTML: (attrs: { summary?: string }) => ({
          'data-summary': attrs.summary || '折叠标题',
        }),
      },
      open: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs: { open?: boolean }) => ({
          'data-open': attrs.open === false ? 'false' : 'true',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-block"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const summary = node.attrs.summary || '折叠标题'
    const open = node.attrs.open !== false
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle-block',
        class: `rte-toggle-block${open ? ' is-open' : ''}`,
      }),
      [
        'div',
        {
          class: 'rte-toggle-summary',
          contenteditable: 'false',
        },
        summary,
      ],
      ['div', { class: 'rte-toggle-body' }, 0],
    ]
  },

  addCommands() {
    return {
      insertToggleBlock:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { summary: attrs.summary || '折叠标题', open: true },
            content: [{ type: 'paragraph' }],
          }),
      setToggleOpen:
        (open: boolean) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { open }),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        if (!this.editor.isActive(this.name)) return false
        const open = this.editor.getAttributes(this.name).open !== false
        return this.editor.commands.setToggleOpen(!open)
      },
    }
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('div')
      dom.className = `rte-toggle-block${current.attrs.open !== false ? ' is-open' : ''}`
      dom.dataset.type = 'toggle-block'
      dom.dataset.summary = current.attrs.summary || '折叠标题'
      dom.dataset.open = current.attrs.open === false ? 'false' : 'true'

      const summary = document.createElement('div')
      summary.className = 'rte-toggle-summary'

      const caret = document.createElement('button')
      caret.type = 'button'
      caret.className = 'rte-toggle-caret'
      caret.tabIndex = 0

      const label = document.createElement('span')
      label.className = 'rte-toggle-label'
      label.contentEditable = 'true'
      label.spellcheck = false
      label.setAttribute('role', 'textbox')
      label.setAttribute('aria-label', '折叠标题')
      label.textContent = current.attrs.summary || '折叠标题'

      const syncCaret = () => {
        const open = current.attrs.open !== false
        caret.setAttribute('aria-expanded', open ? 'true' : 'false')
        caret.setAttribute('aria-label', open ? '折叠' : '展开')
      }
      syncCaret()

      const toggle = () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null) return
        const open = current.attrs.open === false
        editor.commands.command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, open })
          return true
        })
      }

      caret.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      caret.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle()
      })
      caret.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        toggle()
      })

      const commitLabel = () => {
        const text = (label.textContent || '').trim() || '折叠标题'
        if (text === (current.attrs.summary || '折叠标题')) {
          label.textContent = text
          return
        }
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null) return
        editor.commands.command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, summary: text })
          return true
        })
      }
      label.addEventListener('mousedown', (event) => event.stopPropagation())
      label.addEventListener('keydown', (event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          label.blur()
        }
      })
      label.addEventListener('blur', commitLabel)

      summary.append(caret, label)

      const body = document.createElement('div')
      body.className = 'rte-toggle-body'
      if (current.attrs.open === false) body.style.display = 'none'

      dom.appendChild(summary)
      dom.appendChild(body)

      return {
        dom,
        contentDOM: body,
        stopEvent: (event) => {
          const target = event.target
          return target instanceof globalThis.Node && summary.contains(target)
        },
        ignoreMutation: (mutation) => summary.contains(mutation.target as globalThis.Node),
        update: (updated) => {
          if (updated.type.name !== 'toggleBlock') return false
          current = updated
          dom.dataset.summary = updated.attrs.summary || '折叠标题'
          const open = updated.attrs.open !== false
          dom.classList.toggle('is-open', open)
          dom.dataset.open = open ? 'true' : 'false'
          body.style.display = open ? '' : 'none'
          syncCaret()
          if (document.activeElement !== label) {
            label.textContent = updated.attrs.summary || '折叠标题'
          }
          return true
        },
      }
    }
  },
})
