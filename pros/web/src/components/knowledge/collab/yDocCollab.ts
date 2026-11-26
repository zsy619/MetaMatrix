import * as Y from 'yjs'
import {
  defaultOfflineQueueStore,
  isCollabWritable,
  type OfflineQueueStore,
} from './collabOfflineQueue'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  type CollabCaretProvider,
  type CollabCaretUser,
  presenceUserIds,
  pruneAwarenessByPresence,
} from './collabAwareness'

const AWARENESS_REMOTE = 'remote'

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
  /** 未发出增量的持久化存储；默认 IndexedDB（失败则 localStorage）。不写入凭证。 */
  offlineStore?: OfflineQueueStore
  /** 写入 awareness 的本地用户（名称与配色）。浏览者也可以上报光标。 */
  user?: CollabCaretUser
}

/**
 * 把本地 Y.Doc 接到 Hertz 协同通道：发送本地增量（可附 HTML 供服务端双写），
 * 并应用远端 ops / update。断线后自动重连并先 sync 再冲刷待发增量。
 * 未发出的 Yjs 更新按文档隔离写入本地持久化队列，刷新或重新进房后恢复并重试；
 * 发送成功后从队列移除。浏览者（hello.canWrite=false / role=viewer）不发送本地增量。
 * 旧 HTML 级 crdtDoc 旁路已只读，新的协同编辑只走本通道。
 */
export class LiveCollabSession {
  private readonly opts: LiveCollabOptions
  private readonly offline: OfflineQueueStore
  private socket: CollabSocket | null = null
  private unbind: (() => void) | null = null
  private opened = false
  private stopped = false
  private lastSeq = 0
  private pending: Uint8Array[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private connectWait: ((err?: Error) => void) | null = null
  private unbindAwareness: (() => void) | null = null
  readonly awareness: Awareness
  readonly provider: CollabCaretProvider
  canWrite = true
  role = ''

  constructor(opts: LiveCollabOptions) {
    this.opts = opts
    this.offline = opts.offlineStore ?? defaultOfflineQueueStore()
    this.awareness = new Awareness(opts.ydoc)
    this.provider = { awareness: this.awareness }
    if (opts.user) this.awareness.setLocalStateField('user', opts.user)
  }

  async start(): Promise<void> {
    this.stopped = false
    // 先挂上插座监听再等本地队列：否则测试和浏览器可能在 restore 完成前就触发 open。
    const restoring = this.restoreQueue()
    if (!this.unbind) {
      this.unbind = bindLocalUpdates(this.opts.ydoc, (update) => {
        if (!this.writable()) return
        if (!this.opened) {
          this.enqueue(update)
          return
        }
        this.sendUpdate(update)
      })
    }
    this.bindAwareness()
    try {
      await this.connect()
    } finally {
      await restoring
      if (this.opened && this.writable()) this.flushPending()
    }
  }

  noteHtml(_html: string): void {
    // HTML 随下一条 Yjs update 一起发给服务端做 current_data 双写；
    // 这里保留方法，方便宿主在 onHtml 里显式刷新快照来源。
  }

  stop(): void {
    this.stopped = true
    this.connectWait?.(new Error('collab stopped'))
    this.connectWait = null
    this.clearReconnect()
    this.clearHeartbeat()
    try {
      this.awareness.setLocalState(null)
      this.flushAwareness()
    } catch {
      /* ignore */
    }
    this.unbindAwareness?.()
    this.unbindAwareness = null
    this.unbind?.()
    this.unbind = null
    try {
      this.socket?.close()
    } catch {
      /* ignore */
    }
    try {
      // 清掉 y-protocols 的 30s 检查定时器，避免测试进程挂起。
      this.awareness.destroy()
    } catch {
      /* ignore */
    }
    this.socket = null
    this.opened = false
    // 内存队列清空，但持久化队列保留，刷新 / 再次进房后还能恢复。
    this.pending = []
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const url = this.opts.socketURL ?? collabSocketURL(this.opts.documentId, this.opts.token)
    const factory = this.opts.socketFactory ?? ((u: string) => new WebSocket(u) as CollabSocket)
    const socket = factory(url)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      this.connectWait = (err) => {
        this.connectWait = null
        if (err) reject(err)
        else resolve()
      }
      const onOpen = () => {
        this.opened = true
        this.attempts = 0
        this.connectWait = null
        resolve()
      }
      const onError = () => {
        this.opts.onError?.(new Error('collab socket error'))
        this.connectWait = null
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
    this.flushAwareness()
    // 请房间里其他人再发一遍光标，并让服务端把 awareness-sync 转出去。
    this.sendJSON({ type: 'awareness-sync' })
  }

  private writable(): boolean {
    return isCollabWritable({ canWrite: this.canWrite, role: this.role })
  }

  private enqueue(update: Uint8Array): void {
    this.pending.push(update)
    void this.persistQueue()
  }

  private async restoreQueue(): Promise<void> {
    try {
      const payloads = await this.offline.load(this.opts.documentId)
      if (!payloads.length) return
      const restored = payloads.map((p) => decodeYUpdate(p))
      this.pending = [...restored, ...this.pending]
    } catch {
      /* 本地队列损坏时忽略，避免挡住进房 */
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      const payloads = this.pending.map((u) => encodeYUpdate(u))
      if (payloads.length === 0) await this.offline.clear(this.opts.documentId)
      else await this.offline.save(this.opts.documentId, payloads)
    } catch {
      /* 持久化失败不阻断在线协同 */
    }
  }

  private flushPending(): void {
    if (!this.writable()) return
    const queued = this.pending
    this.pending = []
    for (const update of queued) this.sendUpdate(update)
    void this.persistQueue()
  }

  private sendUpdate(update: Uint8Array): void {
    if (!this.writable()) return
    if (!this.socket || !this.opened) {
      this.enqueue(update)
      return
    }
    try {
      this.socket.send(
        JSON.stringify({
          type: 'update',
          kind: 'update',
          payload: encodeYUpdate(update),
          html: this.opts.htmlProvider?.() ?? '',
        }),
      )
    } catch {
      this.enqueue(update)
    }
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
      userId?: string
    }
    try {
      msg = JSON.parse(raw) as typeof msg
    } catch {
      return
    }
    if (msg.type === 'hello') {
      this.canWrite = msg.canWrite !== false
      this.role = msg.role ?? ''
      if (!this.writable()) {
        this.pending = []
        void this.persistQueue()
      }
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
      pruneAwarenessByPresence(this.awareness, presenceUserIds(msg.users))
      this.opts.onPresence?.(msg.users)
      return
    }
    if (msg.type === 'awareness-leave' && msg.userId) {
      const keep = new Set<string>()
      this.awareness.getStates().forEach((state, clientId) => {
        if (clientId === this.awareness.clientID) return
        const id = (state as { user?: { id?: string } } | null)?.user?.id
        if (id && id !== msg.userId) keep.add(id)
      })
      const localId = (this.awareness.getLocalState() as { user?: { id?: string } } | null)?.user?.id
      if (localId) keep.add(localId)
      pruneAwarenessByPresence(this.awareness, keep)
      return
    }
    if (msg.type === 'awareness' && msg.payload) {
      try {
        applyAwarenessUpdate(this.awareness, decodeYUpdate(msg.payload), AWARENESS_REMOTE)
      } catch {
        /* 损坏的 awareness 包忽略 */
      }
      return
    }
    if (msg.type === 'awareness-sync') {
      this.flushAwareness()
      return
    }
    if (msg.type === 'error' && msg.message) {
      this.opts.onError?.(new Error(msg.message))
    }
  }

  private bindAwareness(): void {
    if (this.unbindAwareness) return
    const onUpdate = (_changes: unknown, origin: unknown) => {
      if (origin === AWARENESS_REMOTE || origin === 'presence') return
      this.flushAwareness()
    }
    this.awareness.on('update', onUpdate)
    this.unbindAwareness = () => {
      this.awareness.off('update', onUpdate)
    }
  }

  private flushAwareness(): void {
    if (!this.socket || !this.opened) return
    const clients = new Set<number>([this.awareness.clientID])
    for (const id of this.awareness.getStates().keys()) clients.add(id)
    try {
      const update = encodeAwarenessUpdate(this.awareness, Array.from(clients))
      this.sendJSON({ type: 'awareness', payload: encodeYUpdate(update) })
    } catch {
      /* 编码失败不阻断正文协同 */
    }
  }
}
