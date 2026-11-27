export const DATABASE_BLOCK_SYNC_EVENT = 'mm-database-block-sync'

export type DatabaseBlockSyncDirection = 'pull' | 'push' | 'safe'

export type DatabaseBlockSyncDetail = {
  direction: DatabaseBlockSyncDirection
  sheetNodeId: string
  pos: number
  /** 确认后允许覆盖另一侧尚未合并的改动。默认不覆盖。 */
  force?: boolean
}
