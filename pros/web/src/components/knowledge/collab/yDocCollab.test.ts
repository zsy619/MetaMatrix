// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { BlockIdentity, collectIdentityNodes, readBlockId } from '../../../extensions/blockIdentity'
import {
  applyRemoteUpdate,
  bindLocalUpdates,
  collabSocketURL,
  decodeYUpdate,
  encodeYUpdate,
  LiveCollabSession,
} from './yDocCollab'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length) {
    editors.pop()?.destroy()
  }
})

function mountCollab(doc: Y.Doc, content?: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false, undoRedo: false }),
      BlockIdentity,
      Collaboration.configure({ document: doc }),
    ],
    content,
  })
  editors.push(editor)
  return editor
}

function blockIds(ed: Editor): string[] {
  return collectIdentityNodes(ed.state.doc)
    .map(({ node }) => readBlockId(node))
    .filter((id): id is string => Boolean(id))
}

describe('yDocCollab', () => {
  it('encode / decode 保持 Yjs 更新字节不变', () => {
    const doc = new Y.Doc()
    doc.getMap('m').set('k', 'v')
    const update = Y.encodeStateAsUpdate(doc)
    const roundtrip = decodeYUpdate(encodeYUpdate(update))
    expect(Array.from(roundtrip)).toEqual(Array.from(update))
  })

  it('bindLocalUpdates 不把 remote origin 的增量再发出去', () => {
    const doc = new Y.Doc()
    const sent: Uint8Array[] = []
    const stop = bindLocalUpdates(doc, (u) => sent.push(u))
    doc.getMap('m').set('local', 1)
    const localCount = sent.length
    expect(localCount).toBeGreaterThan(0)
    const other = new Y.Doc()
    other.getMap('m').set('remote', 2)
    applyRemoteUpdate(doc, Y.encodeStateAsUpdate(other))
    expect(sent.length).toBe(localCount)
    stop()
  })

  it('Y.Doc 协同更新携带 data-block-id，且两端块身份一致', () => {
    const yA = new Y.Doc()
    const edA = mountCollab(yA)
    edA.commands.setContent('<p>hello</p>')
    const htmlA = edA.getHTML()
    expect(htmlA).toMatch(/data-block-id="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/i)
    const idsA = blockIds(edA)
    expect(idsA.length).toBeGreaterThan(0)

    const yB = new Y.Doc()
    applyRemoteUpdate(yB, Y.encodeStateAsUpdate(yA))
    const edB = mountCollab(yB)
    expect(edB.getHTML()).toBe(htmlA)
    expect(blockIds(edB)).toEqual(idsA)

    const unbind = bindLocalUpdates(yA, (u) => applyRemoteUpdate(yB, u))
    edA.commands.insertContent(' world')
    expect(edB.getHTML()).toBe(edA.getHTML())
    expect(blockIds(edB)).toEqual(blockIds(edA))
    expect(edB.getHTML()).toContain('hello world')
    unbind()
  })

  it('collabSocketURL 在相对 API 基址下走当前站点的 ws 协议', () => {
    const url = collabSocketURL('doc-1', 'tok+en', {
      apiBase: '/api',
      location: { protocol: 'https:', host: 'app.example.test' },
    })
    expect(url).toBe('wss://app.example.test/api/documents/doc-1/collab?token=tok%2Ben')
  })

  it('LiveCollabSession 在收到 ops 后把增量应用到 Y.Doc', async () => {
    const source = new Y.Doc()
    source.getMap('m').set('hello', 'world')
    const payload = encodeYUpdate(Y.encodeStateAsUpdate(source))

    const target = new Y.Doc()
    const sent: string[] = []
    const listeners: Record<string, Array<(ev: Event) => void>> = {}
    const fake = {
      readyState: 1,
      send(data: string) {
        sent.push(String(data))
      },
      close() {},
      addEventListener(type: string, fn: EventListener) {
        ;(listeners[type] ||= []).push(fn as (ev: Event) => void)
      },
      removeEventListener() {},
    }

    const session = new LiveCollabSession({
      documentId: 'd1',
      token: 't',
      ydoc: target,
      socketURL: 'ws://example.test/collab',
      socketFactory: (_url: string) => fake,
    })
    const started = session.start()
    listeners.open?.forEach((fn) => fn(new Event('open')))
    await started
    listeners.message?.forEach((fn) =>
      fn({ data: JSON.stringify({ type: 'ops', ops: [{ payload }] }) } as MessageEvent),
    )
    expect((target.getMap('m') as Y.Map<string>).get('hello')).toBe('world')
    expect(sent.some((s) => s.includes('"type":"sync"'))).toBe(true)
    session.stop()
  })
})

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

describe('LiveCollabSession 心跳与重连', () => {
  it('按间隔发出应用层 ping，stop 后不再重连', async () => {
    const ydoc = new Y.Doc()
    const first = createFakeSocket()
    const sockets = [first]
    const scheduled: Array<() => void> = []
    const session = new LiveCollabSession({
      documentId: 'd1',
      token: 't',
      ydoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 5,
      reconnectBaseMs: 1,
      socketFactory: () => {
        const s = sockets[sockets.length - 1]!
        return s
      },
      schedule: (fn) => {
        scheduled.push(fn)
        return 1 as unknown as ReturnType<typeof setTimeout>
      },
      clearSchedule: () => undefined,
    })
    const started = session.start()
    first.open()
    await started
    await new Promise((r) => setTimeout(r, 12))
    expect(first.sent.some((s) => s.includes('"type":"ping"'))).toBe(true)
    session.stop()
    first.close()
    expect(scheduled.length).toBe(0)
  })

  it('断线后重连会带上 lastSeq，并把断线期间的本地增量发出去', async () => {
    const ydoc = new Y.Doc()
    const first = createFakeSocket()
    const second = createFakeSocket()
    const sockets = [first, second]
    let idx = 0
    const scheduled: Array<() => void> = []
    const session = new LiveCollabSession({
      documentId: 'd1',
      token: 't',
      ydoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      reconnectBaseMs: 1,
      socketFactory: () => sockets[Math.min(idx++, sockets.length - 1)]!,
      schedule: (fn) => {
        scheduled.push(fn)
        return scheduled.length as unknown as ReturnType<typeof setTimeout>
      },
      clearSchedule: () => undefined,
    })
    const started = session.start()
    first.open()
    await started
    first.listeners.message?.forEach((fn) =>
      fn({ data: JSON.stringify({ type: 'ops', ops: [{ seq: 3 }] }) } as MessageEvent),
    )
    first.close()
    expect(scheduled.length).toBe(1)
    ydoc.getMap('m').set('offline', 'yes')
    const connecting = Promise.resolve().then(() => scheduled[0]!())
    // 先触发重连，再打开第二根插座。
    await Promise.resolve()
    second.open()
    await connecting
    await new Promise((r) => setTimeout(r, 0))
    expect(second.sent.some((s) => s.includes('"after":3'))).toBe(true)
    expect(second.sent.some((s) => s.includes('"type":"update"'))).toBe(true)
    session.stop()
  })
})
