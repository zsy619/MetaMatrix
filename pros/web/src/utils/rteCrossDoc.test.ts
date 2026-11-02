import assert from 'node:assert/strict'
import {
  crossDocJumpHref,
  normalizeCrossDocHits,
  parseSyncBlockSource,
  syncBlockAttrs,
  syncBlockSummary,
} from './rteCrossDoc.ts'

// 解析：JSON 字符串
const parsed = parseSyncBlockSource(
  '{"documentId":"doc-1","documentTitle":"方案","panelId":"p1","blockId":"b1","syncedAt":"2026-01-01"}',
)
assert.ok(parsed)
assert.equal(parsed!.documentId, 'doc-1')
assert.equal(parsed!.documentTitle, '方案')
assert.equal(parsed!.panelId, 'p1')
assert.equal(parsed!.blockId, 'b1')
assert.equal(parsed!.syncedAt, '2026-01-01')

// 解析：对象
const fromObject = parseSyncBlockSource({ documentId: 'doc-2' })
assert.ok(fromObject)
assert.equal(fromObject!.documentId, 'doc-2')
assert.equal(fromObject!.panelId, undefined)

// 解析：非法输入
assert.equal(parseSyncBlockSource('not json'), null)
assert.equal(parseSyncBlockSource({}), null)
assert.equal(parseSyncBlockSource(null), null)
assert.equal(parseSyncBlockSource(123), null)

// data 属性：空值不写
const attrs = syncBlockAttrs({ documentId: 'doc-1', documentTitle: '方案' })
assert.equal(attrs['data-sync-document'], 'doc-1')
assert.equal(attrs['data-sync-title'], '方案')
assert.equal('data-sync-panel' in attrs, false)
assert.equal('data-sync-block' in attrs, false)
assert.equal('data-sync-at' in attrs, false)

// 摘要
assert.equal(syncBlockSummary('  一 二  三 '), '一 二 三')
assert.equal(syncBlockSummary('abc', 2), 'ab…')
assert.equal(syncBlockSummary('短', 60), '短')

// 命中去重与上限
const hits = normalizeCrossDocHits([
  { documentId: 'd1', title: '甲', panelId: 'p1' },
  { documentId: 'd1', title: '甲', panelId: 'p1' },
  { documentId: 'd1', title: '甲', panelId: 'p2' },
  { documentId: '', title: '空' },
  { documentId: 'd2', title: '乙' },
])
assert.equal(hits.length, 3)
assert.equal(normalizeCrossDocHits(hits, 2).length, 2)

// 跳转链接
assert.equal(crossDocJumpHref({ documentId: 'd1', title: '甲' }), '#/canvas/d1')
assert.equal(
  crossDocJumpHref({ documentId: 'd1', title: '甲', panelId: 'p1' }),
  '#/canvas/d1?panel=p1',
)

console.log('rteCrossDoc ok')
