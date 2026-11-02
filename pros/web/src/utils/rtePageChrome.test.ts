import assert from 'node:assert/strict'
import {
  applyChromeReserve,
  estimatePageCount,
  formatPageNumber,
  groupSlides,
  normalizePageChrome,
  readPageChrome,
  writePageChrome,
} from './rtePageChrome.ts'

assert.deepEqual(readPageChrome(undefined, 'p1'), { header: '', footer: '', pageNumber: 'none' })
assert.deepEqual(normalizePageChrome({ header: ' 机密\n', footer: '内部', pageNumber: 'nope' }), {
  header: '机密',
  footer: '内部',
  pageNumber: 'none',
})
assert.equal(writePageChrome(undefined, 'p1', { header: '', footer: '', pageNumber: 'none' }), undefined)
assert.deepEqual(
  writePageChrome(undefined, 'p1', { header: '机密', footer: '内部', pageNumber: 'page-n-of-m' }),
  { p1: { header: '机密', footer: '内部', pageNumber: 'page-n-of-m' } },
)
assert.equal(
  writePageChrome(
    { p1: { header: '机密', footer: '', pageNumber: 'none' } },
    'p1',
    { header: '  ', footer: '', pageNumber: 'none' },
  ),
  undefined,
)

assert.deepEqual(applyChromeReserve({ top: 25.4, bottom: 0 }, { header: '', footer: '', pageNumber: 'none' }), {
  top: 25.4,
  bottom: 0,
})
assert.deepEqual(applyChromeReserve({ top: 0, bottom: 0 }, { header: '题', footer: '', pageNumber: 'page-n' }), {
  top: 10,
  bottom: 10,
})

assert.equal(formatPageNumber('none', 2, 5), '')
assert.equal(formatPageNumber('n', 2, 5), '2')
assert.equal(formatPageNumber('page-n', 2, 5), '第 2 页')
assert.equal(formatPageNumber('page-n-of-m', 2, 5), '第 2 页 共 5 页')
assert.equal(formatPageNumber('dash', 2, 5), '- 2 -')
assert.equal(estimatePageCount(1000, 400), 3)
assert.equal(estimatePageCount(0, 400), 1)

const blocks = [
  { html: '<p>引</p>', text: '引', heading: false },
  { html: '<h2>甲</h2>', text: '甲', heading: true },
  { html: '<p>一</p>', text: '一', heading: false },
  { html: '<p>二</p>', text: '二'.repeat(500), heading: false },
]
assert.deepEqual(groupSlides(blocks, 'block'), ['<p>引</p>', '<h2>甲</h2>', '<p>一</p>', '<p>二</p>'])
assert.deepEqual(groupSlides(blocks, 'screen'), ['<p>引</p>', '<h2>甲</h2><p>一</p>', '<p>二</p>'])
assert.equal(groupSlides([], 'block')[0]?.includes('空白文档'), true)
assert.equal(
  groupSlides(
    [
      { html: '<p><img alt="a"></p>', text: '', heading: false },
      { html: '<p><img alt="b"></p>', text: '', heading: false },
      { html: '<p><img alt="c"></p>', text: '', heading: false },
      { html: '<p><img alt="d"></p>', text: '', heading: false },
    ],
    'screen',
  ).length,
  2,
)

console.log('page chrome ok')
