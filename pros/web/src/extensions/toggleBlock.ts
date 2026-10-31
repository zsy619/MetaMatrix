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
      summary.contentEditable = 'false'
      summary.textContent = current.attrs.summary || '折叠标题'
      summary.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null) return
        const open = current.attrs.open === false
        editor.commands.command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, open })
          return true
        })
      })

      const body = document.createElement('div')
      body.className = 'rte-toggle-body'
      if (current.attrs.open === false) body.style.display = 'none'

      dom.appendChild(summary)
      dom.appendChild(body)

      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type.name !== 'toggleBlock') return false
          current = updated
          summary.textContent = updated.attrs.summary || '折叠标题'
          dom.dataset.summary = updated.attrs.summary || '折叠标题'
          const open = updated.attrs.open !== false
          dom.classList.toggle('is-open', open)
          dom.dataset.open = open ? 'true' : 'false'
          body.style.display = open ? '' : 'none'
          return true
        },
      }
    }
  },
})
