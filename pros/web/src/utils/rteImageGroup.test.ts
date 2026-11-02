import assert from 'node:assert/strict'
import { blockHtmlIsKept } from './itemsHtml.ts'
import {
  groupCssVars,
  groupInsertIndex,
  groupUsesAspect,
  IMAGE_ROW_LIMIT_TIP,
  imageGroupLayoutCss,
  imagesFromColumns,
  insertRatio,
  MAX_IMAGES_PER_ROW,
  moveItem,
  nextImageSelection,
  normalizeGroupRatios,
  ratioPercents,
  ratiosToAttr,
  removeRatio,
  resizePair,
  rowCanAccept,
  rowLayout,
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

assert.equal(groupCssVars(2, '1:2'), '--g0:1;--g1:2')
assert.equal(groupCssVars(3, null), '--g0:1;--g1:1;--g2:1')
assert.equal(rowCanAccept(9, 1), true)
assert.equal(rowCanAccept(10, 1), false)
assert.equal(MAX_IMAGES_PER_ROW, 10)
assert.equal(IMAGE_ROW_LIMIT_TIP.includes('10'), true)
const spots = [
  { pos: 1, row: 1 },
  { pos: 2, row: 1 },
  { pos: 8, row: 8 },
]
assert.equal(nextImageSelection(spots, 1, 'ArrowRight'), 2)
assert.equal(nextImageSelection(spots, 2, 'ArrowDown'), 8)
assert.equal(nextImageSelection(spots, 8, 'ArrowUp'), 1)
assert.equal(nextImageSelection(spots, 1, 'ArrowLeft'), null)
assert.equal(groupUsesAspect('custom'), false)
const laid = rowLayout(808, [2, 1], 8)
assert.equal(laid.widths[0]! + laid.widths[1]!, 800)
assert.equal(laid.height, 267)
assert.ok(laid.widths[0]! > laid.widths[1]!)
assert.match(imageGroupLayoutCss, /\.rte-image-drag-handle\{/)
assert.match(imageGroupLayoutCss, /-webkit-user-drag:none/)
assert.match(imageGroupLayoutCss, /position:relative/)
assert.match(imageGroupLayoutCss, /\.rte-image-group-divider\{/)
assert.match(imageGroupLayoutCss, /gap:8px/)
assert.match(imageGroupLayoutCss, /data-resize-wrapper/)
assert.match(imageGroupLayoutCss, /left:36px;top:8px/)
assert.doesNotMatch(imageGroupLayoutCss, /:deep/)
assert.match(imageGroupLayoutCss, /mode-preview[\s\S]*rte-image-drag-handle/)

console.log('image group ok')
