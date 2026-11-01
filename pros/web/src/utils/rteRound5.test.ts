import assert from 'node:assert/strict'
import {
  canRunFindReplace,
  dateChipText,
  imageReplaceSide,
  todayIso,
} from './rteRound5.ts'

assert.equal(todayIso(new Date(2026, 10, 1)), '2026-11-01')
assert.equal(dateChipText('2026-11-01', 'date', ''), '2026-11-01')
assert.equal(dateChipText('2026-11-01', 'remind', '评审'), '2026-11-01 · 评审')
assert.equal(dateChipText('', 'date', ''), '日期')

assert.equal(imageReplaceSide('paragraph', 'image'), 'after')
assert.equal(imageReplaceSide('image', 'text'), 'before')
assert.equal(imageReplaceSide('paragraph', 'text'), null)

assert.equal(canRunFindReplace('甲', 2), true)
assert.equal(canRunFindReplace('  ', 2), false)
assert.equal(canRunFindReplace('甲', 0), false)

console.log('feishu round5 guards ok')
