import assert from 'node:assert/strict'
import {
  embedIframeSrc,
  orderSlashForMenu,
  pushRecentSlash,
  shouldTakeSnapshot,
} from './rteRound6.ts'
import { blockHtmlIsKept } from './itemsHtml.ts'

assert.deepEqual(pushRecentSlash(['b', 'a'], 'a'), ['a', 'b'])
assert.equal(pushRecentSlash(['a', 'b', 'c', 'd', 'e'], 'z').length, 5)

const ordered = orderSlashForMenu(
  [
    { id: 'h1', label: '标题' },
    { id: 'date', label: '日期' },
  ],
  '',
  ['date'],
)
assert.equal(ordered[0]?.sectionLabel, '最近使用')
assert.equal(ordered[0]?.id, 'date')
assert.equal(orderSlashForMenu([{ id: 'h1', label: '标题' }], '标题', ['h1'])[0]?.sectionLabel, undefined)

assert.ok(embedIframeSrc('https://www.youtube.com/embed/abc'))
assert.equal(embedIframeSrc('https://evil.example/phish'), null)
assert.equal(embedIframeSrc('http://www.youtube.com/embed/abc'), null)

assert.equal(shouldTakeSnapshot('<p>a</p>', '<p>a</p>', 20000), false)
assert.equal(shouldTakeSnapshot('<p>a</p>', '<p>ab</p>', 1000), false)
assert.equal(shouldTakeSnapshot('<p>a</p>', '<p>ab</p>', 20000), true)

assert.equal(blockHtmlIsKept('<div data-type="columns"></div>'), true)
assert.equal(blockHtmlIsKept('<span data-annotation="1">批注</span>'), true)
assert.equal(blockHtmlIsKept('<p></p>'), false)

console.log('feishu round6 guards ok')
