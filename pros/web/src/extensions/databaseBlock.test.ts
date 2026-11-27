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
import {
  calendarMonthMatrix,
  firstFilterableField,
  payloadFromAttrs,
  pushSheetFromPayload,
  visibleDatabaseRows,
} from './databaseBlockSheet'

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


describe('databaseBlock 筛选与视图', () => {
  it('筛选后序列化往返，刷新后仍只显示匹配行', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ title: '任务表' })
    const node = databaseNodes(ed)[0]!.node
    const field = firstFilterableField(payloadFromAttrs(node.attrs))
    expect(field).toBeTruthy()
    expect(ed.commands.setDatabaseBlockFilters([{ fieldId: field!.id, op: 'contains', value: '示例' }])).toBe(true)
    const filtered = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    expect(visibleDatabaseRows(filtered).map((row) => String(row.cells[field!.id]))).toEqual(['示例任务'])
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    const html = ed.getHTML()
    expect(html).toContain('data-sheet=')
    expect(html).toContain('data-view-type=')
    const again = mount(html)
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    expect(visibleDatabaseRows(restored)).toHaveLength(1)
    expect(visibleDatabaseRows(restored)[0]!.cells[field!.id]).toBe('示例任务')
  })

  it('切换看板视图后刷新仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    expect(ed.commands.setDatabaseBlockView('kanban')).toBe(true)
    expect(payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs).sheet.views.find((view) => view.id === payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs).activeViewId)?.type).toBe('kanban')
    const again = mount(ed.getHTML())
    const payload = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    expect(payload.sheet.views.find((view) => view.id === payload.activeViewId)?.type).toBe('kanban')
    expect(ed.getHTML()).toContain('data-view-type="kanban"')
  })

  it('块内改单元格不丢 blockId，刷新后仍在', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const row = databaseNodes(ed)[0]!
    const id = readBlockId(row.node)
    const payload = payloadFromAttrs(row.node.attrs)
    const field = firstFilterableField(payload)!
    const target = payload.sheet.rows[1]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, field.id, '改过的名称')).toBe(true)
    expect(readBlockId(databaseNodes(ed)[0]!.node)).toBe(id)
    const again = mount(ed.getHTML())
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(restored.sheet.rows.find((item) => item.id === target.id)?.cells[field.id]).toBe('改过的名称')
  })
})

describe('databaseBlock 多条件且或与画廊日历', () => {
  it('多条件且/或筛选刷新后仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ title: '任务表' })
    const payload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const name = firstFilterableField(payload)!
    const status = payload.sheet.fields.find((field) => field.type === 'select')!
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    expect(
      ed.commands.setDatabaseBlockFilters([
        { fieldId: name.id, op: 'contains', value: '项' },
        { fieldId: status.id, op: 'is', value: '进行中' },
      ]),
    ).toBe(true)
    expect(ed.commands.setDatabaseBlockFilterJoin('and')).toBe(true)
    const andRows = visibleDatabaseRows(payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs))
    expect(andRows).toHaveLength(0)
    expect(ed.commands.setDatabaseBlockFilterJoin('or')).toBe(true)
    const orPayload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    expect(visibleDatabaseRows(orPayload).map((row) => String(row.cells[name.id])).sort()).toEqual(['另一项', '示例任务'])
    const html = ed.getHTML()
    const again = mount(html)
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    expect(restored.sheet.views.find((view) => view.id === restored.activeViewId)?.filterJoin).toBe('or')
    expect(visibleDatabaseRows(restored)).toHaveLength(2)
  })

  it('切换画廊和日历后刷新仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    expect(ed.commands.setDatabaseBlockView('gallery')).toBe(true)
    expect(payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs).sheet.views.find((view) => view.id === payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs).activeViewId)?.type).toBe('gallery')
    const galleryHtml = ed.getHTML()
    expect(galleryHtml).toContain('data-view-type="gallery"')
    const gallery = mount(galleryHtml)
    expect(readBlockId(databaseNodes(gallery)[0]!.node)).toBe(id)
    expect(payloadFromAttrs(databaseNodes(gallery)[0]!.node.attrs).sheet.views.find((view) => view.id === payloadFromAttrs(databaseNodes(gallery)[0]!.node.attrs).activeViewId)?.type).toBe('gallery')

    expect(ed.commands.setDatabaseBlockView('calendar')).toBe(true)
    expect(ed.getHTML()).toContain('data-view-type="calendar"')
    const again = mount(ed.getHTML())
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    expect(payloadFromAttrs(databaseNodes(again)[0]!.node.attrs).sheet.views.find((view) => view.id === payloadFromAttrs(databaseNodes(again)[0]!.node.attrs).activeViewId)?.type).toBe('calendar')
  })
})

describe('databaseBlock 与树上表快照同步', () => {
  it('importDatabaseBlockSheet 拉取树上表后刷新仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-sheet', title: '关联表' })
    const before = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const name = firstFilterableField(before)!
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    const tree = JSON.parse(JSON.stringify(before.sheet))
    tree.rows[0].cells[name.id] = '树上改过'
    expect(ed.commands.importDatabaseBlockSheet(tree)).toBe(true)
    expect(readBlockId(databaseNodes(ed)[0]!.node)).toBe(id)
    const pulled = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    expect(pulled.sheet.rows[0]!.cells[name.id]).toBe('树上改过')
    const again = mount(ed.getHTML())
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    expect(payloadFromAttrs(databaseNodes(again)[0]!.node.attrs).sheet.rows[0]!.cells[name.id]).toBe('树上改过')
  })

  it('pushSheetFromPayload 写回树上表时保留树上视图', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-sheet' })
    const payload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const name = firstFilterableField(payload)!
    const target = payload.sheet.rows[1]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内改过')).toBe(true)
    const next = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const treeViews = [{ ...payload.sheet.views[0]!, name: '树上表格' }]
    const pushed = pushSheetFromPayload(next, { ...payload.sheet, views: treeViews })
    expect(pushed.views[0]!.name).toBe('树上表格')
    expect(pushed.rows.find((row) => row.id === target.id)?.cells[name.id]).toBe('块内改过')
  })
})

describe('databaseBlock 比较筛选', () => {
  it('数字大于筛选刷新后仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const payload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const due = payload.sheet.fields.find((field) => field.type === 'date')!
    expect(due).toBeTruthy()
    expect(ed.commands.setDatabaseBlockFilters([{ fieldId: due.id, op: 'gt', value: '2026-11-27' }])).toBe(true)
    const visible = visibleDatabaseRows(payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs))
    expect(visible).toHaveLength(1)
    expect(visible[0]!.cells[due.id]).toBe('2026-12-01')
    const again = mount(ed.getHTML())
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(restored.sheet.views.find((view) => view.id === restored.activeViewId)?.filters[0]?.op).toBe('gt')
    expect(visibleDatabaseRows(restored)).toHaveLength(1)
  })
})

describe('databaseBlock 不包含筛选', () => {
  it('不包含条件刷新后仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const payload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const name = firstFilterableField(payload)!
    expect(ed.commands.setDatabaseBlockFilters([{ fieldId: name.id, op: 'notContains', value: '示例' }])).toBe(true)
    const visible = visibleDatabaseRows(payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs))
    expect(visible.map((row) => String(row.cells[name.id]))).toEqual(['另一项'])
    const again = mount(ed.getHTML())
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(restored.sheet.views.find((view) => view.id === restored.activeViewId)?.filters[0]?.op).toBe('notContains')
    expect(visibleDatabaseRows(restored).map((row) => String(row.cells[name.id]))).toEqual(['另一项'])
  })
})

describe('databaseBlock 增删行', () => {
  it('添加和删除行刷新后仍保持，且不丢 blockId', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock()
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    const before = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    expect(before.sheet.rows).toHaveLength(2)
    expect(ed.commands.addDatabaseBlockRow()).toBe(true)
    expect(readBlockId(databaseNodes(ed)[0]!.node)).toBe(id)
    const added = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    expect(added.sheet.rows).toHaveLength(3)
    const drop = added.sheet.rows[0]!.id
    expect(ed.commands.removeDatabaseBlockRow(drop)).toBe(true)
    const html = ed.getHTML()
    const again = mount(html)
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(restored.sheet.rows).toHaveLength(2)
    expect(restored.sheet.rows.map((row) => row.id)).not.toContain(drop)
  })
})

describe('databaseBlock 列排序', () => {
  it('按字段升序后刷新仍保持顺序', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ title: '表' })
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    const payload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const name = payload.sheet.fields[0]!
    expect(visibleDatabaseRows(payload).map((row) => row.cells[name.id])).toEqual(['示例任务', '另一项'])
    expect(ed.commands.setDatabaseBlockSort(name.id, 'asc')).toBe(true)
    const sorted = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    expect(sorted.sheet.views.find((view) => view.id === sorted.activeViewId)?.sortBy).toBe(name.id)
    expect(visibleDatabaseRows(sorted).map((row) => row.cells[name.id])).toEqual(['另一项', '示例任务'])
    const again = mount(ed.getHTML())
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(restored.sheet.views.find((view) => view.id === restored.activeViewId)?.sortBy).toBe(name.id)
    expect(visibleDatabaseRows(restored).map((row) => row.cells[name.id])).toEqual(['另一项', '示例任务'])
  })
})

describe('databaseBlock 日历月历', () => {
  it('按月铺开展示记录，切换月份后刷新仍保持', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ title: '表' })
    const id = readBlockId(databaseNodes(ed)[0]!.node)
    expect(ed.commands.setDatabaseBlockView('calendar')).toBe(true)
    const payload = payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs)
    const november = calendarMonthMatrix(payload)
    expect(november.yearMonth).toBe('2026-11')
    const name = payload.sheet.fields[0]!
    const cell = november.weeks.flat().find((item) => item.date === '2026-11-27')
    expect(cell?.rows.map((row) => row.cells[name.id])).toEqual(['示例任务'])
    expect(november.weeks.flat().some((item) => item.date === '2026-12-01')).toBe(false)
    expect(ed.commands.setDatabaseBlockCalendarMonth('2026-12')).toBe(true)
    const december = calendarMonthMatrix(payloadFromAttrs(databaseNodes(ed)[0]!.node.attrs))
    expect(december.yearMonth).toBe('2026-12')
    expect(december.weeks.flat().find((item) => item.date === '2026-12-01')?.rows.map((row) => row.cells[name.id])).toEqual(['另一项'])
    const again = mount(ed.getHTML())
    expect(readBlockId(databaseNodes(again)[0]!.node)).toBe(id)
    const restored = payloadFromAttrs(databaseNodes(again)[0]!.node.attrs)
    expect(restored.sheet.views.find((view) => view.id === restored.activeViewId)?.calendarMonth).toBe('2026-12')
    expect(calendarMonthMatrix(restored).yearMonth).toBe('2026-12')
  })
})

