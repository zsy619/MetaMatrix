import assert from 'node:assert/strict'
import {
  clampImageWidth,
  imageDropKind,
  insertPosAfterDelete,
  normalizeImageAlign,
  normalizeImageLayout,
  placementActive,
  sameImageDrop,
  siblingInsertPos,
} from './rteImageLayout.ts'

assert.equal(normalizeImageAlign(undefined), 'center')
assert.equal(normalizeImageAlign('nope'), 'center')
assert.equal(normalizeImageAlign('left'), 'left')
assert.equal(normalizeImageLayout(undefined), 'block')
assert.equal(normalizeImageLayout(null, 'left'), 'wrap-left')
assert.equal(normalizeImageLayout('wrap-right'), 'wrap-right')
assert.equal(placementActive(undefined, undefined, { align: 'center', layout: 'block' }), true)
assert.equal(placementActive('left', 'block', { align: 'left', layout: 'block' }), true)
assert.equal(placementActive('left', 'wrap-left', { align: 'left', layout: 'block' }), false)

assert.equal(imageDropKind(0.3, 0.5, true), 'left')
assert.equal(imageDropKind(0.7, 0.5, true), 'right')
assert.equal(imageDropKind(0.5, 0.5, true), 'after')
assert.equal(imageDropKind(0.5, 0.2, true), 'before')
assert.equal(imageDropKind(0.5, 0.8, true), 'after')
assert.equal(imageDropKind(0.1, 0.8, false), 'after')

assert.equal(clampImageWidth(20, 400), 48)
assert.equal(clampImageWidth(900, 640), 640)
assert.equal(clampImageWidth(320, 640), 320)
assert.equal(clampImageWidth(100, 10), 48)

assert.equal(insertPosAfterDelete(10, 2, 20), 18)
assert.equal(insertPosAfterDelete(10, 2, 5), 5)
assert.equal(insertPosAfterDelete(10, 2, 11), 10)
assert.equal(sameImageDrop(10, 11, 2), true)
assert.equal(sameImageDrop(10, 14, 2), false)

assert.equal(siblingInsertPos([0, 10, 20], [10, 10, 8], 1, -1), 0)
assert.equal(siblingInsertPos([0, 10, 20], [10, 10, 8], 1, 1), 28)
assert.equal(siblingInsertPos([0, 10], [10, 4], 0, -1), null)
assert.equal(siblingInsertPos([0, 10], [10, 4], 1, 1), null)

console.log('image layout ok')
