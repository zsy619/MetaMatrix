import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'

/** 协作者光标/选区配色。必须是 #RRGGBB，CollaborationCaret 才会绘制选区。 */
export const COLLAB_CARET_COLORS = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0f766e',
  '#ea580c',
] as const

export type CollabCaretUser = {
  name: string
  color: string
  id?: string
}

export type CollabCaretProvider = {
  awareness: Awareness
}

export type RemoteCaretState = {
  clientId: number
  user?: CollabCaretUser
  cursor?: { anchor: unknown; head: unknown } | null
}

export type AwarenessMember = {
  clientId: number
  name: string
  color?: string
  id?: string
}

export function collabCaretColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return COLLAB_CARET_COLORS[hash % COLLAB_CARET_COLORS.length]!
}

/** 从 Yjs relative position 构造光标/选区，不依赖块表。 */
export function relativeCursor(
  doc: Y.Doc,
  field: string,
  anchor: number,
  head = anchor,
): { anchor: Y.RelativePosition; head: Y.RelativePosition } {
  const type = doc.getXmlFragment(field)
  return {
    anchor: Y.createRelativePositionFromTypeIndex(type, anchor),
    head: Y.createRelativePositionFromTypeIndex(type, head),
  }
}

/** 把本地 awareness 更新应用到另一端（测试或进程内对接）。 */
export function relayAwareness(from: Awareness, to: Awareness, clients?: number[]): void {
  const ids = clients ?? Array.from(from.getStates().keys())
  if (!ids.length) return
  applyAwarenessUpdate(to, encodeAwarenessUpdate(from, ids), 'remote')
}

/** 远端（不含自己）的光标与选区状态。 */
export function remoteCaretStates(
  awareness: Awareness,
  localClientId = awareness.clientID,
): RemoteCaretState[] {
  const out: RemoteCaretState[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === localClientId || !state) return
    const cursor = (state as { cursor?: { anchor: unknown; head: unknown } | null }).cursor
    const user = (state as { user?: CollabCaretUser }).user
    out.push({ clientId, user, cursor: cursor ?? null })
  })
  return out
}

/** 当前 awareness 里仍有状态的在线成员（含自己）。状态为 null 的已离房。 */
export function onlineAwarenessMembers(awareness: Awareness): AwarenessMember[] {
  const out: AwarenessMember[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (!state) return
    const user = (state as { user?: CollabCaretUser }).user
    out.push({
      clientId,
      name: user?.name ?? '',
      color: user?.color,
      id: user?.id,
    })
  })
  return out
}

/** 把已离房用户的远端光标/选区从 awareness 清掉，避免只更新名单后留下鬼光标。 */
export function pruneAwarenessByPresence(
  awareness: Awareness,
  presentUserIds: Iterable<string>,
  localClientId = awareness.clientID,
): number[] {
  const present = new Set(Array.from(presentUserIds).filter(Boolean))
  const stale: number[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === localClientId || !state) return
    const id = (state as { user?: { id?: string } }).user?.id
    if (!id || present.has(id)) return
    stale.push(clientId)
  })
  if (stale.length) removeAwarenessStates(awareness, stale, 'presence')
  return stale
}

export function presenceUserIds(users: unknown[]): string[] {
  const out: string[] = []
  for (const item of users) {
    if (!item || typeof item !== 'object') continue
    const id = (item as { userId?: unknown }).userId
    if (typeof id === 'string' && id) out.push(id)
  }
  return out
}

export { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates }
