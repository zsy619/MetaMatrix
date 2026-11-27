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
}

export class BaseRealtime {
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private options: RealtimeOptions

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
    try {
      // SSE 走原生 fetch（EventSource 不支持请求头），路径需带 API 前缀。
      const res = await fetch(`/api/projects/${this.options.projectId}/base/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: this.controller.signal,
      })
      if (!res.ok || !res.body) {
        this.scheduleRetry()
        return
      }
      this.options.onStatus?.('open')
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
          if (event) this.options.onEvent(event)
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
