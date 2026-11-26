import { describe, expect, it } from 'vitest'
import { CollabDoc, decodeBase64, encodeBase64, httpTransport, splitBlocks, type CollabTransport } from './crdtDoc'

/** 内存传输层：两个客户端共享同一批增量。 */
function memoryTransport(store: { seq: number; payload: string }[]): CollabTransport {
  return {
    async fetchUpdates(after) {
      return store.filter((u) => u.seq > after).map((u) => ({ seq: u.seq, kind: 'update' as const, payload: u.payload }))
    },
    async postUpdate(_kind, payload) {
      store.push({ seq: store.length + 1, payload })
      return store.length
    },
  }
}

describe('splitBlocks', () => {
  it('按顶层元素切块', () => {
    const blocks = splitBlocks('<p>一</p><p>二</p>')
    expect(blocks).toEqual(['<p>一</p>', '<p>二</p>'])
  })

  it('嵌套标签算同一个块', () => {
    const blocks = splitBlocks('<div><ul><li>a</li></ul></div><p>b</p>')
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toBe('<p>b</p>')
  })

  it('空内容返回空数组', () => {
    expect(splitBlocks('   ')).toEqual([])
  })
})

describe('CollabDoc', () => {
  it('两个客户端合并后内容一致', async () => {
    const store: { seq: number; payload: string }[] = []
    // writable 仅用于验证历史 LWW 算法；生产 HTTP 传输不可写。
    const a = new CollabDoc({ transport: memoryTransport(store), pollMs: 10, writable: true })
    const b = new CollabDoc({ transport: memoryTransport(store), pollMs: 10, writable: true })
    await a.start('<p>第一段</p><p>第二段</p>')
    await b.start('')

    // A 改第一块，B 改第二块：两边合并后应保留两处改动。
    a.applyLocal('<p>第一段改过</p><p>第二段</p>')
    b.applyLocal('<p>第一段改过</p><p>第二段也改过</p>')
    await a.pull()
    await b.pull()

    expect(a.html()).toContain('第一段改过')
    expect(a.html()).toContain('第二段也改过')
    expect(b.html()).toContain('第二段也改过')
    a.stop()
    b.stop()
  })

  it('base64 编解码可逆', () => {
    const bytes = new Uint8Array([1, 2, 3, 250])
    const decoded = decodeBase64(encodeBase64(bytes))
    expect(Array.from(decoded ?? [])).toEqual([1, 2, 3, 250])
  })
})


describe('A2b HTML CRDT 旁路只读', () => {
  it('默认 applyLocal 不会调用 postUpdate', async () => {
    let posted = 0
    const transport: CollabTransport = {
      async fetchUpdates() {
        return []
      },
      async postUpdate() {
        posted += 1
        return posted
      },
    }
    const doc = new CollabDoc({ transport, pollMs: 10 })
    await doc.start('<p>初稿</p>')
    doc.applyLocal('<p>改过</p>')
    await new Promise((r) => setTimeout(r, 15))
    expect(posted).toBe(0)
    expect(doc.html()).toContain('改过')
    doc.stop()
  })

  it('httpTransport.postUpdate 拒绝写入，不打 POST /crdt', async () => {
    await expect(httpTransport('doc-1').postUpdate('update', 'AQID')).rejects.toThrow(/read-only/)
  })
})
