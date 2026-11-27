import { NodeSelection } from '@tiptap/pm/state'
import { migrateSheet, type SheetData } from '../components/knowledge/sheetModel'
import type { DatabaseBlockSyncDetail } from './databaseBlockEvents'
import { DATABASE_BLOCK_NAME } from './databaseBlockSheet'
import {
  countViewFilters,
  payloadFromAttrs,
  pushSheetFromPayload,
  sheetContentFingerprint,
  sheetsDiverged,
} from './databaseBlockSheet'

export type DatabaseBlockSyncIo = {
  load: (projectId: string, nodeId: string) => Promise<{ kind?: string; data: unknown }>
  save: (projectId: string, nodeId: string, kind: string, data: unknown) => Promise<unknown>
}

export type DatabaseBlockSyncEditor = {
  state: { doc: { nodeAt: (pos: number) => { type: { name: string }; attrs: Record<string, unknown> } | null } ; tr: any }
  view: { dispatch: (tr: any) => void }
  commands: {
    importDatabaseBlockSheet: (sheet: SheetData) => boolean
  }
}

export type DatabaseBlockSyncResult = {
  action: 'pulled' | 'pushed' | 'aborted'
  droppedFilters: number
  diverged: boolean
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
  const diverged = sheetsDiverged(local, tree, String(node.attrs.syncedFp || ''))
  if (diverged && !detail.force) {
    return { action: 'aborted', droppedFilters: 0, diverged: true }
  }
  if (detail.direction === 'pull') {
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
    return { action: 'pulled', droppedFilters: Math.max(0, before - after), diverged }
  }
  const next = pushSheetFromPayload(payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string }), tree)
  await io.save(projectId, sheetNodeId, 'sheet', next)
  writeSyncedFp(editor, detail.pos, sheetContentFingerprint(next))
  return { action: 'pushed', droppedFilters: 0, diverged }
}
