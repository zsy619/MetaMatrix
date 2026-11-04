import assert from 'node:assert/strict'
import {
  cssPageSize,
  mmToPx,
  normalizePageSize,
  pdfPageFormat,
  readPageSize,
  sheetBox,
  writePageSizeMap,
} from './rtePageSize.ts'

assert.equal(normalizePageSize(undefined), 'a4')
assert.equal(normalizePageSize(''), 'a4')
assert.equal(normalizePageSize('nope'), 'a4')
assert.equal(normalizePageSize('a4'), 'a4')
assert.equal(normalizePageSize('8k'), '8k')
assert.equal(normalizePageSize('full'), 'full')

assert.equal(readPageSize(undefined, 'cell:top-left'), 'a4')
assert.equal(readPageSize({}, 'cell:top-left'), 'a4')
assert.equal(readPageSize({ 'cell:top-left': 'letter' }, 'cell:top-left'), 'letter')
assert.equal(readPageSize({ 'cell:top-left': 'bogus' }, 'cell:top-left'), 'a4')

// 缺省是 A4：写 A4 等于不写；显式选「宽度 100%」必须落库。
assert.equal(writePageSizeMap(undefined, 'p1', 'a4'), undefined)
assert.deepEqual(writePageSizeMap(undefined, 'p1', 'full'), { p1: 'full' })
assert.deepEqual(writePageSizeMap({ p1: 'a4' }, 'p1', 'full'), { p1: 'full' })
assert.deepEqual(writePageSizeMap({ p1: 'a4', p2: 'b5' }, 'p1', 'a4'), { p2: 'b5' })
assert.deepEqual(writePageSizeMap({ p1: 'full' }, 'p1', 'a4'), undefined)
assert.deepEqual(writePageSizeMap({ p1: 'full' }, 'p1', 'feishu'), { p1: 'feishu' })

const a4 = sheetBox('a4')
assert.ok(a4)
assert.equal(a4!.widthPx, mmToPx(210))
assert.equal(a4!.heightPx, mmToPx(297))
assert.ok(Math.abs(a4!.widthPx - 794) <= 2)
assert.equal(sheetBox('full'), null)
assert.equal(sheetBox('feishu'), null)

assert.equal(cssPageSize('a4'), 'A4')
assert.equal(cssPageSize('letter'), 'letter')
assert.equal(cssPageSize('8k'), '270mm 390mm')
assert.equal(cssPageSize('full'), 'auto')
assert.equal(cssPageSize('feishu'), '180mm 260mm')
for (const token of ['A4', 'A3', 'A5', 'B5', 'letter', '270mm 390mm', '180mm 260mm', 'auto']) {
  assert.equal(token.includes(';'), false)
}

assert.equal(pdfPageFormat('letter'), 'letter')
assert.deepEqual(pdfPageFormat('8k'), [270, 390])
assert.equal(pdfPageFormat('full'), 'a4')
assert.deepEqual(pdfPageFormat('feishu'), [180, 260])

console.log('feishu page size ok')
