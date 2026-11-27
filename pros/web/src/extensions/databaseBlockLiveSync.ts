import type { SheetData } from '../components/knowledge/sheetModel'
import { DATABASE_BLOCK_NAME, payloadFromAttrs, sheetContentFingerprint } from './databaseBlockSheet'
import {
  applySafeLinkedDatabaseBlocks,
  probeLinkedDatabaseBlocks,
  type DatabaseBlockSafeSyncSummary,
  type DatabaseBlockSyncEditor,
  type DatabaseBlockSyncIo,
} from './databaseBlockSync'

/** 本地改动后的抖动间隔：尽快对照，但避免每个单元格按键都打接口。 */
export const LIVE_SYNC_DEBOUNCE_MS = 400
/** 打开文档后的对照周期，比原先 15s 更密，仍是轮询快照，不是 CRDT。 */
export const LIVE_SYNC_POLL_MS = 3000

export type LinkedSheetSnapshot = Record<string, string>

export function snapshotLinkedSheets(doc: {
  descendants?: (fn: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => boolean | void) => void
}): LinkedSheetSnapshot {
  const out: LinkedSheetSnapshot = {}
  if (typeof doc.descendants !== 'function') return out
  doc.descendants((node) => {
    if (node.type.name !== DATABASE_BLOCK_NAME) return
    const sheetNodeId = String(node.attrs.sheetNodeId || '').trim()
    if (!sheetNodeId) return
    const blockId = String(node.attrs.dataBlockId || node.attrs.blockId || '')
    const key = `${blockId}::${sheetNodeId}`
    const payload = payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string })
    out[key] = sheetContentFingerprint(payload.sheet as SheetData)
  })
  return out
}

/** 事务是否改了关联表的内容（忽略只更新 syncedFp 的同步回写，避免循环对照）。 */
function asSnapshotDoc(value: unknown): Parameters<typeof snapshotLinkedSheets>[0] | null {
  if (!value || typeof value !== 'object') return null
  return value as Parameters<typeof snapshotLinkedSheets>[0]
}

export function transactionTouchesLinkedSheet(tr: {
  docChanged?: boolean
  before?: unknown
  doc?: unknown
}): boolean {
  if (!tr.docChanged) return false
  const beforeDoc = asSnapshotDoc(tr.before)
  const afterDoc = asSnapshotDoc(tr.doc)
  if (!beforeDoc || !afterDoc) return false
  const before = snapshotLinkedSheets(beforeDoc)
  const after = snapshotLinkedSheets(afterDoc)
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (before[key] !== after[key]) return true
  }
  return false
}

export type LiveLinkedDatabaseSync = {
  notifyLocalChange: () => void
  arm: () => void
  disarm: () => void
  tick: () => Promise<DatabaseBlockSafeSyncSummary | null>
  inFlight: () => boolean
  armed: () => boolean
}

export function createLiveLinkedDatabaseSync(opts: {
  getEditor: () => DatabaseBlockSyncEditor | null | undefined
  projectId: () => string | undefined
  io: DatabaseBlockSyncIo
  canWrite: () => boolean
  apply?: typeof applySafeLinkedDatabaseBlocks
  probe?: typeof probeLinkedDatabaseBlocks
  debounceMs?: number
  pollMs?: number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (id: unknown) => void
  setIntervalFn?: (fn: () => void, ms: number) => unknown
  clearIntervalFn?: (id: unknown) => void
}): LiveLinkedDatabaseSync {
  const debounceMs = opts.debounceMs ?? LIVE_SYNC_DEBOUNCE_MS
  const pollMs = opts.pollMs ?? LIVE_SYNC_POLL_MS
  const setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimeoutFn = opts.clearTimeoutFn ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
  const setIntervalFn = opts.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms))
  const clearIntervalFn = opts.clearIntervalFn ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>))
  const apply = opts.apply ?? applySafeLinkedDatabaseBlocks
  const probe = opts.probe ?? probeLinkedDatabaseBlocks

  let debounceTimer: unknown = null
  let pollTimer: unknown = null
  let running = false
  let pending = false
  let isArmed = false

  async function run(): Promise<DatabaseBlockSafeSyncSummary | null> {
    if (running) {
      pending = true
      return null
    }
    const editor = opts.getEditor()
    const projectId = opts.projectId()
    if (!editor || !projectId) return null
    running = true
    try {
      if (!opts.canWrite()) {
        const probed = await probe(editor, projectId, opts.io)
        return { probed, pulled: 0, pushed: 0, merged: 0, skipped: probed.length }
      }
      return await apply(editor, projectId, opts.io)
    } finally {
      running = false
      if (pending) {
        pending = false
        void run()
      }
    }
  }

  function schedule() {
    if (!isArmed) return
    if (debounceTimer) clearTimeoutFn(debounceTimer)
    debounceTimer = setTimeoutFn(() => {
      debounceTimer = null
      void run()
    }, debounceMs)
  }

  return {
    notifyLocalChange: schedule,
    arm() {
      if (isArmed) return
      isArmed = true
      pollTimer = setIntervalFn(() => {
        void run()
      }, pollMs)
    },
    disarm() {
      isArmed = false
      pending = false
      if (debounceTimer) {
        clearTimeoutFn(debounceTimer)
        debounceTimer = null
      }
      if (pollTimer) {
        clearIntervalFn(pollTimer)
        pollTimer = null
      }
    },
    tick: run,
    inFlight: () => running,
    armed: () => isArmed,
  }
}
