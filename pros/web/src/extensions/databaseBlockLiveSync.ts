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
/** 打开文档后、对照已收敛时的轮询周期。仍是快照对照，不是 CRDT。 */
export const LIVE_SYNC_POLL_MS = 3000
/** 可写文档上的主动轮询，让另一端尽快看到树上表的新快照。 */
export const LIVE_SYNC_ACTIVE_MS = 1000
/** 对照后仍有分叉或单边改动时的追赶周期。 */
export const LIVE_SYNC_CATCHUP_MS = 800

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


/** 本次对照后是否还需要更快追赶：仍有单边/双边分叉，或刚发生了拉取/写回/合并。 */
export function shouldCatchUpPoll(summary: DatabaseBlockSafeSyncSummary | null | undefined): boolean {
  if (!summary) return false
  if (summary.pulled > 0 || summary.pushed > 0 || summary.merged > 0) return true
  return summary.probed.some((item) => item.drift === 'remote-only' || item.drift === 'local-only' || item.drift === 'both')
}

/** 选定下一轮轮询间隔：仍分叉则追赶，可写则主动对照，只读且已收敛则回到空闲周期。 */
export function nextLiveSyncPollMs(opts: {
  summary?: DatabaseBlockSafeSyncSummary | null
  canWrite: boolean
  idleMs?: number
  activeMs?: number
  catchUpMs?: number
}): number {
  const idleMs = opts.idleMs ?? LIVE_SYNC_POLL_MS
  const activeMs = opts.activeMs ?? LIVE_SYNC_ACTIVE_MS
  const catchUpMs = opts.catchUpMs ?? LIVE_SYNC_CATCHUP_MS
  if (shouldCatchUpPoll(opts.summary)) return catchUpMs
  if (opts.canWrite) return activeMs
  return idleMs
}

export type LiveLinkedDatabaseSync = {
  notifyLocalChange: () => void
  arm: () => void
  disarm: () => void
  tick: () => Promise<DatabaseBlockSafeSyncSummary | null>
  inFlight: () => boolean
  armed: () => boolean
  currentPollMs: () => number
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
  activeMs?: number
  catchUpMs?: number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (id: unknown) => void
  setIntervalFn?: (fn: () => void, ms: number) => unknown
  clearIntervalFn?: (id: unknown) => void
}): LiveLinkedDatabaseSync {
  const debounceMs = opts.debounceMs ?? LIVE_SYNC_DEBOUNCE_MS
  const pollMs = opts.pollMs ?? LIVE_SYNC_POLL_MS
  const activeMs = opts.activeMs ?? LIVE_SYNC_ACTIVE_MS
  const catchUpMs = opts.catchUpMs ?? LIVE_SYNC_CATCHUP_MS
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
  let pollEvery = pollMs

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
    }
  }

  async function runAndAdjust(): Promise<DatabaseBlockSafeSyncSummary | null> {
    const summary = await run()
    if (pending) {
      pending = false
      return runAndAdjust()
    }
    if (isArmed) {
      const next = nextLiveSyncPollMs({
        summary,
        canWrite: opts.canWrite(),
        idleMs: pollMs,
        activeMs,
        catchUpMs,
      })
      startPoll(next)
    }
    return summary
  }

  function startPoll(ms: number) {
    if (!isArmed) return
    if (pollTimer && pollEvery === ms) return
    if (pollTimer) clearIntervalFn(pollTimer)
    pollEvery = ms
    pollTimer = setIntervalFn(() => {
      void runAndAdjust()
    }, ms)
  }

  function schedule() {
    if (!isArmed) return
    if (debounceTimer) clearTimeoutFn(debounceTimer)
    debounceTimer = setTimeoutFn(() => {
      debounceTimer = null
      void runAndAdjust()
    }, debounceMs)
  }

  return {
    notifyLocalChange: schedule,
    arm() {
      if (isArmed) return
      isArmed = true
      const initial = nextLiveSyncPollMs({
        canWrite: opts.canWrite(),
        idleMs: pollMs,
        activeMs,
        catchUpMs,
      })
      startPoll(initial)
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
    tick: runAndAdjust,
    inFlight: () => running,
    armed: () => isArmed,
    currentPollMs: () => pollEvery,
  }
}
