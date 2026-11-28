/**
 * 跨标签页文档写入协调。
 *
 * 这里只解决「同一篇文档的写请求串行」和「保存结果通知」两件事：
 * - Web Locks 负责不同标签页之间的互斥，内存队列负责当前标签页内的兜底串行；
 * - BroadcastChannel 只传版本元数据，不传整篇草稿，避免大对象复制和频道拥塞。
 * 服务端的 expectedSaveVersion / 409 仍是最终一致性保障，不能用前端锁替代。
 */

export type DocumentSaveNotice = {
  documentId: string
  saveVersion: number
  updatedAt: string
  /** 发送方标签页 id，用来忽略自己发出的通知。 */
  sourceTabId: string
}

type DocumentWriteTask<T> = () => Promise<T>

/** 测试可注入的最小锁接口；生产环境由 navigator.locks 适配而来。 */
export type DocumentLockAdapter = {
  request<T>(name: string, task: DocumentWriteTask<T>): Promise<T>
}

/** 测试可注入的最小广播接口，避免单元测试依赖真实浏览器进程。 */
export type DocumentChannelAdapter = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  postMessage(message: DocumentSaveNotice): void
  close(): void
}

type CoordinatorOptions = {
  locks?: DocumentLockAdapter | null
  channel?: DocumentChannelAdapter | null
  tabId?: string
}

function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function isSaveNotice(value: unknown): value is DocumentSaveNotice {
  if (!value || typeof value !== 'object') return false
  const notice = value as Partial<DocumentSaveNotice>
  return (
    typeof notice.documentId === 'string' &&
    typeof notice.saveVersion === 'number' &&
    Number.isFinite(notice.saveVersion) &&
    typeof notice.updatedAt === 'string' &&
    typeof notice.sourceTabId === 'string'
  )
}

export class DocumentTabCoordinator {
  readonly tabId: string
  private readonly locks: DocumentLockAdapter | null
  private readonly channel: DocumentChannelAdapter | null
  private readonly listeners = new Set<(notice: DocumentSaveNotice) => void>()
  /** 每个文档一条当前标签页队列；锁不可用时也能避免本页请求交错。 */
  private readonly localQueues = new Map<string, Promise<void>>()

  constructor(options: CoordinatorOptions = {}) {
    this.tabId = options.tabId ?? createTabId()

    if (options.locks !== undefined) {
      this.locks = options.locks
    } else if (typeof navigator !== 'undefined' && navigator.locks) {
      this.locks = {
        request: <T>(name: string, task: DocumentWriteTask<T>) =>
          navigator.locks.request(name, { mode: 'exclusive' }, task),
      }
    } else {
      this.locks = null
    }

    if (options.channel !== undefined) {
      this.channel = options.channel
    } else if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('metamatrix:document-saves')
      } catch {
        // 隐私模式或受限 WebView 可能禁用频道；锁和服务端 409 仍然有效。
        this.channel = null
      }
    } else {
      this.channel = null
    }

    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (!isSaveNotice(event.data)) return
        // BroadcastChannel 本就不会回送给发送方；sourceTabId 再兜一层，
        // 也防止测试适配器或其他实现把本页通知当成远程保存。
        if (event.data.sourceTabId === this.tabId) return
        for (const listener of this.listeners) listener(event.data)
      }
    }
  }

  /** 同一文档的写操作按文档粒度串行，不阻塞其他文档保存。 */
  async withDocumentWriteLock<T>(documentId: string, task: DocumentWriteTask<T>): Promise<T> {
    const execute = () => {
      if (!this.locks) return task()
      return this.locks.request(`metamatrix:document-write:${documentId}`, task)
    }
    const previous = this.localQueues.get(documentId)
    // 队列为空时立即进入任务，保留 save() 调用后请求同步发出的既有语义；
    // 只有确实存在前序写入时才通过 Promise 链排队，避免无意义的微任务延迟。
    const run = previous ? previous.then(execute) : execute()
    // tail 永远 fulfilled，前一次失败不会阻断后续保存；原始错误仍通过 run 返回给调用方。
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.localQueues.set(documentId, tail)
    try {
      return await run
    } finally {
      if (this.localQueues.get(documentId) === tail) this.localQueues.delete(documentId)
    }
  }

  /** 保存成功后只广播最新版本元数据，其他标签页据此提前进入冲突检查。 */
  publishSaved(documentId: string, saveVersion: number, updatedAt: string): void {
    if (!this.channel) return
    const notice: DocumentSaveNotice = {
      documentId,
      saveVersion,
      updatedAt,
      sourceTabId: this.tabId,
    }
    try {
      this.channel.postMessage(notice)
    } catch {
      // 通知失败不影响已经成功的云端保存；接收方仍有 409 作为最终兜底。
    }
  }

  subscribe(listener: (notice: DocumentSaveNotice) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.listeners.clear()
    if (this.channel) {
      this.channel.onmessage = null
      this.channel.close()
    }
  }
}

/** 应用内共享一个标签页身份和一条频道，避免每篇文档各建 BroadcastChannel。 */
export const documentTabs = new DocumentTabCoordinator()
