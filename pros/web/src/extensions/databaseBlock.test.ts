// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Fragment } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import {
  BLOCK_IDENTITY_ATTR,
  BLOCK_IDENTITY_HTML_ATTR,
  BlockIdentity,
  collectIdentityNodes,
  readBlockId,
} from './blockIdentity'
import {
  DATABASE_BLOCK_HTML_TYPE,
  DATABASE_BLOCK_NAME,
  DatabaseBlock,
  readDatabaseBlockOpenTarget,
} from './databaseBlock'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content?: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false }), BlockIdentity, DatabaseBlock],
    content: content || '<p></p>',
  })
  return editor
}

function databaseNodes(ed: Editor) {
  return collectIdentityNodes(ed.state.doc).filter(({ node }) => node.type.name === DATABASE_BLOCK_NAME)
}

function moveTopLevel(ed: Editor, dir: -1 | 1) {
  const { $from } = ed.state.selection
  const index = $from.index(0)
  const doc = ed.state.doc
  const children: ReturnType<typeof doc.child>[] = []
  doc.forEach((child) => children.push(child))
  const [moved] = children.splice(index, 1)
  children.splice(index + dir, 0, moved!)
  const copies = children.map((c) => c.copy(c.content))
  let tr = ed.state.tr.replaceWith(0, doc.content.size, Fragment.from(copies))
  let selPos = 0
  const targetIndex = index + dir
  for (let i = 0; i < targetIndex; i += 1) selPos += children[i]!.nodeSize
  tr = tr.setSelection(NodeSelection.create(tr.doc, selPos)).scrollIntoView()
  ed.view.dispatch(tr)
}

function duplicateTopLevel(ed: Editor) {
  const sel = ed.state.selection
  if (sel instanceof NodeSelection) {
    const node = sel.node
    const copy = node.copy(node.content)
    ed.view.dispatch(ed.state.tr.insert(sel.from + node.nodeSize, copy).scrollIntoView())
    return
  }
  const { $from } = sel
  const from = $from.before(1)
  const node = $from.node(1)
  const copy = node.copy(node.content)
  ed.view.dispatch(ed.state.tr.insert(from + node.nodeSize, copy).scrollIntoView())
}

describe('databaseBlock B3 skeleton', () => {
  it('插入后带稳定 dataBlockId，并可序列化往返', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'sheet-node-1', title: '销售表' })
    const rows = databaseNodes(ed)
    expect(rows).toHaveLength(1)
    const id = readBlockId(rows[0]!.node)
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(rows[0]!.node.attrs.sheetNodeId).toBe('sheet-node-1')
    const html = ed.getHTML()
    expect(html).toContain(`data-type="${DATABASE_BLOCK_HTML_TYPE}"`)
    expect(html).toContain(`${BLOCK_IDENTITY_HTML_ATTR}="${id}"`)
    expect(html).toContain('data-sheet-node-id="sheet-node-1"')
    expect(html).toContain('data-open-sheet="true"')

    const again = mount(html)
    const restored = databaseNodes(again)
    expect(restored).toHaveLength(1)
    expect(readBlockId(restored[0]!.node)).toBe(id)
    expect(restored[0]!.node.attrs.sheetNodeId).toBe('sheet-node-1')
    expect(restored[0]!.node.attrs.title).toBe('销售表')
  })

  it('复制换新 ID，拖拽保持 ID', () => {
    const ed = mount('<p>上面</p>')
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'n1', title: '表' })
    const first = databaseNodes(ed)[0]!
    const original = readBlockId(first.node)
    expect(original).toBeTruthy()

    const pos = first.pos
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)))
    duplicateTopLevel(ed)
    const afterCopy = databaseNodes(ed)
    expect(afterCopy).toHaveLength(2)
    const ids = afterCopy.map((row) => readBlockId(row.node))
    expect(ids[0]).toBe(original)
    expect(ids[1]).toBeTruthy()
    expect(ids[1]).not.toBe(original)

    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, afterCopy[0]!.pos)))
    const beforeMove = readBlockId(databaseNodes(ed)[0]!.node)
    moveTopLevel(ed, 1)
    const moved = databaseNodes(ed)
    expect(moved.map((row) => readBlockId(row.node))).toContain(beforeMove)
    const still = moved.find((row) => readBlockId(row.node) === beforeMove)
    expect(still?.node.attrs[BLOCK_IDENTITY_ATTR]).toBe(beforeMove)
    expect(still?.node.attrs.sheetNodeId).toBe('n1')
  })

  it('未关联表格仍是身份块，打开目标为空', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const row = databaseNodes(ed)[0]!
    expect(readBlockId(row.node)).toBeTruthy()
    const html = ed.getHTML()
    expect(html).toContain('data-open-sheet="false"')
    const host = document.createElement('div')
    host.innerHTML = html
    expect(readDatabaseBlockOpenTarget(host.firstElementChild)).toBeNull()
  })

  it('关联表格时可读出打开目标', () => {
    const host = document.createElement('div')
    host.innerHTML =
      `<div data-type="${DATABASE_BLOCK_HTML_TYPE}" data-sheet-node-id="abc" data-title="库存">库存</div>`
    expect(readDatabaseBlockOpenTarget(host.firstElementChild)).toEqual({
      sheetNodeId: 'abc',
      title: '库存',
    })
  })
})
