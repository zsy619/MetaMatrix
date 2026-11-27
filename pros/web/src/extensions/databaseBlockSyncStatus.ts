import type { SheetDrift } from './databaseBlockSheet'

export const DATABASE_BLOCK_STATUS_EVENT = 'mm-database-block-status'

export type DatabaseBlockSyncStatus = {
  drift: SheetDrift
  checkedAt: number
}

const statuses = new Map<string, DatabaseBlockSyncStatus>()

export function databaseBlockSyncKey(blockId: string, sheetNodeId: string): string {
  return `${blockId}::${sheetNodeId}`
}

export function getDatabaseBlockSyncStatus(key: string): DatabaseBlockSyncStatus | undefined {
  return statuses.get(key)
}

export function setDatabaseBlockSyncStatus(key: string, drift: SheetDrift) {
  const trimmed = (key || '').trim()
  if (!trimmed) return
  const next: DatabaseBlockSyncStatus = { drift, checkedAt: Date.now() }
  statuses.set(trimmed, next)
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(DATABASE_BLOCK_STATUS_EVENT, { detail: { key: trimmed, drift } }),
    )
  }
}

export function clearDatabaseBlockSyncStatus(key?: string) {
  if (key) statuses.delete(key)
  else statuses.clear()
}

export function describeSheetDrift(drift: SheetDrift): string {
  switch (drift) {
    case 'in-sync':
      return '与知识库表格一致'
    case 'local-only':
      return '有未写回改动'
    case 'remote-only':
      return '树上有更新'
    case 'both':
      return '两边都改过'
    default:
      return '尚未对照'
  }
}
