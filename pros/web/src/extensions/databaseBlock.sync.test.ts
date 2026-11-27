// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlockIdentity, collectIdentityNodes, readBlockId } from './blockIdentity'
import { DATABASE_BLOCK_NAME, DatabaseBlock } from './databaseBlock'
import { firstFilterableField, payloadFromAttrs } from './databaseBlockSheet'
import { syncLinkedDatabaseBlock } from './databaseBlockSync'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false }), BlockIdentity, DatabaseBlock],
    content: '<p></p>',
  })
  return editor
}

function databasePos(ed: Editor) {
  const row = collectIdentityNodes(ed.state.doc).find(({ node }) => node.type.name === DATABASE_BLOCK_NAME)
  if (!row) throw new Error('missing block')
  return row
}

describe('databaseBlock 关联树上表同步', () => {
  it('拉取会把树上表写入内嵌块并保持 blockId', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1', title: '关联表' })
    const row = databasePos(ed)
    const id = readBlockId(row.node)
    const local = payloadFromAttrs(row.node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    tree.rows[0].cells[name.id] = '树上最新'
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: row.pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('pull should not save')
      },
    })
    expect(result).toEqual({ action: 'pulled', droppedFilters: 0 })
    const next = databasePos(ed)
    expect(readBlockId(next.node)).toBe(id)
    expect(payloadFromAttrs(next.node.attrs).sheet.rows[0]!.cells[name.id]).toBe('树上最新')
  })

  it('写回保留树上视图，并把块内改动交给 save', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const row = databasePos(ed)
    const local = payloadFromAttrs(row.node.attrs)
    const name = firstFilterableField(local)!
    const target = local.sheet.rows[1]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内最新')).toBe(true)
    const treeViews = [{ ...local.sheet.views[0]!, name: '树上表格' }]
    let saved: unknown
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'push',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: { ...local.sheet, views: treeViews } }),
      save: async (_project, nodeId, kind, data) => {
        expect(nodeId).toBe('tree-1')
        expect(kind).toBe('sheet')
        saved = data
        return { kind, data }
      },
    })
    expect(result).toEqual({ action: 'pushed', droppedFilters: 0 })
    const pushed = saved as { views: Array<{ name: string }>; rows: Array<{ id: string; cells: Record<string, unknown> }> }
    expect(pushed.views[0]!.name).toBe('树上表格')
    expect(pushed.rows.find((item) => item.id === target.id)?.cells[name.id]).toBe('块内最新')
  })

  it('关联节点不是表格时拒绝', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'mind-1' })
    await expect(
      syncLinkedDatabaseBlock(ed, 'proj', {
        direction: 'pull',
        sheetNodeId: 'mind-1',
        pos: databasePos(ed).pos,
      }, {
        load: async () => ({ kind: 'mindmap', data: {} }),
        save: async () => ({}),
      }),
    ).rejects.toThrow('关联节点不是多维表格')
  })
})

  it('拉取时丢掉指向已删除字段的筛选，并清掉无效排序', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const gone = 'field-gone'
    expect(ed.commands.setDatabaseBlockFilters([{ fieldId: gone, op: 'contains', value: 'x' }])).toBe(true)
    expect(ed.commands.setDatabaseBlockSort(gone, 'asc')).toBe(true)
    const tree = JSON.parse(JSON.stringify(payloadFromAttrs(databasePos(ed).node.attrs).sheet))
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('pull should not save')
      },
    })
    expect(result.action).toBe('pulled')
    expect(result.droppedFilters).toBeGreaterThan(0)
    const next = payloadFromAttrs(databasePos(ed).node.attrs)
    const view = next.sheet.views.find((item) => item.id === next.activeViewId)!
    expect(view.filters.some((item) => item.fieldId === gone)).toBe(false)
    expect(view.sortBy).toBeNull()
  })

