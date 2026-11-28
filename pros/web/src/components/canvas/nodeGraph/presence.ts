/**
 * 同浏览器多标签的在线协作（BroadcastChannel）。
 *
 * 跨设备的实时协作需要后端 WebSocket，这里先把「同一账号多个标签」
 * 的光标与在线成员跑通，接口保持一样，后续换传输层不用改 UI。
 */
export type PeerCursor = { id: string; name: string; color: string; x: number; y: number; at: number }

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2']

export function peerColor(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997
  return COLORS[hash % COLORS.length]
}

export type Presence = {
  send: (x: number, y: number) => void
  destroy: () => void
}

type PresenceMessage = {
  kind: 'cursor' | 'leave'
  peer: PeerCursor
}

/** 建立在线状态通道；onPeers 收到当前所有在线成员（不含自己）。 */
export function createPresence(
  room: string,
  me: { id: string; name: string },
  onPeers: (peers: PeerCursor[]) => void,
): Presence {
  if (typeof BroadcastChannel === 'undefined') {
    return { send: () => undefined, destroy: () => undefined }
  }
  const channel = new BroadcastChannel('metamatrix:presence:' + room)
  const peers = new Map<string, PeerCursor>()
  const color = peerColor(me.id)

  const publish = () => onPeers([...peers.values()])

  channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
    const message = event.data
    if (!message?.peer || message.peer.id === me.id) return
    if (message.kind === 'leave') peers.delete(message.peer.id)
    else peers.set(message.peer.id, message.peer)
    publish()
  }

  const send = (x: number, y: number) => {
    const message: PresenceMessage = {
      kind: 'cursor',
      peer: { id: me.id, name: me.name, color, x, y, at: Date.now() },
    }
    channel.postMessage(message)
  }

  // 过期成员自动下线：5 秒没心跳就当离开。
  const timer = setInterval(() => {
    const now = Date.now()
    let changed = false
    for (const [id, peer] of peers) {
      if (now - peer.at > 5000) {
        peers.delete(id)
        changed = true
      }
    }
    if (changed) publish()
  }, 2000)

  return {
    send,
    destroy: () => {
      clearInterval(timer)
      channel.postMessage({ kind: 'leave', peer: { id: me.id, name: me.name, color, x: 0, y: 0, at: Date.now() } })
      channel.close()
    },
  }
}
