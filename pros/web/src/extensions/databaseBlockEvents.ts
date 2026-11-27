export const DATABASE_BLOCK_SYNC_EVENT = 'mm-database-block-sync'

export type DatabaseBlockSyncDetail = {
  direction: 'pull' | 'push'
  sheetNodeId: string
  pos: number
  /** 两边都改过时，确认后覆盖。默认不覆盖。 */
  force?: boolean
}
