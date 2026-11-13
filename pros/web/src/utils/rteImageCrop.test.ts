import assert from 'node:assert/strict'
import {
  cropRect,
  cropStyle,
  keepCropOnReplace,
  normalizeImageCrop,
  parseAspectRatio,
} from './rteImageCrop.ts'

// 比例解析
assert.equal(parseAspectRatio('16/9'), 16 / 9)
assert.equal(parseAspectRatio('1:1'), 1)
assert.equal(parseAspectRatio('abc'), null)
assert.equal(parseAspectRatio('0/1'), null)
assert.equal(parseAspectRatio(null), null)

// 归一化：焦点夹取、缩放夹取、非法比例清空
const normalized = normalizeImageCrop({ aspect: '16/9', focusX: 5, focusY: -3, zoom: 99 })
assert.equal(normalized.focusX, 1)
assert.equal(normalized.focusY, 0)
assert.equal(normalized.zoom, 4)
assert.equal(normalized.aspect, '16/9')
assert.equal(normalizeImageCrop({ aspect: 'nope' }).aspect, null)
assert.equal(normalizeImageCrop(null).focusX, 0.5)
assert.equal(normalizeImageCrop(null).zoom, 1)

// 裁剪框：方形盒里放 16/9
const rect = cropRect({ aspect: '16/9' }, 100, 100)
assert.equal(Math.round(rect.width), 100)
assert.equal(Math.round(rect.height), 56)
// 焦点默认居中
assert.equal(Math.round(rect.x), 0)
assert.equal(Math.round(rect.y), Math.round((100 - 56.25) / 2))

// 焦点把矩形推到盒内
const rect2 = cropRect({ aspect: '16/9', focusX: 1, focusY: 1 }, 100, 100)
assert.ok(rect2.x >= 0 && rect2.x <= 100 - rect2.width)
assert.ok(rect2.y >= 0 && rect2.y <= 100 - rect2.height)

// 缩放缩小可见范围
const rect3 = cropRect({ aspect: '16/9', zoom: 2 }, 100, 100)
assert.ok(rect3.width < rect.width)

// 无裁剪时是整个盒子
const rect4 = cropRect(null, 100, 80)
assert.deepEqual(rect4, { x: 0, y: 0, width: 100, height: 80 })

// 样式
assert.deepEqual(cropStyle(null), {})
assert.deepEqual(cropStyle({ aspect: '16/9' }), {
  'object-fit': 'cover',
  'object-position': '50% 50%',
  'aspect-ratio': '16 / 9',
})
assert.equal(cropStyle({ zoom: 2 })['transform'], 'scale(2)')

// 替换保留裁剪
const replaced = keepCropOnReplace(
  { src: 'old.png', cropAspect: '1/1', cropFocusX: 0.2, cropFocusY: 0.8, cropZoom: 1.5, alt: '图' },
  'new.png',
)
assert.equal(replaced.src, 'new.png')
assert.equal(replaced.cropAspect, '1/1')
assert.equal(replaced.cropFocusX, 0.2)
assert.equal(replaced.cropFocusY, 0.8)
assert.equal(replaced.cropZoom, 1.5)
assert.equal(replaced.alt, '图')

// 没有裁剪参数时不凭空加
const plain = keepCropOnReplace({ src: 'old.png' }, 'new.png')
assert.equal(plain.cropAspect, undefined)

console.log('rteImageCrop ok')
