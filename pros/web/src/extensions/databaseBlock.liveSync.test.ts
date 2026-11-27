// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import type { SheetData } from '../components/knowledge/sheetModel'
import StarterKit from '@tiptap/starter-kit'
import { BlockIdentity, collectIdentityNodes, readBlockId } from './blockIdentity'
import { DATABASE_BLOCK_NAME, DatabaseBlock } from './databaseBlock'
import { firstFilterableField, payloadFromAttrs, sheetContentFingerprint } from './databaseBlockSheet'
import { applySafeLinkedDatabaseBlocks, syncLinkedDatabaseBlock } from './databaseBlockSync'
import { clearDatabaseBlockSyncStatus, databaseBlockSyncKey, getDatabaseBlockSyncStatus } from './databaseBlockSyncStatus'
import {
  createLiveLinkedDatabaseSync,
  transactionTouchesLinkedSheet,
} from './databaseBlockLiveSync'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  clearDatabaseBlockSyncStatus()
  vi.useRealTimers()
})

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false }), BlockIdentity, DatabaseBlock],
    content: '<p></p>',
  })
  editors.push(editor)
  return editor
}

function databasePos(ed: Editor) {
  const row = collectIdentityNodes(ed.state.doc).find(({ node }) => node.type.name === DATABASE_BLOCK_NAME)
  if (!row) throw new Error('missing block')
  return row
}

function memorySheetIo(initial: Record<string, SheetData>) {
  const trees: Record<string, SheetData> = Object.fromEntries(
    Object.entries(initial).map(([id, sheet]) => [id, JSON.parse(JSON.stringify(sheet)) as SheetData]),
  )
  return {
    trees,
    io: {
      load: async (_project: string, nodeId: string) => ({ kind: 'sheet' as const, data: trees[nodeId] }),
      save: async (_project: string, nodeId: string, kind: string, data: unknown) => {
        trees[nodeId] = data as SheetData
        return { kind, data }
      },
    },
  }
}

async function linkToStore(ed: Editor, store: ReturnType<typeof memorySheetIo>, sheetNodeId = 'tree-1') {
  if (!collectIdentityNodes(ed.state.doc).some(({ node }) => node.type.name === DATABASE_BLOCK_NAME)) {
    ed.commands.insertDatabaseBlock({ sheetNodeId })
  }
  await syncLinkedDatabaseBlock(ed, 'proj', {
    direction: 'pull',
    sheetNodeId,
    pos: databasePos(ed).pos,
  }, {
    load: store.io.load,
    save: async () => {
      throw new Error('setup pull should not save')
    },
  })
}

describe('transactionTouchesLinkedSheet', () => {
  it('单元格改动为 true，只回写 syncedFp 为 false', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const row = local.sheet.rows[0]!
    let touched = false
    const onTransaction = ({ transaction }: { transaction: { docChanged?: boolean; before?: unknown; doc?: unknown } }) => {
      if (transactionTouchesLinkedSheet(transaction as never)) touched = true
    }
    ed.on('transaction', onTransaction)
    expect(ed.commands.updateDatabaseBlockCell(row.id, name.id, '块内改动')).toBe(true)
    expect(touched).toBe(true)
    touched = false
    const pos = databasePos(ed).pos
    const node = ed.state.doc.nodeAt(pos)
    if (!node) throw new Error('missing node')
    const fp = sheetContentFingerprint(payloadFromAttrs(node.attrs).sheet)
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, syncedFp: fp }))
    expect(touched).toBe(false)
    ed.off('transaction', onTransaction)
  })
})

describe('createLiveLinkedDatabaseSync', () => {
  it('本地通知会在抖动后对照，进行中的对照会合并成一次后续运行', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const store = memorySheetIo({ 'tree-1': local.sheet })
    await linkToStore(ed, store)
    let applies = 0
    const timeouts: Array<{ id: number; fn: () => void; ms: number }> = []
    let nextId = 1
    const live = createLiveLinkedDatabaseSync({
      getEditor: () => ed,
      projectId: () => 'proj',
      io: store.io,
      canWrite: () => true,
      debounceMs: 40,
      pollMs: 10_000,
      apply: async (...args) => {
        applies += 1
        return applySafeLinkedDatabaseBlocks(...args)
      },
      setTimeoutFn: (fn, ms) => {
        const id = nextId++
        timeouts.push({ id, fn: fn as () => void, ms: Number(ms) })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeoutFn: (id) => {
        const index = timeouts.findIndex((item) => item.id === (id as unknown as number))
        if (index >= 0) timeouts.splice(index, 1)
      },
      setIntervalFn: () => 0 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
    })
    live.arm()
    live.notifyLocalChange()
    live.notifyLocalChange()
    expect(timeouts).toHaveLength(1)
    expect(timeouts[0]!.ms).toBe(40)
    timeouts.shift()!.fn()
    await Promise.resolve()
    await Promise.resolve()
    expect(applies).toBe(1)
    live.disarm()
    live.notifyLocalChange()
    expect(timeouts).toHaveLength(0)
  })

  it('只读时只对照不写回', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const store = memorySheetIo({ 'tree-1': local.sheet })
    await linkToStore(ed, store)
    const name = firstFilterableField(local)!
    store.trees['tree-1'] = JSON.parse(JSON.stringify(store.trees['tree-1']))
    store.trees['tree-1']!.rows[0]!.cells[name.id] = '树上最新'
    let saved = false
    const live = createLiveLinkedDatabaseSync({
      getEditor: () => ed,
      projectId: () => 'proj',
      io: {
        load: store.io.load,
        save: async (...args) => {
          saved = true
          return store.io.save(...args)
        },
      },
      canWrite: () => false,
    })
    const summary = await live.tick()
    expect(summary?.pulled).toBe(0)
    expect(summary?.pushed).toBe(0)
    expect(summary?.merged).toBe(0)
    expect(saved).toBe(false)
    expect(getDatabaseBlockSyncStatus(databaseBlockSyncKey(readBlockId(databasePos(ed).node) || '', 'tree-1'))?.drift).toBe('remote-only')
  })
})

describe('内嵌表与树上表多端对照', () => {
  it('两端改不相交单元格时多轮安全对照会汇合到两边和树上表', async () => {
    const edA = mount()
    edA.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(edA).node.attrs)
    const name = firstFilterableField(local)!
    const store = memorySheetIo({ 'tree-1': local.sheet })
    await linkToStore(edA, store)
    const edB = mount()
    edB.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    await linkToStore(edB, store)
    const rows = payloadFromAttrs(databasePos(edA).node.attrs).sheet.rows
    expect(rows.length).toBeGreaterThan(1)
    expect(edA.commands.updateDatabaseBlockCell(rows[0]!.id, name.id, '甲端')).toBe(true)
    expect(edB.commands.updateDatabaseBlockCell(rows[1]!.id, name.id, '乙端')).toBe(true)

    let lastA = await applySafeLinkedDatabaseBlocks(edA, 'proj', store.io)
    let lastB = await applySafeLinkedDatabaseBlocks(edB, 'proj', store.io)
    lastA = await applySafeLinkedDatabaseBlocks(edA, 'proj', store.io)
    lastB = await applySafeLinkedDatabaseBlocks(edB, 'proj', store.io)

    expect(payloadFromAttrs(databasePos(edA).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('甲端')
    expect(payloadFromAttrs(databasePos(edA).node.attrs).sheet.rows[1]!.cells[name.id]).toBe('乙端')
    expect(payloadFromAttrs(databasePos(edB).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('甲端')
    expect(payloadFromAttrs(databasePos(edB).node.attrs).sheet.rows[1]!.cells[name.id]).toBe('乙端')
    expect(store.trees['tree-1']!.rows[0]!.cells[name.id]).toBe('甲端')
    expect(store.trees['tree-1']!.rows[1]!.cells[name.id]).toBe('乙端')
    expect(lastA.skipped + lastB.skipped).toBeGreaterThanOrEqual(0)
  })

  it('同一单元格两端都改时多轮对照仍不覆盖', async () => {
    const edA = mount()
    edA.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(edA).node.attrs)
    const name = firstFilterableField(local)!
    const store = memorySheetIo({ 'tree-1': local.sheet })
    await linkToStore(edA, store)
    const edB = mount()
    edB.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    await linkToStore(edB, store)
    const row = payloadFromAttrs(databasePos(edA).node.attrs).sheet.rows[0]!
    expect(edA.commands.updateDatabaseBlockCell(row.id, name.id, '甲端')).toBe(true)
    expect(edB.commands.updateDatabaseBlockCell(row.id, name.id, '乙端')).toBe(true)
    await applySafeLinkedDatabaseBlocks(edA, 'proj', store.io)
    const afterA = store.trees['tree-1']!.rows[0]!.cells[name.id]
    const summaryB = await applySafeLinkedDatabaseBlocks(edB, 'proj', store.io)
    const summaryA2 = await applySafeLinkedDatabaseBlocks(edA, 'proj', store.io)
    expect(payloadFromAttrs(databasePos(edB).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('乙端')
    expect(store.trees['tree-1']!.rows[0]!.cells[name.id]).toBe(afterA)
    expect(payloadFromAttrs(databasePos(edA).node.attrs).sheet.rows[0]!.cells[name.id]).not.toBe('乙端')
    expect(summaryB.merged).toBe(0)
    expect(summaryA2.merged).toBe(0)
    const idB = readBlockId(databasePos(edB).node)
    const driftB = getDatabaseBlockSyncStatus(databaseBlockSyncKey(idB || '', 'tree-1'))?.drift
    expect(driftB === 'both' || summaryB.skipped >= 1).toBe(true)
  })

  it('写回前树上表已出现不相交改动时重新对照并合并，不盲覆盖', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const base = JSON.parse(JSON.stringify(local.sheet)) as SheetData
    const rows = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: base }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    expect(ed.commands.updateDatabaseBlockCell(rows[0]!.id, name.id, '块内甲')).toBe(true)
    const concurrent = JSON.parse(JSON.stringify(base)) as SheetData
    concurrent.rows[1]!.cells[name.id] = '树上乙'
    let loads = 0
    let saved: SheetData | undefined
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'safe',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => {
        loads += 1
        return { kind: 'sheet', data: loads === 1 ? base : concurrent }
      },
      save: async (_project, _id, _kind, data) => {
        saved = data as SheetData
        return { kind: 'sheet', data }
      },
    })
    expect(loads).toBeGreaterThan(1)
    expect(result.action).toBe('merged')
    expect(saved?.rows[0]!.cells[name.id]).toBe('块内甲')
    expect(saved?.rows[1]!.cells[name.id]).toBe('树上乙')
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[1]!.cells[name.id]).toBe('树上乙')
  })

  it('写回前同一单元格树上已改时中止，不覆盖树上值', async () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ sheetNodeId: 'tree-1' })
    const local = payloadFromAttrs(databasePos(ed).node.attrs)
    const name = firstFilterableField(local)!
    const base = JSON.parse(JSON.stringify(local.sheet)) as SheetData
    const row = payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!
    await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'pull',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => ({ kind: 'sheet', data: base }),
      save: async () => {
        throw new Error('setup pull should not save')
      },
    })
    expect(ed.commands.updateDatabaseBlockCell(row.id, name.id, '块内甲')).toBe(true)
    const concurrent = JSON.parse(JSON.stringify(base)) as SheetData
    concurrent.rows[0]!.cells[name.id] = '树上甲'
    let loads = 0
    let saved = false
    const result = await syncLinkedDatabaseBlock(ed, 'proj', {
      direction: 'safe',
      sheetNodeId: 'tree-1',
      pos: databasePos(ed).pos,
    }, {
      load: async () => {
        loads += 1
        return { kind: 'sheet', data: loads === 1 ? base : concurrent }
      },
      save: async () => {
        saved = true
        throw new Error('conflict should not save')
      },
    })
    expect(loads).toBeGreaterThan(1)
    expect(result.action).toBe('aborted')
    expect(saved).toBe(false)
    expect(payloadFromAttrs(databasePos(ed).node.attrs).sheet.rows[0]!.cells[name.id]).toBe('块内甲')
  })
})
