// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import {
  isCollabWritable,
  memoryOfflineQueueStore,
} from './collabOfflineQueue'
import { encodeYUpdate, LiveCollabSession } from './yDocCollab'

function createFakeSocket() {
  const listeners: Record<string, Array<(ev: Event) => void>> = {}
  const sent: string[] = []
  const fake = {
    readyState: 1,
    sent,
    listeners,
    send(data: string) {
      sent.push(String(data))
    },
    close() {
      this.readyState = 3
      ;(listeners.close ||= []).forEach((fn) => fn(new Event('close')))
    },
    addEventListener(type: string, fn: EventListener) {
      ;(listeners[type] ||= []).push(fn as (ev: Event) => void)
    },
    removeEventListener() {},
    open() {
      this.readyState = 1
      ;(listeners.open ||= []).forEach((fn) => fn(new Event('open')))
    },
  }
  return fake
}

function hello(socket: ReturnType<typeof createFakeSocket>, canWrite: boolean, role: string) {
  socket.listeners.message?.forEach((fn) =>
    fn({ data: JSON.stringify({ type: 'hello', canWrite, role }) } as MessageEvent),
  )
}

describe('isCollabWritable', () => {
  it('浏览者不可写，编辑者 / 管理员 / 所有者可写', () => {
    expect(isCollabWritable({ canWrite: false, role: 'viewer' })).toBe(false)
    expect(isCollabWritable({ canWrite: true, role: 'viewer' })).toBe(false)
    expect(isCollabWritable({ canWrite: true, role: 'editor' })).toBe(true)
    expect(isCollabWritable({ canWrite: true, role: 'admin' })).toBe(true)
    expect(isCollabWritable({ canWrite: true, role: 'owner' })).toBe(true)
  })
})

describe('LiveCollabSession 角色只读', () => {
  it('viewer 进房后不发送本地 Yjs update，且编辑器不可写', async () => {
    const ydoc = new Y.Doc()
    const sock = createFakeSocket()
    const session = new LiveCollabSession({
      documentId: 'd-view',
      token: 't',
      ydoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: memoryOfflineQueueStore(),
      socketFactory: () => sock,
    })
    const started = session.start()
    sock.open()
    await started
    hello(sock, false, 'viewer')
    expect(session.canWrite).toBe(false)
    const sentBefore = sock.sent.length
    ydoc.getMap('m').set('secret', 'nope')
    await new Promise((r) => setTimeout(r, 0))
    expect(sock.sent.slice(sentBefore).some((s) => s.includes('"type":"update"'))).toBe(false)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor({
      element: host,
      editable: isCollabWritable({ canWrite: session.canWrite, role: session.role }),
      extensions: [
        StarterKit.configure({ dropcursor: false, undoRedo: false }),
        Collaboration.configure({ document: ydoc }),
      ],
    })
    expect(editor.isEditable).toBe(false)
    editor.destroy()
    session.stop()
  })

  it('editor 进房后仍可写并会发出 update', async () => {
    const ydoc = new Y.Doc()
    const sock = createFakeSocket()
    const session = new LiveCollabSession({
      documentId: 'd-edit',
      token: 't',
      ydoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: memoryOfflineQueueStore(),
      socketFactory: () => sock,
    })
    const started = session.start()
    sock.open()
    await started
    hello(sock, true, 'editor')
    expect(isCollabWritable({ canWrite: session.canWrite, role: session.role })).toBe(true)
    ydoc.getMap('m').set('ok', 1)
    await new Promise((r) => setTimeout(r, 0))
    expect(sock.sent.some((s) => s.includes('"type":"update"'))).toBe(true)
    session.stop()
  })
})

describe('协同持久化离线队列', () => {
  it('入队后模拟重载能恢复，发送成功后清除', async () => {
    const store = memoryOfflineQueueStore()
    const docId = 'd-offline'
    const firstDoc = new Y.Doc()
    const closed = createFakeSocket()
    // 第一段会话：插座一直不开，本地改动只入队。
    const first = new LiveCollabSession({
      documentId: docId,
      token: 'secret-token-should-not-be-stored',
      ydoc: firstDoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: store,
      socketFactory: () => closed,
    })
    const starting = first.start()
    firstDoc.getMap('m').set('queued', 'yes')
    await new Promise((r) => setTimeout(r, 10))
    first.stop()
    void starting.catch(() => undefined)

    const saved = await store.load(docId)
    expect(saved.length).toBeGreaterThan(0)
    expect(JSON.stringify(saved).includes('secret-token')).toBe(false)

    const secondDoc = new Y.Doc()
    const openSock = createFakeSocket()
    const second = new LiveCollabSession({
      documentId: docId,
      token: 't',
      ydoc: secondDoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: store,
      socketFactory: () => openSock,
    })
    const started = second.start()
    openSock.open()
    await started
    await new Promise((r) => setTimeout(r, 0))
    expect(openSock.sent.some((s) => s.includes('"type":"update"'))).toBe(true)
    expect(await store.load(docId)).toEqual([])
    second.stop()
  })
})

// 避免未使用警告
void encodeYUpdate
