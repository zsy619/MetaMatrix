import { NodeSelection } from '@tiptap/pm/state'
import { migrateSheet, type SheetData } from '../components/knowledge/sheetModel'
import type { DatabaseBlockSyncDetail } from './databaseBlockEvents'
import { DATABASE_BLOCK_NAME } from './databaseBlockSheet'
import { countViewFilters, payloadFromAttrs, pushSheetFromPayload } from './databaseBlockSheet'

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

export async function syncLinkedDatabaseBlock(
  editor: DatabaseBlockSyncEditor,
  projectId: string,
  detail: DatabaseBlockSyncDetail,
  io: DatabaseBlockSyncIo,
): Promise<{ action: 'pulled' | 'pushed'; droppedFilters: number }> {
  const sheetNodeId = (detail.sheetNodeId || '').trim()
  if (!sheetNodeId) throw new Error('未关联知识库表格')
  const node = editor.state.doc.nodeAt(detail.pos)
  if (!node || node.type.name !== DATABASE_BLOCK_NAME) throw new Error('找不到内嵌数据库块')
  const remote = await io.load(projectId, sheetNodeId)
  if (remote.kind && remote.kind !== 'sheet') throw new Error('关联节点不是多维表格')
  const tree = migrateSheet(remote.data)
  if (detail.direction === 'pull') {
    const before = countViewFilters(payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string }).sheet)
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc as never, detail.pos))
    editor.view.dispatch(tr)
    if (!editor.commands.importDatabaseBlockSheet(tree)) throw new Error('拉取到内嵌块失败')
    const afterNode = editor.state.doc.nodeAt(detail.pos)
    const after = afterNode && afterNode.type.name === DATABASE_BLOCK_NAME
      ? countViewFilters(payloadFromAttrs(afterNode.attrs as { sheet?: string; viewType?: string }).sheet)
      : before
    return { action: 'pulled', droppedFilters: Math.max(0, before - after) }
  }
  const next = pushSheetFromPayload(payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string }), tree)
  await io.save(projectId, sheetNodeId, 'sheet', next)
  return { action: 'pushed', droppedFilters: 0 }
}
