// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import * as Y from 'yjs'
import {
  Awareness,
  collabCaretColor,
  onlineAwarenessMembers,
  relativeCursor,
  relayAwareness,
  remoteCaretStates,
} from './collabAwareness'
import { encodeYUpdate, LiveCollabSession } from './yDocCollab'
import { isCollabWritable, memoryOfflineQueueStore } from './collabOfflineQueue'

const editors: Editor[] = []
const docs: Y.Doc[] = []

afterEach(() => {
  while (editors.length) {
    editors.pop()?.destroy()
  }
  while (docs.length) {
    try {
      docs.pop()?.destroy()
    } catch {
      /* ignore */
    }
  }
})

function trackDoc(doc: Y.Doc): Y.Doc {
  docs.push(doc)
  return doc
}

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
    deliver(raw: string) {
      ;(listeners.message ||= []).forEach((fn) => fn({ data: raw } as MessageEvent))
    },
  }
  return fake
}

describe('collabCaretColor', () => {
  it('同一身份始终得到合法的 #RRGGBB', () => {
    const a = collabCaretColor('user-1')
    const b = collabCaretColor('user-1')
    expect(a).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(a).toBe(b)
    expect(collabCaretColor('user-2')).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

describe('awareness 光标与在线名单', () => {
  it('两个虚拟协作者对接后，一方能见到另一方的光标和选区', () => {
    const docA = trackDoc(new Y.Doc())
    const docB = trackDoc(new Y.Doc())
    const awA = new Awareness(docA)
    const awB = new Awareness(docB)
    const cursor = relativeCursor(docA, 'default', 0, 3)
    awA.setLocalState({
      user: { name: 'Alice', color: '#dc2626', id: 'u-a' },
      cursor,
    })
    relayAwareness(awA, awB)

    const remote = remoteCaretStates(awB)
    expect(remote.length).toBe(1)
    expect(remote[0]?.user?.name).toBe('Alice')
    expect(remote[0]?.user?.color).toBe('#dc2626')
    expect(remote[0]?.cursor).toBeTruthy()
    expect(remote[0]?.cursor?.anchor).toBeTruthy()
    expect(remote[0]?.cursor?.head).toBeTruthy()
    expect(remote.some((item) => item.clientId === awB.clientID)).toBe(false)
  })

  it('在线名单包含房间内成员，离房后不再出现', () => {
    const docA = trackDoc(new Y.Doc())
    const docB = trackDoc(new Y.Doc())
    const awA = new Awareness(docA)
    const awB = new Awareness(docB)
    awA.setLocalState({ user: { name: 'Alice', color: '#dc2626', id: 'u-a' } })
    awB.setLocalState({ user: { name: 'Bob', color: '#2563eb', id: 'u-b' } })
    relayAwareness(awA, awB)
    relayAwareness(awB, awA)

    const onA = onlineAwarenessMembers(awA)
    const onB = onlineAwarenessMembers(awB)
    expect(onA.map((m) => m.name).sort()).toEqual(['Alice', 'Bob'])
    expect(onB.map((m) => m.name).sort()).toEqual(['Alice', 'Bob'])

    awA.setLocalState(null)
    relayAwareness(awA, awB, [awA.clientID])
    expect(onlineAwarenessMembers(awB).map((m) => m.name)).toEqual(['Bob'])
    expect(remoteCaretStates(awB).some((item) => item.user?.name === 'Alice')).toBe(false)
  })

  it('CollaborationCaret 存储里能看到对方用户', async () => {
    const yA = trackDoc(new Y.Doc())
    const yB = trackDoc(new Y.Doc())
    const awA = new Awareness(yA)
    const awB = new Awareness(yB)
    yA.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      Y.applyUpdate(yB, update, 'remote')
    })
    yB.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      Y.applyUpdate(yA, update, 'remote')
    })
    awA.on('update', (_changes: unknown, origin: unknown) => {
      if (origin === 'remote') return
      relayAwareness(awA, awB)
    })
    awB.on('update', (_changes: unknown, origin: unknown) => {
      if (origin === 'remote') return
      relayAwareness(awB, awA)
    })

    const hostA = document.createElement('div')
    const hostB = document.createElement('div')
    document.body.appendChild(hostA)
    document.body.appendChild(hostB)
    const edA = new Editor({
      element: hostA,
      extensions: [
        StarterKit.configure({ dropcursor: false, undoRedo: false }),
        Collaboration.configure({ document: yA }),
        CollaborationCaret.configure({
          provider: { awareness: awA },
          user: { name: 'Alice', color: '#dc2626' },
        }),
      ],
    })
    const edB = new Editor({
      element: hostB,
      extensions: [
        StarterKit.configure({ dropcursor: false, undoRedo: false }),
        Collaboration.configure({ document: yB }),
        CollaborationCaret.configure({
          provider: { awareness: awB },
          user: { name: 'Bob', color: '#2563eb' },
        }),
      ],
    })
    editors.push(edA, edB)
    edA.commands.setContent('<p>hello world</p>')
    edA.commands.setTextSelection({ from: 1, to: 6 })
    await new Promise((r) => setTimeout(r, 30))

    const usersOnB = edB.storage.collaborationCaret.users as Array<{ clientId: number; name?: string }>
    expect(usersOnB.some((u) => u.name === 'Alice')).toBe(true)
    const remote = remoteCaretStates(awB)
    expect(remote.some((item) => item.user?.name === 'Alice')).toBe(true)
  })
})

describe('LiveCollabSession awareness 通道', () => {
  it('浏览者仍不发送正文 update，但可以上报 awareness', async () => {
    const ydoc = trackDoc(new Y.Doc())
    const sock = createFakeSocket()
    const session = new LiveCollabSession({
      documentId: 'd-aw',
      token: 't',
      ydoc,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: memoryOfflineQueueStore(),
      socketFactory: () => sock,
      user: { name: 'Viewer', color: '#059669', id: 'v1' },
    })
    const started = session.start()
    sock.open()
    await started
    sock.deliver(JSON.stringify({ type: 'hello', canWrite: false, role: 'viewer' }))
    expect(isCollabWritable({ canWrite: session.canWrite, role: session.role })).toBe(false)

    const sentBefore = sock.sent.length
    ydoc.getMap('m').set('secret', 'nope')
    await new Promise((r) => setTimeout(r, 0))
    expect(sock.sent.slice(sentBefore).some((s) => s.includes('"type":"update"'))).toBe(false)

    session.awareness.setLocalStateField('cursor', relativeCursor(ydoc, 'default', 1, 2))
    await new Promise((r) => setTimeout(r, 0))
    expect(sock.sent.some((s) => s.includes('"type":"awareness"'))).toBe(true)
    session.stop()
  })

  it('收到对方 awareness 后能见到光标；presence 离房后从名单消失', async () => {
    const yA = trackDoc(new Y.Doc())
    const yB = trackDoc(new Y.Doc())
    const sockA = createFakeSocket()
    const sockB = createFakeSocket()
    const seenA: unknown[][] = []
    const seenB: unknown[][] = []
    const sessionA = new LiveCollabSession({
      documentId: 'd-room',
      token: 't',
      ydoc: yA,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: memoryOfflineQueueStore(),
      socketFactory: () => sockA,
      user: { name: 'Alice', color: '#dc2626', id: 'u-a' },
      onPresence: (users) => seenA.push(users),
    })
    const sessionB = new LiveCollabSession({
      documentId: 'd-room',
      token: 't',
      ydoc: yB,
      socketURL: 'ws://example.test/collab',
      heartbeatIntervalMs: 0,
      offlineStore: memoryOfflineQueueStore(),
      socketFactory: () => sockB,
      user: { name: 'Bob', color: '#2563eb', id: 'u-b' },
      onPresence: (users) => seenB.push(users),
    })
    const startedA = sessionA.start()
    sockA.open()
    await startedA
    const startedB = sessionB.start()
    sockB.open()
    await startedB

    // 把 A 发出的 awareness 交给 B（假通道）。
    for (const raw of sockA.sent) {
      const msg = JSON.parse(raw) as { type?: string }
      if (msg.type === 'awareness') sockB.deliver(raw)
    }
    const remoteOnB = remoteCaretStates(sessionB.awareness)
    expect(remoteOnB.some((item) => item.user?.name === 'Alice')).toBe(true)

    const members = [
      { userId: 'u-a', name: 'Alice', avatar: '', editing: true, cursor: '', lastSeen: '' },
      { userId: 'u-b', name: 'Bob', avatar: '', editing: true, cursor: '', lastSeen: '' },
    ]
    sockA.deliver(JSON.stringify({ type: 'presence', users: members }))
    sockB.deliver(JSON.stringify({ type: 'presence', users: members }))
    expect((seenA.at(-1) as { userId: string }[]).map((u) => u.userId).sort()).toEqual(['u-a', 'u-b'])
    expect((seenB.at(-1) as { userId: string }[]).map((u) => u.userId).sort()).toEqual(['u-a', 'u-b'])

    sockB.deliver(
      JSON.stringify({
        type: 'presence',
        users: [{ userId: 'u-b', name: 'Bob', avatar: '', editing: true, cursor: '', lastSeen: '' }],
      }),
    )
    expect((seenB.at(-1) as { userId: string }[]).map((u) => u.userId)).toEqual(['u-b'])
    sessionA.stop()
    sessionB.stop()
  })
})

void encodeYUpdate
