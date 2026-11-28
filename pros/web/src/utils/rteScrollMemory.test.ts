import { describe, expect, it } from 'vitest'
import {
  clearScrollMemory,
  readScrollMemory,
  scrollMemoryKey,
  writeScrollMemory,
} from './rteScrollMemory'

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k)
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v))
    },
  } as Storage
}

describe('rteScrollMemory', () => {
  it('写入后能读回滚动位置', () => {
    const s = fakeStorage()
    writeScrollMemory('doc:abc', 1234, s)
    expect(readScrollMemory('doc:abc', s)).toBe(1234)
    expect(s.getItem(scrollMemoryKey('doc:abc'))).toContain('1234')
  })

  it('不同作用域互不干扰', () => {
    const s = fakeStorage()
    writeScrollMemory('doc:abc', 100, s)
    writeScrollMemory('doc:def', 900, s)
    expect(readScrollMemory('doc:abc', s)).toBe(100)
    expect(readScrollMemory('doc:def', s)).toBe(900)
    expect(readScrollMemory('doc:other', s)).toBeNull()
  })

  it('顶部位置不记录', () => {
    const s = fakeStorage()
    writeScrollMemory('doc:abc', 0, s)
    expect(readScrollMemory('doc:abc', s)).toBeNull()
  })

  it('过期记录视为无效并清理', () => {
    const s = fakeStorage()
    s.setItem(
      scrollMemoryKey('doc:old'),
      JSON.stringify({ top: 500, at: Date.now() - 31 * 24 * 60 * 60 * 1000 }),
    )
    expect(readScrollMemory('doc:old', s)).toBeNull()
    expect(s.getItem(scrollMemoryKey('doc:old'))).toBeNull()
  })

  it('可以清除', () => {
    const s = fakeStorage()
    writeScrollMemory('doc:abc', 50, s)
    clearScrollMemory('doc:abc', s)
    expect(readScrollMemory('doc:abc', s)).toBeNull()
  })

  it('空作用域不落盘', () => {
    const s = fakeStorage()
    writeScrollMemory('', 100, s)
    expect(readScrollMemory('', s)).toBeNull()
    expect(s.length).toBe(0)
  })
})
