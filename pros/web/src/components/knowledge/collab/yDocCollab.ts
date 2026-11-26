import * as Y from 'yjs'

const REMOTE_ORIGIN = 'remote'
const DEFAULT_HEARTBEAT_MS = 20_000
const DEFAULT_RECONNECT_BASE_MS = 500
const MAX_RECONNECT_MS = 10_000

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
  onHello?: (info: { canWrite: boolean; role: string }) => void
  socketURL?: string
  socketFactory?: (url: string) => CollabSocket
  /** 应用层心跳间隔。0 表示关闭（协议层 ping 仍由服务端发起）。 */
  heartbeatIntervalMs?: number
  /** 重连起始等待；成功连上后会清零。 */
  reconnectBaseMs?: number
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearSchedule?: (id: ReturnType<typeof setTimeout>) => void
}

/**
 * 把本地 Y.Doc 接到 Hertz 协同通道：发送本地增量（可附 HTML 供服务端双写），
 * 并应用远端 ops / update。断线后自动重连并先 sync 再冲刷待发增量。
 * 持久化离线队列（刷新页面后恢复）留给后续，本包只在会话内存里暂存未发出的更新。
 * 旧 HTML 级 crdtDoc 旁路已只读，新的协同编辑只走本通道。
 */
export class LiveCollabSession {
  private readonly opts: LiveCollabOptions
  private socket: CollabSocket | null = null
  private unbind: (() => void) | null = null
  private opened = false
  private stopped = false
  private lastSeq = 0
  private pending: Uint8Array[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  canWrite = true
  role = ''

  constructor(opts: LiveCollabOptions) {
    this.opts = opts
  }

  async start(): Promise<void> {
    this.stopped = false
    if (!this.unbind) {
      this.unbind = bindLocalUpdates(this.opts.ydoc, (update) => {
        if (!this.opened) {
          this.pending.push(update)
          return
        }
        this.sendUpdate(update)
      })
    }
    await this.connect()
  }

  noteHtml(_html: string): void {
    // HTML 随下一条 Yjs update 一起发给服务端做 current_data 双写；
    // 这里保留方法，方便宿主在 onHtml 里显式刷新快照来源。
  }

  stop(): void {
    this.stopped = true
    this.clearReconnect()
    this.clearHeartbeat()
    this.unbind?.()
    this.unbind = null
    try {
      this.socket?.close()
    } catch {
      /* ignore */
    }
    this.socket = null
    this.opened = false
    this.pending = []
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const url = this.opts.socketURL ?? collabSocketURL(this.opts.documentId, this.opts.token)
    const factory = this.opts.socketFactory ?? ((u: string) => new WebSocket(u) as CollabSocket)
    const socket = factory(url)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        this.opened = true
        this.attempts = 0
        resolve()
      }
      const onError = () => {
        this.opts.onError?.(new Error('collab socket error'))
        reject(new Error('collab socket error'))
      }
      const onClose = () => {
        this.opened = false
        this.clearHeartbeat()
        if (!this.stopped) this.scheduleReconnect()
      }
      socket.addEventListener('open', onOpen)
      socket.addEventListener('error', onError)
      socket.addEventListener('close', onClose)
      socket.addEventListener('message', (ev: Event) => {
        const data = (ev as MessageEvent).data
        this.handleMessage(typeof data === 'string' ? data : '')
      })
    }).catch((err) => {
      this.opened = false
      if (!this.stopped) this.scheduleReconnect()
      throw err
    })
    if (this.stopped) return
    this.startHeartbeat()
    this.sendJSON({ type: 'sync', after: this.lastSeq })
    this.flushPending()
  }

  private flushPending(): void {
    const queued = this.pending
    this.pending = []
    for (const update of queued) this.sendUpdate(update)
  }

  private sendUpdate(update: Uint8Array): void {
    this.sendJSON({
      type: 'update',
      kind: 'update',
      payload: encodeYUpdate(update),
      html: this.opts.htmlProvider?.() ?? '',
    })
  }

  private startHeartbeat(): void {
    this.clearHeartbeat()
    const interval = this.opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS
    if (interval <= 0) return
    this.heartbeatTimer = setInterval(() => {
      this.sendJSON({ type: 'ping' })
    }, interval)
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer != null) return
    const base = this.opts.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS
    const delay = Math.min(MAX_RECONNECT_MS, base * 2 ** this.attempts)
    this.attempts += 1
    const schedule = this.opts.schedule ?? setTimeout
    this.reconnectTimer = schedule(() => {
      this.reconnectTimer = null
      void this.connect().catch(() => undefined)
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer == null) return
    const clear = this.opts.clearSchedule ?? clearTimeout
    clear(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private sendJSON(body: Record<string, unknown>): void {
    if (!this.socket || !this.opened) return
    this.socket.send(JSON.stringify(body))
  }

  private handleMessage(raw: string): void {
    if (!raw) return
    let msg: {
      type?: string
      ops?: { payload?: string; seq?: number }[]
      op?: { payload?: string; seq?: number }
      payload?: string
      users?: unknown[]
      message?: string
      seq?: number
      canWrite?: boolean
      role?: string
    }
    try {
      msg = JSON.parse(raw) as typeof msg
    } catch {
      return
    }
    if (msg.type === 'hello') {
      this.canWrite = msg.canWrite !== false
      this.role = msg.role ?? ''
      this.opts.onHello?.({ canWrite: this.canWrite, role: this.role })
      return
    }
    if (msg.type === 'pong') return
    if (msg.type === 'ops' && Array.isArray(msg.ops)) {
      for (const op of msg.ops) {
        if (op.payload) applyRemoteUpdate(this.opts.ydoc, decodeYUpdate(op.payload))
        if (typeof op.seq === 'number' && op.seq > this.lastSeq) this.lastSeq = op.seq
      }
      return
    }
    if (msg.type === 'update') {
      const payload = msg.op?.payload ?? msg.payload
      if (payload) applyRemoteUpdate(this.opts.ydoc, decodeYUpdate(payload))
      const seq = msg.op?.seq ?? msg.seq
      if (typeof seq === 'number' && seq > this.lastSeq) this.lastSeq = seq
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
