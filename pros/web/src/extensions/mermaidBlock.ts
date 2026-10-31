import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaidBlock: {
      insertMermaidBlock: (code?: string) => ReturnType
    }
  }
}

const DEFAULT_MERMAID = `flowchart LR
  A[开始] --> B[处理]
  B --> C[结束]`

let mermaidLoader: Promise<typeof import('mermaid')> | null = null
function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then(async (m) => {
      const mermaid = m.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
      })
      return m
    })
  }
  return mermaidLoader
}

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: DEFAULT_MERMAID,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-code') || el.querySelector('pre')?.textContent || DEFAULT_MERMAID,
        renderHTML: (attrs: { code?: string }) => ({
          'data-code': attrs.code || DEFAULT_MERMAID,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const code = node.attrs.code || DEFAULT_MERMAID
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'mermaid-block',
        class: 'rte-mermaid-block',
        'data-code': code,
      }),
      ['pre', { class: 'rte-mermaid-code' }, code],
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('div')
      dom.className = 'rte-mermaid-block'
      dom.dataset.type = 'mermaid-block'

      const toolbar = document.createElement('div')
      toolbar.className = 'rte-mermaid-toolbar'
      toolbar.contentEditable = 'false'
      const label = document.createElement('span')
      label.textContent = 'Mermaid 流程图'
      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.textContent = '编辑源码'
      toolbar.appendChild(label)
      toolbar.appendChild(editBtn)

      const preview = document.createElement('div')
      preview.className = 'rte-mermaid-preview'

      const source = document.createElement('textarea')
      source.className = 'rte-mermaid-source'
      source.style.display = 'none'
      source.value = current.attrs.code || DEFAULT_MERMAID

      let editing = false
      const render = async () => {
        const code = current.attrs.code || DEFAULT_MERMAID
        dom.dataset.code = code
        source.value = code
        try {
          const mod = await loadMermaid()
          const id = `rte-mmd-${Math.random().toString(36).slice(2, 9)}`
          const { svg } = await mod.default.render(id, code)
          preview.innerHTML = svg
        } catch (err) {
          preview.innerHTML = `<pre class="rte-mermaid-error">${String(
            (err as Error)?.message || err,
          )}</pre>`
        }
      }

      editBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        editing = !editing
        source.style.display = editing ? 'block' : 'none'
        preview.style.display = editing ? 'none' : 'block'
        editBtn.textContent = editing ? '完成' : '编辑源码'
        if (!editing) {
          const code = source.value
          const pos = typeof getPos === 'function' ? getPos() : null
          if (pos != null && editor) {
            editor
              .chain()
              .command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...current.attrs, code })
                return true
              })
              .run()
          }
        }
      })

      dom.appendChild(toolbar)
      dom.appendChild(preview)
      dom.appendChild(source)
      void render()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mermaidBlock') return false
          current = updated
          if (!editing) void render()
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },

  addCommands() {
    return {
      insertMermaidBlock:
        (code) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { code: (code || DEFAULT_MERMAID).trim() || DEFAULT_MERMAID },
          }),
    }
  },
})
