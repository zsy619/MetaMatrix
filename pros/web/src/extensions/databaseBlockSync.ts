import { NodeSelection } from '@tiptap/pm/state'
import { migrateSheet, type SheetData } from '../components/knowledge/sheetModel'
import { readBlockId } from './blockIdentity'
import type { DatabaseBlockSyncDetail, DatabaseBlockSyncDirection } from './databaseBlockEvents'
import { DATABASE_BLOCK_NAME } from './databaseBlockSheet'
import {
  classifySheetDrift,
  classifySheetThreeWay,
  countViewFilters,
  mergeSheetNonOverlapping,
  payloadFromAttrs,
  pushSheetFromPayload,
  sheetContentFingerprint,
  summarizeSheetContentConflict,
  type SheetContentConflictSummary,
  type SheetDrift,
  unsafeSyncDirection,
} from './databaseBlockSheet'
import {
  databaseBlockSyncKey,
  setDatabaseBlockSyncStatus,
} from './databaseBlockSyncStatus'

export type DatabaseBlockSyncIo = {
  load: (projectId: string, nodeId: string) => Promise<{ kind?: string; data: unknown }>
  save: (projectId: string, nodeId: string, kind: string, data: unknown) => Promise<unknown>
}

export type DatabaseBlockSyncEditor = {
  state: {
    doc: {
      nodeAt: (pos: number) => { type: { name: string }; attrs: Record<string, unknown> } | null
      descendants?: (fn: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => boolean | void) => void
    }
    tr: any
  }
  view: { dispatch: (tr: any) => void }
  commands: {
    importDatabaseBlockSheet: (sheet: SheetData) => boolean
  }
}

export type DatabaseBlockProbe = {
  pos: number
  blockId: string
  sheetNodeId: string
  drift: SheetDrift
  conflict?: SheetContentConflictSummary
}

type LinkedDatabaseBlock = {
  pos: number
  blockId: string
  sheetNodeId: string
  attrs: Record<string, unknown>
}

function listLinkedDatabaseBlocks(editor: DatabaseBlockSyncEditor): LinkedDatabaseBlock[] {
  const out: LinkedDatabaseBlock[] = []
  const visit = (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => {
    if (node.type.name !== DATABASE_BLOCK_NAME) return
    const sheetNodeId = String(node.attrs.sheetNodeId || '').trim()
    if (!sheetNodeId) return
    out.push({
      pos,
      blockId: readBlockId(node as never) || String(node.attrs.dataBlockId || ''),
      sheetNodeId,
      attrs: node.attrs,
    })
  }
  if (typeof editor.state.doc.descendants === 'function') {
    editor.state.doc.descendants((node, pos) => {
      visit(node, pos)
      return true
    })
  }
  return out
}

function recordStatus(
  blockId: string,
  sheetNodeId: string,
  drift: SheetDrift,
  conflict?: SheetContentConflictSummary,
) {
  setDatabaseBlockSyncStatus(databaseBlockSyncKey(blockId, sheetNodeId), drift, conflict)
}

function conflictIfBoth(
  drift: SheetDrift,
  local: Parameters<typeof summarizeSheetContentConflict>[0],
  remote: Parameters<typeof summarizeSheetContentConflict>[1],
  syncedFp?: string | null,
) {
  if (drift !== 'both') return undefined
  const summary = summarizeSheetContentConflict(local, remote)
  const threeWay = classifySheetThreeWay(local, remote, syncedFp)
  return threeWay ? { ...summary, threeWay } : summary
}

function resolveDirection(requested: DatabaseBlockSyncDirection, drift: SheetDrift): DatabaseBlockSyncDirection | 'noop' {
  if (requested !== 'safe') return requested
  if (drift === 'remote-only') return 'pull'
  if (drift === 'local-only') return 'push'
  if (drift === 'in-sync') return 'noop'
  return 'safe'
}

export type DatabaseBlockSyncResult = {
  action: 'pulled' | 'pushed' | 'merged' | 'aborted' | 'noop'
  droppedFilters: number
  diverged: boolean
  drift: SheetDrift
  conflict?: SheetContentConflictSummary
}

function writeSyncedFp(editor: DatabaseBlockSyncEditor, pos: number, fp: string) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== DATABASE_BLOCK_NAME) return
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, syncedFp: fp }))
}

export async function syncLinkedDatabaseBlock(
  editor: DatabaseBlockSyncEditor,
  projectId: string,
  detail: DatabaseBlockSyncDetail,
  io: DatabaseBlockSyncIo,
): Promise<DatabaseBlockSyncResult> {
  const sheetNodeId = (detail.sheetNodeId || '').trim()
  if (!sheetNodeId) throw new Error('未关联知识库表格')
  const node = editor.state.doc.nodeAt(detail.pos)
  if (!node || node.type.name !== DATABASE_BLOCK_NAME) throw new Error('找不到内嵌数据库块')
  const remote = await io.load(projectId, sheetNodeId)
  if (remote.kind && remote.kind !== 'sheet') throw new Error('关联节点不是多维表格')
  const tree = migrateSheet(remote.data)
  const local = payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string }).sheet
  const drift = classifySheetDrift(local, tree, String(node.attrs.syncedFp || ''))
  const diverged = drift === 'both'
  const conflict = conflictIfBoth(drift, local, tree, String(node.attrs.syncedFp || ''))
  const resolved = resolveDirection(detail.direction, drift)
  if (resolved === 'noop') {
    recordStatus(readBlockId(node as never) || String(node.attrs.dataBlockId || ''), sheetNodeId, drift, conflict)
    return { action: 'noop', droppedFilters: 0, diverged: false, drift, ...(conflict ? { conflict } : {}) }
  }
  if (resolved === 'safe' && drift === 'both') {
    const merged = mergeSheetNonOverlapping(local, tree, String(node.attrs.syncedFp || ''))
    if (!merged) {
      recordStatus(readBlockId(node as never) || String(node.attrs.dataBlockId || ''), sheetNodeId, drift, conflict)
      return { action: 'aborted', droppedFilters: 0, diverged, drift, ...(conflict ? { conflict } : {}) }
    }
    const before = countViewFilters(local)
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc as never, detail.pos))
    editor.view.dispatch(tr)
    if (!editor.commands.importDatabaseBlockSheet(merged)) throw new Error('合并到内嵌块失败')
    const afterNode = editor.state.doc.nodeAt(detail.pos)
    const afterPayload = afterNode && afterNode.type.name === DATABASE_BLOCK_NAME
      ? payloadFromAttrs(afterNode.attrs as { sheet?: string; viewType?: string })
      : payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string })
    const after = countViewFilters(afterPayload.sheet)
    const next = pushSheetFromPayload(afterPayload, tree)
    await io.save(projectId, sheetNodeId, 'sheet', next)
    writeSyncedFp(editor, detail.pos, sheetContentFingerprint(next))
    recordStatus(readBlockId(node as never) || String(node.attrs.dataBlockId || ''), sheetNodeId, 'in-sync')
    return { action: 'merged', droppedFilters: Math.max(0, before - after), diverged, drift }
  }
  if (resolved === 'safe' || (!detail.force && unsafeSyncDirection(resolved, drift))) {
    recordStatus(readBlockId(node as never) || String(node.attrs.dataBlockId || ''), sheetNodeId, drift, conflict)
    return { action: 'aborted', droppedFilters: 0, diverged, drift, ...(conflict ? { conflict } : {}) }
  }
  const direction = resolved
  if (direction === 'pull') {
    const before = countViewFilters(local)
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc as never, detail.pos))
    editor.view.dispatch(tr)
    if (!editor.commands.importDatabaseBlockSheet(tree)) throw new Error('拉取到内嵌块失败')
    const afterNode = editor.state.doc.nodeAt(detail.pos)
    const afterPayload = afterNode && afterNode.type.name === DATABASE_BLOCK_NAME
      ? payloadFromAttrs(afterNode.attrs as { sheet?: string; viewType?: string })
      : null
    const after = afterPayload ? countViewFilters(afterPayload.sheet) : before
    writeSyncedFp(editor, detail.pos, sheetContentFingerprint(tree))
    recordStatus(readBlockId(node as never) || String(node.attrs.dataBlockId || ''), sheetNodeId, 'in-sync')
    return { action: 'pulled', droppedFilters: Math.max(0, before - after), diverged, drift }
  }
  const next = pushSheetFromPayload(payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string }), tree)
  await io.save(projectId, sheetNodeId, 'sheet', next)
  writeSyncedFp(editor, detail.pos, sheetContentFingerprint(next))
  recordStatus(readBlockId(node as never) || String(node.attrs.dataBlockId || ''), sheetNodeId, 'in-sync')
  return { action: 'pushed', droppedFilters: 0, diverged, drift }
}


export async function probeLinkedDatabaseBlocks(
  editor: DatabaseBlockSyncEditor,
  projectId: string,
  io: DatabaseBlockSyncIo,
): Promise<DatabaseBlockProbe[]> {
  const out: DatabaseBlockProbe[] = []
  for (const item of listLinkedDatabaseBlocks(editor)) {
    try {
      const remote = await io.load(projectId, item.sheetNodeId)
      if (remote.kind && remote.kind !== 'sheet') {
        recordStatus(item.blockId, item.sheetNodeId, 'unknown')
        out.push({ pos: item.pos, blockId: item.blockId, sheetNodeId: item.sheetNodeId, drift: 'unknown' })
        continue
      }
      const tree = migrateSheet(remote.data)
      const local = payloadFromAttrs(item.attrs as { sheet?: string; viewType?: string }).sheet
      const drift = classifySheetDrift(local, tree, String(item.attrs.syncedFp || ''))
      const conflict = conflictIfBoth(drift, local, tree, String(item.attrs.syncedFp || ''))
      recordStatus(item.blockId, item.sheetNodeId, drift, conflict)
      out.push({ pos: item.pos, blockId: item.blockId, sheetNodeId: item.sheetNodeId, drift, conflict })
    } catch {
      recordStatus(item.blockId, item.sheetNodeId, 'unknown')
      out.push({ pos: item.pos, blockId: item.blockId, sheetNodeId: item.sheetNodeId, drift: 'unknown' })
    }
  }
  return out
}

export type DatabaseBlockSafeSyncSummary = {
  probed: DatabaseBlockProbe[]
  pulled: number
  pushed: number
  merged: number
  skipped: number
}

function currentLinkedBlockPos(editor: DatabaseBlockSyncEditor, item: Pick<DatabaseBlockProbe, 'pos' | 'blockId' | 'sheetNodeId'>): number | null {
  const blocks = listLinkedDatabaseBlocks(editor)
  const exact = blocks.find((block) => block.blockId === item.blockId && block.sheetNodeId === item.sheetNodeId)
  if (exact) return exact.pos
  const bySheet = blocks.find((block) => block.sheetNodeId === item.sheetNodeId)
  if (bySheet) return bySheet.pos
  const node = editor.state.doc.nodeAt(item.pos)
  if (node && node.type.name === DATABASE_BLOCK_NAME) return item.pos
  return null
}

/** 对照后自动处理单边改动：树上有更新则拉取，仅内嵌改过则写回。两边都改过时，不相交的字段/行/单元格会合并到两边；相交冲突或尚未对照仍不覆盖。不是实时双向同步。 */
export async function applySafeLinkedDatabaseBlocks(
  editor: DatabaseBlockSyncEditor,
  projectId: string,
  io: DatabaseBlockSyncIo,
  probes?: DatabaseBlockProbe[],
): Promise<DatabaseBlockSafeSyncSummary> {
  const probed = probes ?? await probeLinkedDatabaseBlocks(editor, projectId, io)
  let pulled = 0
  let pushed = 0
  let merged = 0
  let skipped = 0
  for (const item of probed) {
    if (item.drift !== 'remote-only' && item.drift !== 'local-only' && item.drift !== 'both') {
      skipped += 1
      continue
    }
    const pos = currentLinkedBlockPos(editor, item)
    if (pos == null) {
      skipped += 1
      continue
    }
    const result = await syncLinkedDatabaseBlock(editor, projectId, {
      direction: 'safe',
      sheetNodeId: item.sheetNodeId,
      pos,
    }, io)
    if (result.action === 'pulled') pulled += 1
    else if (result.action === 'pushed') pushed += 1
    else if (result.action === 'merged') merged += 1
    else skipped += 1
  }
  return { probed, pulled, pushed, merged, skipped }
}

