// @vitest-environment happy-dom
/** 跨标签页写锁与保存通知测试，不依赖真实浏览器进程或 BroadcastChannel 实现。 */
import { describe, expect, it, vi } from 'vitest'
import {
  DocumentTabCoordinator,
  type DocumentChannelAdapter,
  type DocumentLockAdapter,
  type DocumentSaveNotice,
} from './documentTabs'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

/** 模拟浏览器按锁名称排队的行为，让两个协调器像两个真实标签页一样共享锁。 */
function createSharedLocks(): DocumentLockAdapter {
  const queues = new Map<string, Promise<void>>()
  return {
    request<T>(name: string, task: () => Promise<T>): Promise<T> {
      const previous = queues.get(name)
      const run = previous ? previous.then(task) : task()
      const tail = run.then(
        () => undefined,
        () => undefined,
      )
      queues.set(name, tail)
      return run.finally(() => {
        if (queues.get(name) === tail) queues.delete(name)
      })
    },
  }
}

/** 一对相连频道：A 发出的结构化克隆消息只投递给 B，反之亦然。 */
function createChannelPair(): [DocumentChannelAdapter, DocumentChannelAdapter] {
  const a: DocumentChannelAdapter = {
    onmessage: null,
    postMessage: vi.fn((message: DocumentSaveNotice) => {
      b.onmessage?.({ data: message } as MessageEvent<unknown>)
    }),
    close: vi.fn(),
  }
  const b: DocumentChannelAdapter = {
    onmessage: null,
    postMessage: vi.fn((message: DocumentSaveNotice) => {
      a.onmessage?.({ data: message } as MessageEvent<unknown>)
    }),
    close: vi.fn(),
  }
  return [a, b]
}

describe('跨标签页文档协调', () => {
  it('两个标签页对同一文档的写任务通过共享锁严格串行', async () => {
    const locks = createSharedLocks()
    const tabA = new DocumentTabCoordinator({ locks, channel: null, tabId: 'tab-a' })
    const tabB = new DocumentTabCoordinator({ locks, channel: null, tabId: 'tab-b' })
    const gate = deferred()
    const events: string[] = []

    const first = tabA.withDocumentWriteLock('doc-1', async () => {
      events.push('A:start')
      await gate.promise
      events.push('A:end')
      return 'A'
    })
    const second = tabB.withDocumentWriteLock('doc-1', async () => {
      events.push('B:start')
      events.push('B:end')
      return 'B'
    })

    await Promise.resolve()
    // A 尚未释放锁时，B 不能开始写入。
    expect(events).toEqual(['A:start'])
    gate.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual(['A', 'B'])
    expect(events).toEqual(['A:start', 'A:end', 'B:start', 'B:end'])
  })

  it('Web Locks 不可用时，当前标签页内同一文档仍按队列串行', async () => {
    const coordinator = new DocumentTabCoordinator({ locks: null, channel: null, tabId: 'tab-a' })
    const gate = deferred()
    const events: string[] = []
    const first = coordinator.withDocumentWriteLock('doc-1', async () => {
      events.push('first:start')
      await gate.promise
      events.push('first:end')
    })
    const second = coordinator.withDocumentWriteLock('doc-1', async () => {
      events.push('second:start')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    gate.resolve()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('保存通知只传版本元数据，并忽略本标签页回声和无效消息', () => {
    const [channelA, channelB] = createChannelPair()
    const tabA = new DocumentTabCoordinator({ locks: null, channel: channelA, tabId: 'tab-a' })
    const tabB = new DocumentTabCoordinator({ locks: null, channel: channelB, tabId: 'tab-b' })
    const ownListener = vi.fn()
    const remoteListener = vi.fn()
    tabA.subscribe(ownListener)
    tabB.subscribe(remoteListener)

    tabA.publishSaved('doc-1', 8, '2026-11-17T00:00:00.000Z')
    const expected: DocumentSaveNotice = {
      documentId: 'doc-1',
      saveVersion: 8,
      updatedAt: '2026-11-17T00:00:00.000Z',
      sourceTabId: 'tab-a',
    }
    expect(ownListener).not.toHaveBeenCalled()
    expect(remoteListener).toHaveBeenCalledExactlyOnceWith(expected)
    // 通知载荷不包含整篇草稿，避免大文档在频道里重复复制。
    expect(expected).not.toHaveProperty('currentData')

    channelA.onmessage?.({ data: expected } as MessageEvent<unknown>)
    channelB.onmessage?.({ data: { documentId: 'doc-1', saveVersion: 'bad' } } as MessageEvent<unknown>)
    expect(ownListener).not.toHaveBeenCalled()
    expect(remoteListener).toHaveBeenCalledTimes(1)
  })

  it('退订后不再接收通知，频道发送异常也不影响已完成的保存', () => {
    const channel: DocumentChannelAdapter = {
      onmessage: null,
      postMessage: vi.fn(() => { throw new Error('channel closed') }),
      close: vi.fn(),
    }
    const coordinator = new DocumentTabCoordinator({ locks: null, channel, tabId: 'tab-a' })
    const listener = vi.fn()
    const unsubscribe = coordinator.subscribe(listener)
    unsubscribe()

    expect(() => coordinator.publishSaved('doc-1', 2, 'now')).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
    coordinator.close()
    expect(channel.close).toHaveBeenCalledTimes(1)
  })
})
