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

export type RestoredVersion = {
  html: string
  yjsState?: string | null
}

/** 历史页既可能只回 HTML，也可能带 yjsState。调用方应先退出实时协同再应用，避免服务端较新增量把恢复覆盖。 */
export function parseRestoredVersion(payload: RestoredVersion | string | null | undefined): RestoredVersion {
  if (typeof payload === 'string') return { html: payload }
  if (!payload || typeof payload !== 'object') return { html: '' }
  const html = typeof payload.html === 'string' ? payload.html : ''
  const yjsState = readYjsStateFromPayload(payload)
  return yjsState ? { html, yjsState } : { html }
}

/** 恢复时先退出协同，再交给调用方写入 HTML / yjsState。 */
export function planVersionRestore(
  collabOn: boolean,
  payload: RestoredVersion | string | null | undefined,
): { stopCollab: boolean; html: string; yjsState?: string } {
  const restored = parseRestoredVersion(payload)
  return {
    stopCollab: Boolean(collabOn),
    html: restored.html,
    ...(restored.yjsState ? { yjsState: restored.yjsState } : {}),
  }
}

/** 仅当正文仍是恢复出来的 HTML 时附带 yjsState，避免用户改稿后把旧协同快照写回去。 */
export function attachRestoredYjsState<T extends { html: string }>(
  payload: T,
  restored: { html: string; yjsState?: string | null } | null | undefined,
): T & { yjsState?: string } {
  const state = restored?.yjsState?.trim()
  if (!state || payload.html !== restored?.html) return payload
  return { ...payload, yjsState: state }
}
