export const DATABASE_BLOCK_SYNC_EVENT = 'mm-database-block-sync'

export type DatabaseBlockSyncDetail = {
  direction: 'pull' | 'push'
  sheetNodeId: string
  pos: number
}
