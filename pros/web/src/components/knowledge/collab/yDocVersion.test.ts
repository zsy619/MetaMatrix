import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  captureYjsVersion,
  readYjsStateFromPayload,
  restoreYDocFromState,
  tryRestoreFromYSnapshot,
} from './yDocVersion'

describe('Yjs 版本快照', () => {
  it('用整包 state 可在空文档上恢复到快照时的正文', () => {
    const origin = new Y.Doc({ gc: false })
    origin.getText('t').insert(0, 'hello')
    const blob = captureYjsVersion(origin)
    origin.getText('t').insert(5, ' world')
    const restored = restoreYDocFromState(blob.state)
    expect(restored.getText('t').toString()).toBe('hello')
    expect(origin.getText('t').toString()).toBe('hello world')
    restored.destroy()
    origin.destroy()
  })

  it('在未 GC 的同源文档上，Y.Snapshot 能回到拍照时的内容', () => {
    const origin = new Y.Doc({ gc: false })
    origin.getText('t').insert(0, 'v1')
    const blob = captureYjsVersion(origin)
    origin.getText('t').insert(2, '-v2')
    const fromSnap = tryRestoreFromYSnapshot(origin, blob.snapshot)
    expect(fromSnap).not.toBeNull()
    expect(fromSnap!.getText('t').toString()).toBe('v1')
    fromSnap!.destroy()
    origin.destroy()
  })

  it('从 JSON 载荷里读 yjsState，缺字段则返回 null', () => {
    expect(readYjsStateFromPayload({ type: 'doc', html: '<p>x</p>', yjsState: 'abc' })).toBe('abc')
    expect(readYjsStateFromPayload({ html: '<p>x</p>' })).toBeNull()
  })
})
