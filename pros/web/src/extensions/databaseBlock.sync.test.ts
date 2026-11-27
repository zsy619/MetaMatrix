// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlockIdentity, collectIdentityNodes, readBlockId } from './blockIdentity'
import { DATABASE_BLOCK_NAME, DatabaseBlock } from './databaseBlock'
import { firstFilterableField, payloadFromAttrs, sheetContentFingerprint } from './databaseBlockSheet'
import { applySafeLinkedDatabaseBlocks, probeLinkedDatabaseBlocks, syncLinkedDatabaseBlock } from './databaseBlockSync'
import {
  clearDatabaseBlockSyncStatus,
  databaseBlockSyncKey,
  getDatabaseBlockSyncStatus,
} from './databaseBlockSyncStatus'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  clearDatabaseBlockSyncStatus()
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
    expect(result).toEqual({ action: 'pulled', droppedFilters: 0, diverged: false, drift: 'unknown' })
    const next = databasePos(ed)
    expect(readBlockId(next.node)).toBe(id)
    expect(payloadFromAttrs(next.node.attrs).sheet.rows[0]!.cells[name.id]).toBe('树上最新')
    expect(String(next.node.attrs.syncedFp || '')).toBe(sheetContentFingerprint(payloadFromAttrs(next.node.attrs).sheet))
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
    expect(result).toEqual({ action: 'pushed', droppedFilters: 0, diverged: false, drift: 'unknown' })
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

  it('两边都改过且未确认时中止，确认后才覆盖', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const target = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内又改了')).toBe(true)
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[0].cells[name.id] = '树上又改了'
    const aborted = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        throw new Error('aborted pull should not save')
      },
    })
    expect(aborted).toEqual({ action: 'aborted', droppedFilters: 0, diverged: true, drift: 'both' })
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('块内又改了')
    const forced = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
      force: true,
    }, {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        throw new Error('force pull should not save')
      },
    })
    expect(forced.action).toBe('pulled')
    expect(forced.diverged).toBe(true)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('树上又改了')
  })

  it('仅内嵌改过时，未确认的拉取会中止', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const target = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内改了')).toBe(true)
    const aborted = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('aborted pull should not save')
      },
    })
    expect(aborted).toEqual({ action: 'aborted', droppedFilters: 0, diverged: false, drift: 'local-only' })
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('块内改了')
    const forced = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
      force: true,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('force pull should not save')
      },
    })
    expect(forced.action).toBe('pulled')
    expect(forced.drift).toBe('local-only')
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).not.toBe('块内改了')
  })

  it('仅树上改过时，未确认的写回会中止', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[0].cells[name.id] = '树上改了'
    let saved = false
    const aborted = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'push',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        saved = true
        throw new Error('aborted push should not save')
      },
    })
    expect(aborted).toEqual({ action: 'aborted', droppedFilters: 0, diverged: false, drift: 'remote-only' })
    expect(saved).toBe(false)
  })

  it('对照会标出树上有更新，安全同步只拉取单边改动', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[0].cells[name.id] = '树上新值'
    const io = {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        throw new Error('safe pull should not save')
      },
    }
    const probed = await probeLinkedDatabaseBlocks(ed, 'proj', io)
    expect(probed).toHaveLength(1)
    expect(probed[0]!.drift).toBe('remote-only')
    const id = readBlockId(databasePos(ed).node)
    expect(id).toBeTruthy()
    expect(getDatabaseBlockSyncStatus(databaseBlockSyncKey(id!, 'tree-1'))?.drift).toBe('remote-only')
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'safe',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, io)
    expect(result.action).toBe('pulled')
    expect(result.drift).toBe('remote-only')
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('树上新值')
    expect(getDatabaseBlockSyncStatus(databaseBlockSyncKey(id!, 'tree-1'))?.drift).toBe('in-sync')
  })

  it('两边都改过时安全同步不会覆盖', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const target = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内又改了')).toBe(true)
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[0].cells[name.id] = '树上又改了'
    let saved = false
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'safe',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        saved = true
        return {}
      },
    })
    expect(result).toEqual({ action: 'aborted', droppedFilters: 0, diverged: true, drift: 'both' })
    expect(saved).toBe(false)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('块内又改了')
  })

  it('自动安全同步会拉取仅树上有更新的表', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[0].cells[name.id] = '树上自动值'
    let saved = false
    const io = {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        saved = true
        return {}
      },
    }
    const summary = await applySafeLinkedDatabaseBlocks(ed, 'proj', io)
    expect(summary.pulled).toBe(1)
    expect(summary.pushed).toBe(0)
    expect(summary.skipped).toBe(0)
    expect(saved).toBe(false)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('树上自动值')
    const id = readBlockId(databasePos(ed).node)
    expect(id).toBeTruthy()
    expect(getDatabaseBlockSyncStatus(databaseBlockSyncKey(id!, 'tree-1'))?.drift).toBe('in-sync')
  })

  it('自动安全同步会写回仅内嵌改过的表', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const target = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内自动值')).toBe(true)
    let saved: unknown
    const io = {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async (_project: string, nodeId: string, kind: string, data: unknown) => {
        expect(nodeId).toBe('tree-1')
        expect(kind).toBe('sheet')
        saved = data
        return { kind, data }
      },
    }
    const summary = await applySafeLinkedDatabaseBlocks(ed, 'proj', io)
    expect(summary.pulled).toBe(0)
    expect(summary.pushed).toBe(1)
    expect(summary.skipped).toBe(0)
    const pushed = saved as { rows: Array<{ id: string; cells: Record<string, unknown> }> }
    expect(pushed.rows.find((item) => item.id === target.id)?.cells[name.id]).toBe('块内自动值')
  })

  it('两边都改过时自动安全同步会跳过，不覆盖任一侧', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    const target = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!
    expect(ed.commands.updateDatabaseBlockCell(target.id, name.id, '块内又改了')).toBe(true)
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[0].cells[name.id] = '树上又改了'
    let saved = false
    const summary = await applySafeLinkedDatabaseBlocks(ed, 'proj', {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async () => {
        saved = true
        return {}
      },
    })
    expect(summary.pulled).toBe(0)
    expect(summary.pushed).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(summary.probed[0]!.drift).toBe('both')
    expect(saved).toBe(false)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('块内又改了')
  })

  it('尚未对照时自动安全同步会跳过，避免覆盖未知差异', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const tree = JSON.parse(JSON.stringify(local.sheet))
    tree.rows[0].cells[name.id] = '树上未对照值'
    let saved = false
    const summary = await applySafeLinkedDatabaseBlocks(ed, 'proj', {
      load: async () => ({ kind: 'sheet', data: tree }),
      save: async () => {
        saved = true
        return {}
      },
    })
    expect(summary.pulled).toBe(0)
    expect(summary.pushed).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(summary.probed[0]!.drift).toBe('unknown')
    expect(saved).toBe(false)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).not.toBe('树上未对照值')
  })
})
