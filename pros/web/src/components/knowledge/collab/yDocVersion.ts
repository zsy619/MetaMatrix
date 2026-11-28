import * as Y from 'yjs'
import { decodeYUpdate, encodeYUpdate } from './yDocCollab'

export type YjsVersionBlob = {
  /** 自包含整包状态（Y.encodeStateAsUpdate），可在空文档上独立恢复。 */
  state: string
  /** Y.encodeSnapshot。只有保留了历史的同源文档才能用它做版本回溯，不能当成完整版本树。 */
  snapshot: string
}

/** 同时记下整包状态和 Yjs Snapshot，恢复时优先用 state。 */
export function captureYjsVersion(doc: Y.Doc): YjsVersionBlob {
  return {
    state: encodeYUpdate(Y.encodeStateAsUpdate(doc)),
    snapshot: encodeYUpdate(Y.encodeSnapshot(Y.snapshot(doc))),
  }
}

/** 用自包含整包恢复到新的 Y.Doc。 */
export function restoreYDocFromState(state: string | Uint8Array): Y.Doc {
  const doc = new Y.Doc()
  const update = typeof state === 'string' ? decodeYUpdate(state) : state
  Y.applyUpdate(doc, update)
  return doc
}

/**
 * 尝试用 Y.Snapshot 从仍保留历史的 origin 文档恢复。
 * 已 GC 或不是同源文档时返回 null，调用方应退回 restoreYDocFromState。
 */
export function tryRestoreFromYSnapshot(origin: Y.Doc, snapshot: string | Uint8Array): Y.Doc | null {
  try {
    const raw = typeof snapshot === 'string' ? decodeYUpdate(snapshot) : snapshot
    const snap = Y.decodeSnapshot(raw)
    return Y.createDocFromSnapshot(origin, snap)
  } catch {
    return null
  }
}

export function readYjsStateFromPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const state = (data as { yjsState?: unknown }).yjsState
  return typeof state === 'string' && state.trim() ? state.trim() : null
}
