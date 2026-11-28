import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { compactYUpdates, mergeYUpdates } from './yDocGC'

function textOf(update: Uint8Array): string {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, update)
  const value = doc.getText('t').toString()
  doc.destroy()
  return value
}

describe('compactYUpdates', () => {
  it('压缩插入再删除的历史后，新文档只留下最终正文，且体积更小', () => {
    const doc = new Y.Doc({ gc: true })
    const updates: Uint8Array[] = []
    doc.on('update', (update: Uint8Array) => {
      updates.push(update)
    })
    const text = doc.getText('t')
    text.insert(0, 'keep ')
    text.insert(5, 'SECRET-SHOULD-GO')
    text.insert(text.length, ' visible')
    text.delete(5, 'SECRET-SHOULD-GO'.length)
    expect(text.toString()).toBe('keep  visible')
    expect(updates.length).toBeGreaterThan(2)

    const got = compactYUpdates(updates)
    expect(textOf(got.snapshot)).toBe('keep  visible')
    expect(got.updateCount).toBe(updates.length)
    expect(got.bytesAfter).toBeLessThan(got.bytesBefore)
    expect(new TextDecoder().decode(got.snapshot).includes('SECRET-SHOULD-GO')).toBe(false)
    doc.destroy()
  })

  it('mergeYUpdates 只合并增量，不保证丢掉已删内容', () => {
    const doc = new Y.Doc({ gc: false })
    const updates: Uint8Array[] = []
    doc.on('update', (update: Uint8Array) => updates.push(update))
    doc.getText('t').insert(0, 'ab')
    doc.getText('t').delete(0, 1)
    const merged = mergeYUpdates(updates)
    expect(textOf(merged)).toBe('b')
    expect(merged.byteLength).toBeGreaterThan(0)
    doc.destroy()
  })
})
