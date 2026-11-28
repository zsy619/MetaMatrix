import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  captureYjsVersion,
  attachRestoredYjsState,
  parseRestoredVersion,
  planVersionRestore,
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

describe('parseRestoredVersion', () => {
  it('兼容只回 HTML 的旧事件，并抽出 yjsState', () => {
    expect(parseRestoredVersion('<p>x</p>')).toEqual({ html: '<p>x</p>' })
    expect(parseRestoredVersion({ html: '<p>y</p>', yjsState: 'abc' })).toEqual({ html: '<p>y</p>', yjsState: 'abc' })
    expect(parseRestoredVersion({ html: '<p>z</p>', yjsState: '  ' })).toEqual({ html: '<p>z</p>' })
  })
})

describe('planVersionRestore', () => {
  it('标明要先退出协同，并带上 yjsState', () => {
    expect(planVersionRestore(true, { html: '<p>旧</p>', yjsState: 'abc' })).toEqual({
      stopCollab: true,
      html: '<p>旧</p>',
      yjsState: 'abc',
    })
    expect(planVersionRestore(false, '<p>只是 HTML</p>')).toEqual({
      stopCollab: false,
      html: '<p>只是 HTML</p>',
    })
  })
})

describe('attachRestoredYjsState', () => {
  it('正文未改时带上 yjsState，改过则不带，避免写回旧快照', () => {
    const restored = { html: '<p>旧</p>', yjsState: 'abc' }
    expect(attachRestoredYjsState({ type: 'doc', html: '<p>旧</p>' }, restored)).toEqual({
      type: 'doc',
      html: '<p>旧</p>',
      yjsState: 'abc',
    })
    expect(attachRestoredYjsState({ type: 'doc', html: '<p>已改</p>' }, restored)).toEqual({
      type: 'doc',
      html: '<p>已改</p>',
    })
    expect(attachRestoredYjsState({ type: 'doc', html: '<p>旧</p>' }, null)).toEqual({
      type: 'doc',
      html: '<p>旧</p>',
    })
  })
})
