// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { SheetData } from '../components/knowledge/sheetModel'
import StarterKit from '@tiptap/starter-kit'
import { BlockIdentity, collectIdentityNodes, readBlockId } from './blockIdentity'
import { DATABASE_BLOCK_NAME, DatabaseBlock } from './databaseBlock'
import {
  classifySheetDrift,
  classifySheetThreeWay,
  describeSheetContentConflict,
  describeSheetThreeWay,
  firstFilterableField,
  legacySheetContentFingerprint,
  mergeSheetNonOverlapping,
  payloadFromAttrs,
  sheetContentFingerprint,
  sheetFingerprintMatches,
  summarizeSheetContentConflict,
} from './databaseBlockSheet'
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
    expect(aborted).toMatchObject({ action: 'aborted', droppedFilters: 0, diverged: true, drift: 'both', conflict: { localOnlyFields: 0, remoteOnlyFields: 0, changedFields: 0, localOnlyRows: 0, remoteOnlyRows: 0, changedRows: 1, changedCells: 1 } })
    expect(aborted.conflict?.threeWay).toMatchObject({ conflictCells: 1, autoMergeable: false })
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
    expect(result).toMatchObject({ action: 'aborted', droppedFilters: 0, diverged: true, drift: 'both', conflict: { localOnlyFields: 0, remoteOnlyFields: 0, changedFields: 0, localOnlyRows: 0, remoteOnlyRows: 0, changedRows: 1, changedCells: 1 } })
    expect(result.conflict?.threeWay).toMatchObject({ conflictCells: 1, autoMergeable: false })
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
    expect(summary.probed[0]!.conflict).toMatchObject({
      localOnlyFields: 0,
      remoteOnlyFields: 0,
      changedFields: 0,
      localOnlyRows: 0,
      remoteOnlyRows: 0,
      changedRows: 1,
      changedCells: 1,
    })
    expect(summary.probed[0]!.conflict?.threeWay).toMatchObject({
      conflictCells: 1,
      autoMergeable: false,
    })
    expect(summary.merged).toBe(0)
    expect(saved).toBe(false)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('块内又改了')
    const id = readBlockId(databasePos(ed).node)
    expect(id).toBeTruthy()
    expect(getDatabaseBlockSyncStatus(databaseBlockSyncKey(id!, 'tree-1'))?.conflict?.changedCells).toBe(1)
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

describe('sheet 指纹与双边差异摘要', () => {
  const base: SheetData = {
    fields: [{ id: 'n', name: '名称', type: 'text' }],
    rows: [
      { id: 'r1', cells: { n: '甲' } },
      { id: 'r2', cells: { n: '乙' } },
    ],
    views: [],
  }

  it('单元格键顺序不同仍视为同一指纹，历史指纹也能对上', () => {
    const stable: SheetData = { ...base, rows: [{ id: 'r1', cells: { b: 2, a: 1 } }, { id: 'r2', cells: { n: '乙' } }] }
    const shuffled: SheetData = { ...base, rows: [{ id: 'r1', cells: { a: 1, b: 2 } }, { id: 'r2', cells: { n: '乙' } }] }
    expect(sheetContentFingerprint(stable)).toBe(sheetContentFingerprint(shuffled))
    expect(legacySheetContentFingerprint(stable)).not.toBe(legacySheetContentFingerprint(shuffled))
    expect(sheetFingerprintMatches(shuffled, legacySheetContentFingerprint(stable))).toBe(true)
    expect(classifySheetDrift(shuffled, shuffled, legacySheetContentFingerprint(stable))).toBe('in-sync')
    expect(classifySheetDrift(stable, shuffled, legacySheetContentFingerprint(stable))).toBe('in-sync')
  })

  it('只有键顺序变化时，不会把历史指纹误判成两边都改过', () => {
    const original: SheetData = { ...base, rows: [{ id: 'r1', cells: { b: 2, a: 1 } }] }
    const same: SheetData = { ...base, rows: [{ id: 'r1', cells: { a: 1, b: 2 } }] }
    expect(classifySheetDrift(same, same, legacySheetContentFingerprint(original))).toBe('in-sync')
    expect(classifySheetDrift(same, original, legacySheetContentFingerprint(original))).toBe('in-sync')
  })

  it('历史指纹不会把仅单边改过误判成两边都改过', () => {
    const original: SheetData = { ...base, rows: [{ id: 'r1', cells: { b: 2, a: 1 } }] }
    const local: SheetData = { ...base, rows: [{ id: 'r1', cells: { a: 1, b: 2 } }] }
    const remote: SheetData = { ...base, rows: [{ id: 'r1', cells: { a: 1, b: 9 } }] }
    const fp = legacySheetContentFingerprint(original)
    expect(classifySheetDrift(local, remote, fp)).toBe('remote-only')
    expect(classifySheetDrift(remote, local, fp)).toBe('local-only')
  })

  it('双边各改一行时摘要能分开统计，且说明不是自动合并', () => {
    const local: SheetData = {
      ...base,
      rows: [
        { id: 'r1', cells: { n: '本地甲' } },
        { id: 'r2', cells: { n: '乙' } },
        { id: 'r3', cells: { n: '仅本地' } },
      ],
    }
    const remote: SheetData = {
      ...base,
      fields: [...base.fields, { id: 'd', name: '备注', type: 'text' }],
      rows: [
        { id: 'r1', cells: { n: '甲' } },
        { id: 'r2', cells: { n: '树上乙' } },
      ],
    }
    expect(classifySheetDrift(local, remote, sheetContentFingerprint(base))).toBe('both')
    const summary = summarizeSheetContentConflict(local, remote)
    expect(summary).toEqual({
      localOnlyFields: 0,
      remoteOnlyFields: 1,
      changedFields: 0,
      localOnlyRows: 1,
      remoteOnlyRows: 0,
      changedRows: 2,
      changedCells: 2,
    })
    const text = describeSheetContentConflict(summary)
    expect(text).toContain('树上多 1 个字段')
    expect(text).toContain('仅内嵌多 1 行')
    expect(text).toContain('2 行内容不同')
    expect(text).toContain('不会自动合并')
    const threeWay = classifySheetThreeWay(local, remote, sheetContentFingerprint(base))
    expect(threeWay).toMatchObject({
      remoteOnlyFields: 1,
      localOnlyRows: 1,
      localOnlyCells: 1,
      remoteOnlyCells: 1,
      conflictCells: 0,
      conflictRows: 0,
      conflictFields: 0,
      autoMergeable: true,
    })
    const merged = mergeSheetNonOverlapping(local, remote, sheetContentFingerprint(base))
    expect(merged).toBeTruthy()
    expect(merged!.fields.map((field) => field.id).sort()).toEqual(['d', 'n'])
    expect(merged!.rows.find((row) => row.id === 'r1')?.cells.n).toBe('本地甲')
    expect(merged!.rows.find((row) => row.id === 'r2')?.cells.n).toBe('树上乙')
    expect(merged!.rows.find((row) => row.id === 'r3')?.cells.n).toBe('仅本地')
    expect(describeSheetThreeWay(threeWay!)).toContain('不相交的改动会自动合并到两边')
    expect(describeSheetThreeWay(threeWay!)).toContain('不是实时双向同步')
  })

  it('同一单元格两边都改过时不能自动合并', () => {
    const local: SheetData = { ...base, rows: [{ id: 'r1', cells: { n: '本地甲' } }, { id: 'r2', cells: { n: '乙' } }] }
    const remote: SheetData = { ...base, rows: [{ id: 'r1', cells: { n: '树上甲' } }, { id: 'r2', cells: { n: '乙' } }] }
    const threeWay = classifySheetThreeWay(local, remote, sheetContentFingerprint(base))
    expect(threeWay).toMatchObject({ conflictCells: 1, autoMergeable: false })
    expect(mergeSheetNonOverlapping(local, remote, sheetContentFingerprint(base))).toBeNull()
    expect(describeSheetThreeWay(threeWay!)).toContain('不会自动合并')
  })

  it('一边删除一行、另一边改同一行时不能自动合并', () => {
    const local: SheetData = { ...base, rows: [{ id: 'r1', cells: { n: '本地甲' } }] }
    const remote: SheetData = { ...base, rows: [{ id: 'r1', cells: { n: '甲' } }, { id: 'r2', cells: { n: '树上乙' } }] }
    const threeWay = classifySheetThreeWay(local, remote, sheetContentFingerprint(base))
    expect(threeWay).toMatchObject({ conflictRows: 1, autoMergeable: false })
    expect(mergeSheetNonOverlapping(local, remote, sheetContentFingerprint(base))).toBeNull()
  })
})

describe('databaseBlock 不相交改动自动合并与多块对照', () => {
  function allDatabasePos(ed: Editor) {
    return collectIdentityNodes(ed.state.doc).filter(({ node }) => node.type.name === DATABASE_BLOCK_NAME)
  }

  it('自动安全同步会把不相交的改动合并到两边', async () => {
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
    const rows = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows
    expect(rows.length).toBeGreaterThan(1)
    expect(ed.commands.updateDatabaseBlockCell(rows[0]!.id, name.id, '块内甲')).toBe(true)
    const changedTree = JSON.parse(JSON.stringify(tree))
    changedTree.rows[1].cells[name.id] = '树上乙'
    let saved: unknown
    const summary = await applySafeLinkedDatabaseBlocks(ed, 'proj', {
      load: async () => ({ kind: 'sheet', data: changedTree }),
      save: async (_project: string, nodeId: string, kind: string, data: unknown) => {
        expect(nodeId).toBe('tree-1')
        expect(kind).toBe('sheet')
        saved = data
        return { kind, data }
      },
    })
    expect(summary.merged).toBe(1)
    expect(summary.pulled).toBe(0)
    expect(summary.pushed).toBe(0)
    expect(summary.skipped).toBe(0)
    const sheet = payloadFromAttrs(databasePos(ed).node.attrs).sheet
    expect(sheet.rows[0]!.cells[name.id]).toBe('块内甲')
    expect(sheet.rows[1]!.cells[name.id]).toBe('树上乙')
    const pushed = saved as { rows: Array<{ id: string; cells: Record<string, unknown> }> }
    expect(pushed.rows[0]!.cells[name.id]).toBe('块内甲')
    expect(pushed.rows[1]!.cells[name.id]).toBe('树上乙')
    const id = readBlockId(databasePos(ed).node)
    expect(getDatabaseBlockSyncStatus(databaseBlockSyncKey(id!, 'tree-1'))?.drift).toBe('in-sync')
  })

  it('自动安全同步会连续处理两块：先拉后写，不沿用过期位置', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-a' })
    ed.commands.setTextSelection(ed.state.doc.content.size)
    ed.commands.insertContent({ type: 'paragraph' })
    ed.commands.setTextSelection(ed.state.doc.content.size)
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-b' })
    const blocks = allDatabasePos(ed)
    expect(blocks).toHaveLength(2)
    const first = payloadFromAttrs(blocks[0]!.node.attrs)
    const second = payloadFromAttrs(blocks[1]!.node.attrs)
    const firstField = firstFilterableField(first)!
    const secondField = firstFilterableField(second)!
    const treeA = JSON.parse(JSON.stringify(first.sheet))
    const treeB = JSON.parse(JSON.stringify(second.sheet))
    const trees: Record<string, SheetData> = { 'tree-a': treeA, 'tree-b': treeB }
    for (const item of allDatabasePos(ed)) {
      const sheetNodeId = String(item.node.attrs.sheetNodeId)
      await syncLinkedDatabaseBlock(ed, 'proj', {
        direction: 'pull',
        sheetNodeId,
        pos: item.pos,
      }, {
        load: async () => ({ kind: 'sheet', data: trees[sheetNodeId] }),
        save: async () => {
          throw new Error('setup pull should not save')
        },
      })
    }
    const afterSync = allDatabasePos(ed)
    const blockB = afterSync.find((item) => String(item.node.attrs.sheetNodeId) === 'tree-b')
    if (!blockB) throw new Error('missing tree-b')
    const changedA = JSON.parse(JSON.stringify(treeA))
    changedA.rows[0].cells[firstField.id] = '树上甲'
    trees['tree-a'] = changedA
    const localB = payloadFromAttrs(blockB.node.attrs).sheet.rows[0]!
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, blockB.pos)))
    expect(ed.commands.updateDatabaseBlockCell(localB.id, secondField.id, '块内乙')).toBe(true)
    const saved: Record<string, unknown> = {}
    const summary = await applySafeLinkedDatabaseBlocks(ed, 'proj', {
      load: async (_project, nodeId) => ({ kind: 'sheet', data: trees[nodeId] }),
      save: async (_project, nodeId, kind, data) => {
        expect(kind).toBe('sheet')
        saved[nodeId] = data
        trees[nodeId] = data as SheetData
        return { kind, data }
      },
    })
    expect(summary.pulled).toBe(1)
    expect(summary.pushed).toBe(1)
    expect(summary.skipped).toBe(0)
    const latest = allDatabasePos(ed)
    const latestA = latest.find((item) => String(item.node.attrs.sheetNodeId) === 'tree-a')
    const latestB = latest.find((item) => String(item.node.attrs.sheetNodeId) === 'tree-b')
    if (!latestA || !latestB) throw new Error('missing blocks after sync')
    expect(payloadFromAttrs(latestA.node.attrs).sheet.rows[0]!.cells[firstField.id]).toBe('树上甲')
    expect(payloadFromAttrs(latestB.node.attrs).sheet.rows[0]!.cells[secondField.id]).toBe('块内乙')
    const pushedB = saved['tree-b'] as { rows: Array<{ cells: Record<string, unknown> }> }
    expect(pushedB.rows[0]!.cells[secondField.id]).toBe('块内乙')
  })
})
