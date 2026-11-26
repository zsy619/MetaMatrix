import * as Y from 'yjs'
import { fetchCrdtUpdates, type CRDTUpdate } from '../../../api/knowledge_v6'

/**
 * 历史 HTML 级 CRDT 旁路（清单 079 / A2b 只读）。
 *
 * 曾用 HTTP 轮询把顶层块的 LWW 增量写入 doc_crdt_updates。
 * A2b 起新的协同编辑走正文 Yjs（/documents/:id/collab），本模块只保留
 * 拆块规则与历史增量回放。默认不可写入；writable 仅供孤立的算法单测使用。
 */

export type CollabTransport = {
  fetchUpdates(after: number): Promise<CRDTUpdate[]>
  postUpdate(kind: 'update' | 'snapshot', payload: string): Promise<number>
}

/** 默认走 HTTP 接口的传输层。 */
export function httpTransport(documentId: string): CollabTransport {
  return {
    async fetchUpdates(after) {
      const data = await fetchCrdtUpdates(documentId, after)
      return data.updates ?? []
    },
    async postUpdate() {
      throw new Error('html crdt bypass is read-only')
    },
  }
}

/** HTML 里的空元素：自闭合，不参与深度计数。 */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'track',
])

/**
 * 把 HTML 拆成顶层块。
 *
 * 自己扫标签而不是用 DOMParser：服务端渲染与单元测试环境里没有 DOM，
 * 拆块规则要处处一致，块的边界才不会被两端算成不同。
 */
export function splitBlocks(html: string): string[] {
  const source = html ?? ''
  if (!source.trim()) return []
  const blocks: string[] = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < source.length) {
    const lt = source.indexOf('<', i)
    if (lt < 0) break
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt)
      i = end < 0 ? source.length : end + 3
      continue
    }
    const gt = source.indexOf('>', lt)
    if (gt < 0) break
    const tagText = source.slice(lt + 1, gt)
    const match = /^<\/?([a-zA-Z0-9-]+)/.exec(tagText)
    const name = match ? match[1].toLowerCase() : ''
    const closing = tagText.startsWith('/')
    const selfClose = tagText.endsWith('/') || VOID_TAGS.has(name)
    if (closing) {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        blocks.push(source.slice(start, gt + 1))
        start = gt + 1
      }
    } else if (selfClose) {
      if (depth === 0) {
        blocks.push(source.slice(start, gt + 1))
        start = gt + 1
      }
    } else {
      if (depth === 0) start = lt
      depth++
    }
    i = gt + 1
  }
  const tail = source.slice(start).trim()
  if (tail) blocks.push(tail)
  return blocks.length ? blocks : [source]
}

/** 把块拼回 HTML。 */
export function joinBlocks(blocks: string[]): string {
  return blocks.join('')
}

export type CollabDocOptions = {
  documentId?: string
  transport?: CollabTransport
  pollMs?: number
  /**
   * 仅供历史 LWW 算法单测打开。生产路径（HTTP 传输）必须为 false，
   * 以免再向 doc_crdt_updates 写入。
   */
  writable?: boolean
  /** 远端合并后回调。 */
  onRemote?: (html: string) => void
  /** 本地与服务端都失败时回调，便于提示「协同同步不可用」。 */
  onError?: (err: unknown) => void
}

export class CollabDoc {
  private readonly doc = new Y.Doc()
  private readonly blocks: Y.Array<Y.Map<string>>
  private readonly transport: CollabTransport | null
  private readonly pollMs: number
  private readonly onRemote?: (html: string) => void
  private readonly onError?: (err: unknown) => void
  private timer: ReturnType<typeof setInterval> | null = null
  private lastSeq = 0
  private started = false
  private readonly writable: boolean
  /** 本地正在写：避免把本地改动当成远端改动再回灌。 */
  private applyingLocal = false

  constructor(opts: CollabDocOptions) {
    this.blocks = this.doc.getArray<Y.Map<string>>('blocks')
    this.transport = opts.transport ?? (opts.documentId ? httpTransport(opts.documentId) : null)
    this.pollMs = opts.pollMs ?? 2500
    this.writable = opts.writable === true
    this.onRemote = opts.onRemote
    this.onError = opts.onError
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      if (!this.writable) return
      void this.postUpdate(update)
    })
  }

  /** 启动同步：先拉服务端增量，再按需播种本地内容。 */
  async start(seedHtml: string): Promise<string> {
    this.started = true
    await this.pull()
    if (this.blocks.length === 0 && seedHtml) {
      this.applyLocal(seedHtml)
    }
    if (this.transport) {
      this.timer = setInterval(() => void this.pull(), this.pollMs)
    }
    return this.html()
  }

  /** 停止同步。 */
  stop(): void {
    this.started = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.doc.destroy()
  }

  /** 当前合并后的 HTML。 */
  html(): string {
    return joinBlocks(this.blocks.toArray().map((block) => block.get('h') ?? ''))
  }

  /** 本地编辑写回 CRDT。 */
  applyLocal(html: string): void {
    const next = splitBlocks(html)
    this.applyingLocal = true
    try {
      this.doc.transact(() => {
        const current = this.blocks.toArray()
        const shared = Math.min(current.length, next.length)
        for (let i = 0; i < shared; i++) {
          const block = current[i]
          if (block.get('h') !== next[i]) block.set('h', next[i])
        }
        if (next.length > current.length) {
          for (let i = shared; i < next.length; i++) {
            const block = new Y.Map<string>()
            block.set('h', next[i])
            this.blocks.push([block])
          }
        } else if (next.length < current.length) {
          for (let i = current.length - 1; i >= next.length; i--) {
            this.blocks.delete(i, 1)
          }
        }
      }, 'local')
    } finally {
      this.applyingLocal = false
    }
  }

  /** 拉取服务端增量并应用。 */
  async pull(): Promise<void> {
    if (!this.transport || !this.started) return
    try {
      const updates = await this.transport.fetchUpdates(this.lastSeq)
      if (!updates || updates.length === 0) return
      for (const update of updates) {
        const bytes = decodeBase64(update.payload)
        if (!bytes) continue
        Y.applyUpdate(this.doc, bytes, 'remote')
        this.lastSeq = Math.max(this.lastSeq, update.seq)
      }
      const merged = this.html()
      if (!this.applyingLocal) this.onRemote?.(merged)
    } catch (err) {
      this.onError?.(err)
    }
  }

  private async postUpdate(update: Uint8Array): Promise<void> {
    if (!this.transport) return
    try {
      const seq = await this.transport.postUpdate('update', encodeBase64(update))
      this.lastSeq = Math.max(this.lastSeq, seq)
    } catch (err) {
      this.onError?.(err)
    }
  }
}

/** Uint8Array → base64。 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

/** base64 → Uint8Array。 */
export function decodeBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}
