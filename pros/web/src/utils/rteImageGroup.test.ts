import assert from 'node:assert/strict'
import { blockHtmlIsKept } from './itemsHtml.ts'
import {
  groupInsertIndex,
  imagesFromColumns,
  insertRatio,
  moveItem,
  normalizeGroupRatios,
  ratioPercents,
  ratiosToAttr,
  removeRatio,
  resizePair,
  shouldDissolveGroup,
} from './rteImageGroup.ts'

assert.deepEqual(normalizeGroupRatios(3, undefined), [1, 1, 1])
assert.deepEqual(normalizeGroupRatios(2, '2:1'), [2, 1])
assert.deepEqual(normalizeGroupRatios(2, '1:1:1'), [1, 1])
assert.equal(ratiosToAttr([1, 2.345]), '1:2.35')
assert.deepEqual(ratioPercents([1, 3]), [25, 75])

assert.deepEqual(removeRatio([1, 2, 3], 1), [1, 3])
assert.deepEqual(insertRatio([1, 1], 0), [1, 1, 1])
assert.deepEqual(insertRatio([1, 1], 2), [1, 1, 1])

const resized = resizePair([1, 1, 1], 0, 0.25)
assert.equal(resized[0]! + resized[1]!, 2)
assert.ok(resized[0]! < resized[1]!)
assert.deepEqual(resizePair([1, 1], 0, 0.01)[0]! > 0, true)
assert.deepEqual(resizePair([1], 0, 0.5), [1])

assert.equal(shouldDissolveGroup(1), true)
assert.equal(shouldDissolveGroup(0), true)
assert.equal(shouldDissolveGroup(2), false)

assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
assert.equal(moveItem(['a', 'b'], 0, 0), null)
assert.equal(groupInsertIndex(0, 1, 'left'), 0)
assert.equal(groupInsertIndex(0, 1, 'right'), 1)
assert.equal(groupInsertIndex(2, 0, 'left'), 0)

const migrated = imagesFromColumns({
  type: 'columns',
  attrs: { ratios: '1:2' },
  content: [
    { type: 'column', content: [{ type: 'paragraph' }, { type: 'image', attrs: { src: 'a' } }] },
    { type: 'column', content: [{ type: 'image', attrs: { src: 'b' } }] },
  ],
})
assert.deepEqual(migrated?.ratios, [1, 2])
assert.deepEqual(
  migrated?.images.map((image) => image.attrs?.src),
  ['a', 'b'],
)
assert.equal(
  imagesFromColumns({
    type: 'columns',
    content: [
      { type: 'column', content: [{ type: 'image' }, { type: 'paragraph', content: [{ type: 'text', text: '说明' }] }] },
      { type: 'column', content: [{ type: 'image' }] },
    ],
  }),
  null,
)

assert.equal(blockHtmlIsKept('<div data-type="image-group"><img src="x"></div>'), true)

console.log('image group ok')
