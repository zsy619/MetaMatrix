import { Node, mergeAttributes } from '@tiptap/core'
import { ElMessageBox } from 'element-plus'

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
      const leading = document.createElement('div')
      leading.className = 'rte-mermaid-leading'
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'rte-mermaid-more'
      more.textContent = '…'
      more.title = '流程图操作'
      more.setAttribute('aria-label', '流程图操作')
      more.setAttribute('aria-haspopup', 'menu')
      const label = document.createElement('span')
      label.textContent = 'Mermaid 流程图'
      leading.append(more, label)
      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.textContent = '编辑源码'
      toolbar.append(leading, editBtn)

      let menu: HTMLDivElement | null = null
      const closeMenu = () => {
        menu?.remove()
        menu = null
      }
      const onDocPointer = (event: Event) => {
        if (!menu) return
        const target = event.target
        if (target instanceof globalThis.Node && (menu.contains(target) || more.contains(target))) return
        closeMenu()
      }
      document.addEventListener('mousedown', onDocPointer, true)
      const onDocKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeMenu()
      }
      document.addEventListener('keydown', onDocKey)

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

      const posOf = () => (typeof getPos === 'function' ? getPos() : null)

      more.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      more.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!editor?.isEditable) return
        if (menu) {
          closeMenu()
          return
        }
        const panel = document.createElement('div')
        panel.className = 'rte-tabs-menu'
        panel.setAttribute('role', 'menu')
        const addItem = (text: string, danger: boolean, act: () => void) => {
          const item = document.createElement('button')
          item.type = 'button'
          item.className = `rte-tabs-menu-item${danger ? ' is-danger' : ''}`
          item.setAttribute('role', 'menuitem')
          item.textContent = text
          item.addEventListener('mousedown', (ev) => {
            ev.preventDefault()
            ev.stopPropagation()
          })
          item.addEventListener('click', (ev) => {
            ev.preventDefault()
            ev.stopPropagation()
            closeMenu()
            act()
          })
          panel.append(item)
        }
        addItem('添加', false, () => {
          const pos = posOf()
          if (pos == null || !editor) return
          const node = editor.state.doc.nodeAt(pos)
          if (!node) return
          editor
            .chain()
            .focus()
            .insertContentAt(pos + node.nodeSize, {
              type: 'mermaidBlock',
              attrs: { code: DEFAULT_MERMAID },
            })
            .run()
        })
        addItem('删除', true, () => {
          void confirmDelete()
        })
        document.body.append(panel)
        const rect = more.getBoundingClientRect()
        const width = panel.offsetWidth || 132
        const height = panel.offsetHeight || 80
        let left = rect.left
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
        let top = rect.bottom + 4
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4)
        panel.style.left = `${left}px`
        panel.style.top = `${top}px`
        menu = panel
      })

      const confirmDelete = async () => {
        try {
          await ElMessageBox.confirm('删除后，这个流程图会从文档里去掉。', '删除流程图', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
            appendTo: 'body',
            modalClass: 'rte-tabs-delete-confirm',
          })
        } catch {
          return
        }
        const pos = posOf()
        if (pos == null || !editor) return
        const node = editor.state.doc.nodeAt(pos)
        if (!node) return
        editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
        editor.view.focus()
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
        stopEvent(event) {
          return toolbar.contains(event.target as globalThis.Node)
        },
        destroy() {
          closeMenu()
          document.removeEventListener('mousedown', onDocPointer, true)
          document.removeEventListener('keydown', onDocKey)
        },
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
