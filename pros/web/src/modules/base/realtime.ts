/**
 * Base Engine 实时事件客户端。
 *
 * 用 fetch + ReadableStream 承载 SSE，这样能带上 Authorization 头
 * （原生 EventSource 不支持请求头），断线自动重连并补拉。
 *
 * 事件协议与 WebSocket 版本一致，后续换传输层不影响调用方。
 */
import { useAuthStore } from '../../stores/auth'

export type BaseEvent = {
  eventId: string
  eventType: string
  projectId: string
  baseId: string
  tableId?: string
  recordId?: string
  version?: number
  operatorId?: string
  payload?: Record<string, unknown>
  timestamp: string
}

export type RealtimeOptions = {
  projectId: string
  onEvent: (event: BaseEvent) => void
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void
  /**
   * 断线重连成功后回调。
   *
   * 补拉（Last-Event-ID）只保证「不漏事件」，不保证「本地状态是最新的」，
   * 所以重连后还要让上层做一次全量刷新。
   */
  onResync?: () => void
}

export class BaseRealtime {
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private options: RealtimeOptions
  /** 最后收到的事件 ID：重连时作为 Last-Event-ID 交给服务端补拉。 */
  private lastEventId = ''
  /** 是否已经连过一次：用于区分「首次连接」与「断线重连」。 */
  private everConnected = false

  constructor(options: RealtimeOptions) {
    this.options = options
  }

  start() {
    this.stopped = false
    void this.connect()
  }

  stop() {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.controller?.abort()
    this.controller = null
  }

  private scheduleRetry() {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.connect(), 3000)
  }

  private async connect() {
    if (this.stopped) return
    const token = useAuthStore().token
    if (!token) {
      this.scheduleRetry()
      return
    }
    this.controller = new AbortController()
    this.options.onStatus?.('connecting')
    const isReconnect = this.everConnected
    try {
      // SSE 走原生 fetch（EventSource 不支持请求头），路径需带 API 前缀。
      // 重连时带上 Last-Event-ID，服务端把断线期间错过的事件补发。
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      }
      if (isReconnect && this.lastEventId) {
        headers['Last-Event-ID'] = this.lastEventId
      }
      const res = await fetch(`/api/projects/${this.options.projectId}/base/events`, {
        headers,
        signal: this.controller.signal,
      })
      if (!res.ok || !res.body) {
        this.scheduleRetry()
        return
      }
      this.options.onStatus?.('open')
      if (isReconnect) {
        // 补拉只保证不漏事件；重连成功后仍要全量刷新一次（数据可能已被别人改过）。
        this.options.onResync?.()
      }
      this.everConnected = true
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index = buffer.indexOf('\n\n')
        while (index >= 0) {
          const chunk = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          const event = parseEvent(chunk)
          if (event) {
            if (event.eventId) this.lastEventId = event.eventId
            this.options.onEvent(event)
          }
          index = buffer.indexOf('\n\n')
        }
      }
    } catch {
      // 断线：交给重试。
    }
    if (!this.stopped) {
      this.options.onStatus?.('closed')
      this.scheduleRetry()
    }
  }
}

function parseEvent(chunk: string): BaseEvent | null {
  const dataLines = chunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  if (!dataLines.length) return null
  try {
    return JSON.parse(dataLines.join('\n')) as BaseEvent
  } catch {
    return null
  }
}
