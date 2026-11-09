import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabsBlock: {
      insertTabsBlock: (titles?: string[]) => ReturnType
    }
  }
}

/** 一组标签最少 1 个、最多 12 个。 */
export const TABS_MIN = 1
export const TABS_MAX = 12

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

function clampIndex(index: number, count: number) {
  if (count <= 0) return 0
  return Math.min(Math.max(0, index), count - 1)
}

/** 第 index 个子标签在文档中的位置。index 等于个数时返回末尾插入点。 */
export function tabPanePos(blockPos: number, block: PmNode, index: number): number {
  let pos = blockPos + 1
  const last = Math.min(index, block.childCount)
  for (let i = 0; i < last; i += 1) pos += block.child(i).nodeSize
  return pos
}

function focusPane(tr: Transaction, blockPos: number, index: number) {
  const block = tr.doc.nodeAt(blockPos)
  if (!block) return
  const panePos = tabPanePos(blockPos, block, index)
  const $pos = tr.doc.resolve(Math.min(panePos + 1, tr.doc.content.size))
  tr.setSelection(TextSelection.near($pos))
}

function nextTabTitle(block: PmNode): string {
  const titles = new Set<string>()
  block.forEach((child) => {
    if (child.type.name === 'tabPane') titles.add(String(child.attrs.title || ''))
  })
  if (!titles.has('新标签')) return '新标签'
  let n = 2
  while (titles.has(`新标签${n}`)) n += 1
  return `新标签${n}`
}

export function setActiveTab(tr: Transaction, blockPos: number, index: number): boolean {
  const block = tr.doc.nodeAt(blockPos)
  if (!block || block.type.name !== 'tabsBlock' || block.childCount === 0) return false
  const active = clampIndex(index, block.childCount)
  tr.setNodeMarkup(blockPos, undefined, { ...block.attrs, active })
  focusPane(tr, blockPos, active)
  return true
}

export function addTabPane(tr: Transaction, blockPos: number, title?: string): boolean {
  const block = tr.doc.nodeAt(blockPos)
  if (!block || block.type.name !== 'tabsBlock' || block.childCount >= TABS_MAX) return false
  const name = (title ?? nextTabTitle(block)).trim().slice(0, 40) || '新标签'
  const pane = block.type.schema.nodes.tabPane.create(
    { title: name },
    block.type.schema.nodes.paragraph.create(),
  )
  tr.insert(blockPos + block.nodeSize - 1, pane)
  const mapped = tr.mapping.map(blockPos)
  const updated = tr.doc.nodeAt(mapped)
  if (!updated) return true
  const active = updated.childCount - 1
  tr.setNodeMarkup(mapped, undefined, { ...updated.attrs, active })
  focusPane(tr, mapped, active)
  return true
}

export function removeTabPane(tr: Transaction, blockPos: number, index: number): boolean {
  const block = tr.doc.nodeAt(blockPos)
  if (!block || block.type.name !== 'tabsBlock') return false
  if (index < 0 || index >= block.childCount) return false
  if (block.childCount <= TABS_MIN) {
    tr.delete(blockPos, blockPos + block.nodeSize)
    return true
  }
  const from = tabPanePos(blockPos, block, index)
  const child = block.child(index)
  tr.delete(from, from + child.nodeSize)
  const mapped = tr.mapping.map(blockPos)
  const updated = tr.doc.nodeAt(mapped)
  if (!updated) return true
  let active = Number(block.attrs.active ?? 0)
  if (index < active) active -= 1
  else if (index === active) active = Math.min(active, updated.childCount - 1)
  active = clampIndex(active, updated.childCount)
  tr.setNodeMarkup(mapped, undefined, { ...updated.attrs, active })
  focusPane(tr, mapped, active)
  return true
}

export function moveTabPane(tr: Transaction, blockPos: number, fromIndex: number, toIndex: number): boolean {
  const block = tr.doc.nodeAt(blockPos)
  if (!block || block.type.name !== 'tabsBlock') return false
  if (fromIndex === toIndex) return false
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= block.childCount || toIndex >= block.childCount) return false
  const child = block.child(fromIndex)
  const from = tabPanePos(blockPos, block, fromIndex)
  tr.delete(from, from + child.nodeSize)
  const mapped = tr.mapping.map(blockPos)
  const after = tr.doc.nodeAt(mapped)
  if (!after) return true
  const dest = tabPanePos(mapped, after, toIndex)
  tr.insert(dest, child)
  const placed = tr.mapping.map(mapped)
  const updated = tr.doc.nodeAt(placed)
  if (!updated) return true
  tr.setNodeMarkup(placed, undefined, { ...updated.attrs, active: toIndex })
  focusPane(tr, placed, toIndex)
  return true
}

export function renameTabPane(tr: Transaction, blockPos: number, index: number, title: string): boolean {
  const block = tr.doc.nodeAt(blockPos)
  if (!block || block.type.name !== 'tabsBlock') return false
  if (index < 0 || index >= block.childCount) return false
  const child = block.child(index)
  const name = title.trim().slice(0, 40) || '标签'
  if (name === String(child.attrs.title || '')) return false
  tr.setNodeMarkup(tabPanePos(blockPos, block, index), undefined, { ...child.attrs, title: name })
  return true
}

export const TabsBlock = Node.create({
  name: 'tabsBlock',
  group: 'block',
  content: `tabPane{${TABS_MIN},${TABS_MAX}}`,
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
    const active = clampIndex(node.attrs.active ?? 0, titles.length)
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
      let suspend = false
      let signature = ''
      let paintQueued = false
      const dom = document.createElement('div')
      dom.className = 'rte-tabs-block'
      dom.dataset.type = 'tabs-block'
      dom.dataset.active = String(clampIndex(Number(node.attrs.active ?? 0), node.childCount))

      const bar = document.createElement('div')
      bar.className = 'rte-tabs-bar'
      bar.contentEditable = 'false'

      const scroll = document.createElement('div')
      scroll.className = 'rte-tabs-scroll'
      const tools = document.createElement('div')
      tools.className = 'rte-tabs-tools'
      bar.append(scroll, tools)

      const body = document.createElement('div')
      body.className = 'rte-tabs-body'

      const posOf = () => (typeof getPos === 'function' ? getPos() : null)

      const run = (mutator: (tr: Transaction, pos: number) => boolean) => {
        if (!editor.isEditable) return
        const pos = posOf()
        if (pos == null) return
        const tr = editor.state.tr
        if (!mutator(tr, pos)) return
        if (!tr.docChanged && !tr.selectionSet) return
        editor.view.dispatch(tr)
        editor.view.focus()
      }

      const titlesOf = (source: PmNode) => {
        const titles: string[] = []
        source.forEach((child) => {
          if (child.type.name === 'tabPane') titles.push(String(child.attrs.title || '标签'))
        })
        return titles
      }

      const beginRename = (index: number, title: string) => {
        if (!editor.isEditable) return
        suspend = true
        const btn = scroll.querySelector(`[data-tab-index="${index}"]`)
        if (!(btn instanceof HTMLElement)) {
          suspend = false
          return
        }
        const input = document.createElement('input')
        input.className = 'rte-tabs-rename'
        input.value = title
        input.maxLength = 40
        input.setAttribute('aria-label', '标签名称')
        btn.replaceChildren(input)
        input.focus()
        input.select()
        let done = false
        const finish = (commit: boolean) => {
          if (done) return
          done = true
          suspend = false
          if (!commit) {
            signature = ''
            syncBar()
            return
          }
          run((tr, pos) => renameTabPane(tr, pos, index, input.value))
          signature = ''
          syncBar()
        }
        input.addEventListener('keydown', (event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            input.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            finish(false)
          }
        })
        input.addEventListener('mousedown', (event) => event.stopPropagation())
        input.addEventListener('blur', () => finish(true))
      }

      const paintBar = () => {
        if (suspend) return
        const titles = titlesOf(current)
        const active = clampIndex(current.attrs.active ?? 0, titles.length)
        if (dom.dataset.active !== String(active)) dom.dataset.active = String(active)
        const editable = editor.isEditable
        const next = `${titles.join('\u0000')}|${active}|${editable ? 1 : 0}`
        if (next === signature) return
        signature = next
        scroll.replaceChildren()
        tools.replaceChildren()

        titles.forEach((title, index) => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = `rte-tabs-tab${index === active ? ' is-active' : ''}`
          btn.dataset.tabIndex = String(index)
          btn.draggable = editable
          btn.title = editable ? '拖到其他标签上可调整顺序' : title
          const label = document.createElement('span')
          label.textContent = title
          btn.append(label)
          btn.addEventListener('click', () => run((tr, pos) => setActiveTab(tr, pos, index)))
          btn.addEventListener('dblclick', (event) => {
            event.preventDefault()
            event.stopPropagation()
            beginRename(index, title)
          })
          btn.addEventListener('dragstart', (event) => {
            event.dataTransfer?.setData('text/plain', String(index))
            event.dataTransfer?.setData('application/x-rte-tab', String(index))
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            btn.classList.add('is-dragging')
          })
          btn.addEventListener('dragend', () => btn.classList.remove('is-dragging'))
          btn.addEventListener('dragover', (event) => {
            if (!editable) return
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
            btn.classList.add('is-drop')
          })
          btn.addEventListener('dragleave', () => btn.classList.remove('is-drop'))
          btn.addEventListener('drop', (event) => {
            event.preventDefault()
            btn.classList.remove('is-drop')
            const raw = event.dataTransfer?.getData('application/x-rte-tab') || event.dataTransfer?.getData('text/plain')
            const from = Number(raw)
            if (!Number.isInteger(from)) return
            run((tr, pos) => moveTabPane(tr, pos, from, index))
          })
          scroll.append(btn)
        })

        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'rte-tabs-add'
        add.textContent = '添加'
        add.disabled = !editable || titles.length >= TABS_MAX
        add.title = titles.length >= TABS_MAX ? `最多 ${TABS_MAX} 个标签` : '添加标签'
        add.addEventListener('mousedown', (event) => event.preventDefault())
        add.addEventListener('click', () => run((tr, pos) => addTabPane(tr, pos)))
        scroll.append(add)

        const makeTool = (text: string, title: string, danger: boolean, enabled: boolean, act: () => void) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = `rte-tabs-tool${danger ? ' is-danger' : ''}`
          button.textContent = text
          button.title = title
          button.disabled = !enabled
          button.addEventListener('mousedown', (event) => event.preventDefault())
          button.addEventListener('click', act)
          tools.append(button)
          return button
        }
        makeTool('左移', '把当前标签向左移', false, editable && active > 0, () => {
          run((tr, pos) => moveTabPane(tr, pos, active, active - 1))
        })
        makeTool('右移', '把当前标签向右移', false, editable && active < titles.length - 1, () => {
          run((tr, pos) => moveTabPane(tr, pos, active, active + 1))
        })
        makeTool('改名', '重命名当前标签', false, editable && titles.length > 0, () => {
          beginRename(active, titles[active] || '标签')
        })
        makeTool(
          '删除',
          titles.length <= TABS_MIN ? '删除整个标签页' : '删除当前标签',
          true,
          editable && titles.length > 0,
          () => run((tr, pos) => removeTabPane(tr, pos, active)),
        )
      }

      const syncBar = () => {
        if (paintQueued || suspend) return
        paintQueued = true
        queueMicrotask(() => {
          paintQueued = false
          paintBar()
        })
      }

      bar.addEventListener('mousedown', (event) => {
        if (event.target instanceof HTMLInputElement) return
        event.stopPropagation()
      })
      bar.addEventListener('click', (event) => event.stopPropagation())

      dom.append(bar, body)
      syncBar()

      return {
        dom,
        contentDOM: body,
        update(updated) {
          if (updated.type.name !== 'tabsBlock') return false
          current = updated
          dom.dataset.active = String(clampIndex(Number(updated.attrs.active ?? 0), updated.childCount))
          syncBar()
          return true
        },
        stopEvent(event) {
          return bar.contains(event.target as globalThis.Node)
        },
        ignoreMutation(mutation) {
          const target = mutation.target as globalThis.Node
          // 标签条和页签显隐不进文档；正文里的输入仍然要收下。
          if (!body.contains(target)) return true
          return mutation.type === 'attributes'
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
            titles && titles.length >= 1
              ? titles.slice(0, TABS_MAX)
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
