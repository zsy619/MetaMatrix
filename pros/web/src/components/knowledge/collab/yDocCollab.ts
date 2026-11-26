import * as Y from 'yjs'

const REMOTE_ORIGIN = 'remote'

export function createCollabYDoc(): Y.Doc {
  return new Y.Doc()
}

/** 把 Yjs 更新编成 base64，供 WebSocket / HTTP 操作日志传输。 */
export function encodeYUpdate(update: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < update.length; i += 1) {
    binary += String.fromCharCode(update[i]!)
  }
  return btoa(binary)
}

export function decodeYUpdate(payload: string): Uint8Array {
  const binary = atob(payload)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

/** 应用远端增量。origin 标成 remote，避免再回传给发送方。 */
export function applyRemoteUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update, REMOTE_ORIGIN)
}

export function bindLocalUpdates(doc: Y.Doc, send: (update: Uint8Array) => void): () => void {
  const handler = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return
    send(update)
  }
  doc.on('update', handler)
  return () => {
    doc.off('update', handler)
  }
}

export function collabSocketURL(
  documentId: string,
  token: string,
  opts?: { apiBase?: string; location?: { protocol: string; host: string } },
): string {
  const base = (opts?.apiBase ?? (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api').replace(/\/$/, '')
  const path = `${base}/documents/${encodeURIComponent(documentId)}/collab?token=${encodeURIComponent(token)}`
  if (/^https?:\/\//i.test(path)) {
    return path.replace(/^http/i, 'ws')
  }
  const loc = opts?.location ?? (typeof location === 'undefined' ? { protocol: 'http:', host: 'localhost' } : location)
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.host}${path.startsWith('/') ? path : `/${path}`}`
}

export type CollabSocket = {
  send: (data: string) => void
  close: () => void
  readyState: number
  addEventListener: (type: string, listener: (ev: Event) => void) => void
  removeEventListener: (type: string, listener: (ev: Event) => void) => void
}

export type LiveCollabOptions = {
  documentId: string
  token: string
  ydoc: Y.Doc
  htmlProvider?: () => string
  onError?: (err: Error) => void
  onPresence?: (users: unknown[]) => void
  socketURL?: string
  socketFactory?: (url: string) => CollabSocket
}

/**
 * 把本地 Y.Doc 接到 Hertz 协同通道：发送本地增量（可附 HTML 供服务端双写），
 * 并应用远端 ops / update。不修改旧的 HTML 级 crdtDoc 旁路。
 */
export class LiveCollabSession {
  private readonly opts: LiveCollabOptions
  private socket: CollabSocket | null = null
  private unbind: (() => void) | null = null
  private opened = false

  constructor(opts: LiveCollabOptions) {
    this.opts = opts
  }

  async start(): Promise<void> {
    const url = this.opts.socketURL ?? collabSocketURL(this.opts.documentId, this.opts.token)
    const factory = this.opts.socketFactory ?? ((u: string) => new WebSocket(u) as CollabSocket)
    const socket = factory(url)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        this.opened = true
        resolve()
      }
      const onError = () => {
        this.opts.onError?.(new Error('collab socket error'))
        reject(new Error('collab socket error'))
      }
      socket.addEventListener('open', onOpen)
      socket.addEventListener('error', onError)
      socket.addEventListener('message', (ev: Event) => {
        const data = (ev as MessageEvent).data
        this.handleMessage(typeof data === 'string' ? data : '')
      })
    })
    this.unbind = bindLocalUpdates(this.opts.ydoc, (update) => {
      this.sendJSON({
        type: 'update',
        kind: 'update',
        payload: encodeYUpdate(update),
        html: this.opts.htmlProvider?.() ?? '',
      })
    })
    this.sendJSON({ type: 'sync', after: 0 })
  }

  noteHtml(_html: string): void {
    // HTML 随下一条 Yjs update 一起发给服务端做 current_data 双写；
    // 这里保留方法，方便宿主在 onHtml 里显式刷新快照来源。
  }

  stop(): void {
    this.unbind?.()
    this.unbind = null
    try {
      this.socket?.close()
    } catch {
      /* ignore */
    }
    this.socket = null
    this.opened = false
  }

  private sendJSON(body: Record<string, unknown>): void {
    if (!this.socket || !this.opened) return
    this.socket.send(JSON.stringify(body))
  }

  private handleMessage(raw: string): void {
    if (!raw) return
    let msg: { type?: string; ops?: { payload?: string }[]; op?: { payload?: string }; payload?: string; users?: unknown[]; message?: string }
    try {
      msg = JSON.parse(raw) as typeof msg
    } catch {
      return
    }
    if (msg.type === 'ops' && Array.isArray(msg.ops)) {
      for (const op of msg.ops) {
        if (op.payload) applyRemoteUpdate(this.opts.ydoc, decodeYUpdate(op.payload))
      }
      return
    }
    if (msg.type === 'update') {
      const payload = msg.op?.payload ?? msg.payload
      if (payload) applyRemoteUpdate(this.opts.ydoc, decodeYUpdate(payload))
      return
    }
    if (msg.type === 'presence' && msg.users) {
      this.opts.onPresence?.(msg.users)
      return
    }
    if (msg.type === 'error' && msg.message) {
      this.opts.onError?.(new Error(msg.message))
    }
  }
}
