import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabsBlock: {
      insertTabsBlock: (titles?: string[]) => ReturnType
    }
  }
}

export const TabPane = Node.create({
  name: 'tabPane',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      title: {
        default: '标签',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '标签',
        renderHTML: (attrs: { title?: string }) => ({
          'data-title': attrs.title || '标签',
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="tab-pane"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'tab-pane',
        class: 'rte-tab-pane',
        'data-title': node.attrs.title || '标签',
      }),
      0,
    ]
  },
})

export const TabsBlock = Node.create({
  name: 'tabsBlock',
  group: 'block',
  content: 'tabPane{2,6}',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      active: {
        default: 0,
        parseHTML: (el: HTMLElement) => {
          const n = parseInt(el.getAttribute('data-active') || '0', 10)
          return Number.isFinite(n) ? Math.max(0, n) : 0
        },
        renderHTML: (attrs: { active?: number }) => ({
          'data-active': String(attrs.active ?? 0),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tabs-block"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const titles: string[] = []
    node.forEach((child) => {
      if (child.type.name === 'tabPane') titles.push(child.attrs.title || '标签')
    })
    const active = Math.min(Math.max(0, node.attrs.active ?? 0), Math.max(0, titles.length - 1))
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'tabs-block',
        class: 'rte-tabs-block',
        'data-active': String(active),
      }),
      [
        'div',
        { class: 'rte-tabs-bar', contenteditable: 'false' },
        ...titles.map((t, i) => [
          'span',
          {
            class: `rte-tabs-tab${i === active ? ' is-active' : ''}`,
            'data-tab-index': String(i),
          },
          t,
        ]),
      ],
      ['div', { class: 'rte-tabs-body' }, 0],
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('div')
      dom.className = 'rte-tabs-block'
      dom.dataset.type = 'tabs-block'

      const bar = document.createElement('div')
      bar.className = 'rte-tabs-bar'
      bar.contentEditable = 'false'

      const body = document.createElement('div')
      body.className = 'rte-tabs-body'

      const syncBar = () => {
        bar.innerHTML = ''
        const titles: string[] = []
        current.forEach((child) => {
          if (child.type.name === 'tabPane') titles.push(child.attrs.title || '标签')
        })
        const active = Math.min(
          Math.max(0, current.attrs.active ?? 0),
          Math.max(0, titles.length - 1),
        )
        dom.dataset.active = String(active)
        titles.forEach((t, i) => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = `rte-tabs-tab${i === active ? ' is-active' : ''}`
          btn.textContent = t
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const pos = typeof getPos === 'function' ? getPos() : null
            if (pos == null || !editor) return
            editor
              .chain()
              .command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...current.attrs, active: i })
                return true
              })
              .run()
          })
          bar.appendChild(btn)
        })
        // show only active pane via CSS class on body children — handled by update
        Array.from(body.children).forEach((el, i) => {
          ;(el as HTMLElement).style.display = i === active ? '' : 'none'
        })
      }

      dom.appendChild(bar)
      dom.appendChild(body)
      syncBar()

      return {
        dom,
        contentDOM: body,
        update(updated) {
          if (updated.type.name !== 'tabsBlock') return false
          current = updated
          syncBar()
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertTabsBlock:
        (titles) =>
        ({ commands }) => {
          const list =
            titles && titles.length >= 2
              ? titles.slice(0, 6)
              : ['概览', '细节', '附录']
          return commands.insertContent({
            type: this.name,
            attrs: { active: 0 },
            content: list.map((title) => ({
              type: 'tabPane',
              attrs: { title },
              content: [{ type: 'paragraph' }],
            })),
          })
        },
    }
  },
})
