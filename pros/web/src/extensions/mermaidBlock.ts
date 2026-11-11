import { Node, mergeAttributes } from '@tiptap/core'
import { ElMessageBox } from 'element-plus'
import {
  MERMAID_FLOW_LR,
  addFlowStep,
  cycleFlowShape,
  isFlowChain,
  parseFlow,
  removeFlowNode,
  serializeFlow,
  setFlowDir,
  setFlowEdgeLabel,
  setFlowText,
  type FlowDir,
  type FlowModel,
  type FlowShape,
} from './mermaidFlow'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaidBlock: {
      insertMermaidBlock: (code?: string) => ReturnType
    }
  }
}

const DEFAULT_MERMAID = MERMAID_FLOW_LR
const SHAPE_LABEL: Record<FlowShape, string> = { rect: '方', round: '圆', diamond: '菱' }

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
      let sourceEditing = false
      let stepsOpen = parseFlow(node.attrs.code || DEFAULT_MERMAID) != null
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
      label.textContent = '流程图'
      leading.append(more, label)
      const actions = document.createElement('div')
      actions.className = 'rte-mermaid-actions'
      const stepsBtn = document.createElement('button')
      stepsBtn.type = 'button'
      stepsBtn.className = 'rte-mermaid-action'
      stepsBtn.textContent = '编辑步骤'
      const sourceBtn = document.createElement('button')
      sourceBtn.type = 'button'
      sourceBtn.className = 'rte-mermaid-action'
      sourceBtn.textContent = '源码'
      actions.append(stepsBtn, sourceBtn)
      toolbar.append(leading, actions)

      const steps = document.createElement('div')
      steps.className = 'rte-mermaid-steps'
      steps.contentEditable = 'false'

      const preview = document.createElement('div')
      preview.className = 'rte-mermaid-preview'
      const source = document.createElement('textarea')
      source.className = 'rte-mermaid-source'
      source.style.display = 'none'
      source.value = current.attrs.code || DEFAULT_MERMAID
      source.setAttribute('aria-label', '流程图源码')

      let renderTimer = 0
      const scheduleRender = () => {
        window.clearTimeout(renderTimer)
        renderTimer = window.setTimeout(() => {
          void render()
        }, 160)
      }
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
      const onDocKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeMenu()
      }
      document.addEventListener('mousedown', onDocPointer, true)
      document.addEventListener('keydown', onDocKey)

      const posOf = () => (typeof getPos === 'function' ? getPos() : null)
      const write = (model: FlowModel) => {
        const pos = posOf()
        if (pos == null || !editor) return
        const live = editor.state.doc.nodeAt(pos)
        if (!live) return
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...live.attrs, code: serializeFlow(model) }),
        )
      }

      const render = async () => {
        const code = current.attrs.code || DEFAULT_MERMAID
        dom.dataset.code = code
        if (document.activeElement !== source) source.value = code
        try {
          const mod = await loadMermaid()
          const id = `rte-mmd-${Math.random().toString(36).slice(2, 9)}`
          const { svg } = await mod.default.render(id, code)
          preview.innerHTML = svg
        } catch (err) {
          preview.innerHTML = `<pre class="rte-mermaid-error">${String((err as Error)?.message || err)}</pre>`
        }
      }

      const button = (text: string, title: string, act: () => void) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.textContent = text
        el.title = title
        el.addEventListener('mousedown', (event) => event.preventDefault())
        el.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          act()
        })
        return el
      }

      const paintSteps = () => {
        const model = parseFlow(current.attrs.code || '')
        stepsBtn.disabled = !model
        stepsBtn.title = model ? '改步骤名称、加减步骤' : '这张图较复杂，请用源码编辑'
        steps.replaceChildren()
        if (!model || !stepsOpen || sourceEditing) {
          steps.hidden = true
          stepsBtn.classList.remove('is-on')
          return
        }
        steps.hidden = false
        stepsBtn.classList.add('is-on')
        const bar = document.createElement('div')
        bar.className = 'rte-mermaid-steps-bar'
        const dirGroup = document.createElement('div')
        dirGroup.className = 'rte-mermaid-dir'
        for (const dir of ['LR', 'TD'] as FlowDir[]) {
          const dirBtn = button(dir === 'LR' ? '横向' : '纵向', dir === 'LR' ? '从左到右' : '从上到下', () => {
            write(setFlowDir(model, dir))
          })
          dirBtn.classList.toggle('is-on', model.dir === dir)
          dirGroup.append(dirBtn)
        }
        bar.append(dirGroup, button('加一步', '在末尾加一个步骤', () => write(addFlowStep(model))))
        steps.append(bar)

        const row = document.createElement('div')
        row.className = 'rte-mermaid-step-row'
        model.nodes.forEach((node, index) => {
          if (index > 0 && isFlowChain(model)) {
            const arrow = document.createElement('span')
            arrow.className = 'rte-mermaid-arrow'
            arrow.textContent = '→'
            row.append(arrow)
          }
          const item = document.createElement('label')
          item.className = 'rte-mermaid-step'
          const shape = button(SHAPE_LABEL[node.shape], '切换方框、圆角或菱形', () => write(cycleFlowShape(model, node.id)))
          shape.className = 'rte-mermaid-shape'
          const input = document.createElement('input')
          input.value = node.text
          input.setAttribute('aria-label', `步骤 ${node.text || node.id}`)
          input.addEventListener('mousedown', (event) => event.stopPropagation())
          input.addEventListener('input', () => {
            const live = parseFlow(current.attrs.code || '')
            if (live) write(setFlowText(live, node.id, input.value))
          })
          item.append(shape, input)
          if (model.nodes.length > 1) {
            const remove = button('×', '删除这一步', () => write(removeFlowNode(model, node.id)))
            remove.className = 'rte-mermaid-step-remove'
            remove.setAttribute('aria-label', `删除${node.text || '这一步'}`)
            item.append(remove)
          }
          row.append(item)
        })
        steps.append(row)

        if (!isFlowChain(model) && model.edges.length) {
          const links = document.createElement('div')
          links.className = 'rte-mermaid-links'
          model.edges.forEach((edge, index) => {
            const from = model.nodes.find((item) => item.id === edge.from)
            const to = model.nodes.find((item) => item.id === edge.to)
            const line = document.createElement('label')
            line.className = 'rte-mermaid-link'
            const name = document.createElement('span')
            name.textContent = `${from?.text || edge.from} → ${to?.text || edge.to}`
            const input = document.createElement('input')
            input.value = edge.label
            input.placeholder = '连线文字'
            input.setAttribute('aria-label', `${from?.text || edge.from}到${to?.text || edge.to}的连线文字`)
            input.addEventListener('mousedown', (event) => event.stopPropagation())
            input.addEventListener('input', () => {
              const live = parseFlow(current.attrs.code || '')
              if (live) write(setFlowEdgeLabel(live, index, input.value))
            })
            line.append(name, input)
            links.append(line)
          })
          steps.append(links)
        }
      }

      const syncChrome = () => {
        source.style.display = sourceEditing ? 'block' : 'none'
        preview.style.display = sourceEditing ? 'none' : 'block'
        sourceBtn.textContent = sourceEditing ? '完成' : '源码'
        sourceBtn.classList.toggle('is-on', sourceEditing)
        paintSteps()
      }

      stepsBtn.addEventListener('mousedown', (event) => event.preventDefault())
      stepsBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!parseFlow(current.attrs.code || '')) return
        sourceEditing = false
        stepsOpen = !stepsOpen
        syncChrome()
      })
      sourceBtn.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      sourceBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (sourceEditing) {
          const pos = posOf()
          if (pos != null && editor) {
            const live = editor.state.doc.nodeAt(pos)
            if (live) {
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(pos, undefined, { ...live.attrs, code: source.value }),
              )
            }
          }
          sourceEditing = false
          stepsOpen = parseFlow(source.value) != null
        } else {
          sourceEditing = true
          stepsOpen = false
          source.value = current.attrs.code || DEFAULT_MERMAID
        }
        syncChrome()
      })

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
        addItem('复制', false, () => {
          const pos = posOf()
          if (pos == null || !editor) return
          const live = editor.state.doc.nodeAt(pos)
          if (!live) return
          editor.chain().focus().insertContentAt(pos + live.nodeSize, { type: 'mermaidBlock', attrs: { code: live.attrs.code } }).run()
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
        const live = editor.state.doc.nodeAt(pos)
        if (!live) return
        editor.view.dispatch(editor.state.tr.delete(pos, pos + live.nodeSize))
        editor.view.focus()
      }

      dom.append(toolbar, steps, preview, source)
      syncChrome()
      void render()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mermaidBlock') return false
          current = updated
          if (!sourceEditing) scheduleRender()
          const active = document.activeElement
          if (!(active instanceof HTMLInputElement) || !steps.contains(active)) paintSteps()
          return true
        },
        ignoreMutation: () => true,
        stopEvent(event) {
          const target = event.target
          if (!(target instanceof globalThis.Node)) return false
          return toolbar.contains(target) || steps.contains(target) || source.contains(target)
        },
        destroy() {
          window.clearTimeout(renderTimer)
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
