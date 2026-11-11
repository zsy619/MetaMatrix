import type { Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const gestures = new WeakMap<EditorView, Map<string, { id: number; at: number }>>()

/**
 * 同一类连续操作共用一个 composition 标记。
 * ProseMirror 会把带相同 composition 的事务收成一步撤销。
 */
export function gestureComposition(view: EditorView, key: string, windowMs = 1500): number {
  let bucket = gestures.get(view)
  if (!bucket) {
    bucket = new Map()
    gestures.set(view, bucket)
  }
  const now = Date.now()
  const prev = bucket.get(key)
  if (prev && now - prev.at < windowMs) {
    prev.at = now
    return prev.id
  }
  const id = now
  bucket.set(key, { id, at: now })
  return id
}

export function stampGesture(tr: Transaction, id: number): Transaction {
  return tr.setMeta('composition', id)
}
