import * as Y from 'yjs'

export type YDocGCResult = {
  snapshot: Uint8Array
  bytesBefore: number
  bytesAfter: number
  updateCount: number
}

/**
 * 把一组 Yjs 增量应用到开启 GC 的新文档，再编码成一份整包状态。
 * 这能丢掉已被 GC 的删除项内容，缩小操作日志；不是完整的文档历史 GC，
 * 也不能按任意时间点恢复已被删除的内容。
 */
export function compactYUpdates(updates: Uint8Array[]): YDocGCResult {
  const bytesBefore = updates.reduce((n, u) => n + u.byteLength, 0)
  const doc = new Y.Doc({ gc: true })
  try {
    doc.transact(() => {
      for (const update of updates) {
        Y.applyUpdate(doc, update)
      }
    })
    const snapshot = Y.encodeStateAsUpdate(doc)
    return {
      snapshot,
      bytesBefore,
      bytesAfter: snapshot.byteLength,
      updateCount: updates.length,
    }
  } finally {
    doc.destroy()
  }
}

/** 合并增量（不经过文档 GC）。空输入返回空包。 */
export function mergeYUpdates(updates: Uint8Array[]): Uint8Array {
  if (updates.length === 0) return new Uint8Array()
  if (updates.length === 1) return updates[0]!
  return Y.mergeUpdates(updates)
}
