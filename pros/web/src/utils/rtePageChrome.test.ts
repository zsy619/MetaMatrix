import assert from 'node:assert/strict'
import {
  applyChromeReserve,
  estimatePageCount,
  formatPageNumber,
  groupSlides,
  headerForPage,
  normalizePageChrome,
  pageBreakGap,
  pageIndexAt,
  pagesWithBreaks,
  printPageSideCss,
  printSheetCss,
  segmentHeights,
  shiftGutterSide,
  splitPreviewPages,
  unwrapPageBreaks,
  readPageChrome,
  writePageChrome,
} from './rtePageChrome.ts'

assert.deepEqual(readPageChrome(undefined, 'p1'), {
  header: '',
  headerEven: '',
  footer: '',
  footerEven: '',
  pageNumber: 'none',
  gutter: 0,
})
assert.deepEqual(normalizePageChrome({ header: ' 机密\n', footer: '内部', pageNumber: 'nope' }), {
  header: '机密',
  headerEven: '',
  footer: '内部',
  footerEven: '',
  pageNumber: 'none',
  gutter: 0,
})
assert.equal(
  writePageChrome(undefined, 'p1', {
    header: '',
    headerEven: '',
    footer: '',
    footerEven: '',
    pageNumber: 'none',
    gutter: 0,
  }),
  undefined,
)
assert.deepEqual(
  writePageChrome(undefined, 'p1', {
    header: '机密',
    headerEven: '',
    footer: '内部',
    footerEven: '',
    pageNumber: 'page-n-of-m',
    gutter: 0,
  }),
  {
    p1: {
      header: '机密',
      headerEven: '',
      footer: '内部',
      footerEven: '',
      pageNumber: 'page-n-of-m',
      gutter: 0,
    },
  },
)
assert.equal(
  writePageChrome(
    { p1: { header: '机密', footer: '', pageNumber: 'none' } },
    'p1',
    { header: '  ', headerEven: '', footer: '', footerEven: '', pageNumber: 'none', gutter: 0 },
  ),
  undefined,
)

assert.deepEqual(
  applyChromeReserve({ top: 25.4, bottom: 0 }, {
    header: '',
    headerEven: '',
    footer: '',
    footerEven: '',
    pageNumber: 'none',
    gutter: 0,
  }),
  { top: 25.4, bottom: 0 },
)
assert.deepEqual(
  applyChromeReserve({ top: 0, bottom: 0 }, {
    header: '题',
    headerEven: '',
    footer: '',
    footerEven: '',
    pageNumber: 'page-n',
    gutter: 0,
  }),
  { top: 10, bottom: 10 },
)

assert.equal(formatPageNumber('none', 2, 5), '')
assert.equal(formatPageNumber('n', 2, 5), '2')
assert.equal(formatPageNumber('page-n', 2, 5), '第 2 页')
assert.equal(formatPageNumber('page-n-of-m', 2, 5), '第 2 页 共 5 页')
assert.equal(formatPageNumber('dash', 2, 5), '- 2 -')
assert.equal(formatPageNumber('upper-roman', 4, 10), 'IV')
assert.equal(formatPageNumber('roman', 4, 10), 'iv')
assert.equal(formatPageNumber('roman', 9, 10), 'ix')
const sideChrome = normalizePageChrome({ header: '奇数', headerEven: '偶数', footer: '', pageNumber: 'none' })
assert.deepEqual(shiftGutterSide({ top: 10, right: 12, bottom: 10, left: 20 }, 8, 1), {
  top: 10,
  right: 12,
  bottom: 10,
  left: 20,
})
assert.deepEqual(shiftGutterSide({ top: 10, right: 12, bottom: 10, left: 20 }, 8, 2), {
  top: 10,
  right: 20,
  bottom: 10,
  left: 12,
})
assert.equal(headerForPage(sideChrome, 0), '奇数')
assert.equal(headerForPage(sideChrome, 1), '奇数')
assert.equal(headerForPage(sideChrome, 2), '偶数')
assert.deepEqual(
  applyChromeReserve({ top: 0, bottom: 0 }, {
    header: '',
    headerEven: '偶数',
    footer: '',
    footerEven: '偶底',
    pageNumber: 'none',
    gutter: 0,
  }),
  { top: 10, bottom: 10 },
)
assert.match(printSheetCss('A4', { top: 20, right: 15, bottom: 20, left: 15 }, 8), /margin: 20mm 15mm 20mm 23mm/)
assert.match(printSheetCss('A4', { top: 20, right: 15, bottom: 20, left: 15 }, 8), /@page :left \{ margin: 20mm 23mm 20mm 15mm/)
assert.equal(printSheetCss('A4', { top: 20, right: 15, bottom: 20, left: 15 }, 0).includes(':left'), false)
assert.match(printPageSideCss(sideChrome), /@page :left/)
assert.match(printPageSideCss(sideChrome), /偶数/)
assert.equal(printPageSideCss(normalizePageChrome({ header: '只有奇数', pageNumber: 'none' })), '')
const numbered = normalizePageChrome({
  header: '奇数',
  headerEven: '偶数',
  footer: '底',
  footerEven: '偶底',
  pageNumber: 'page-n-of-m',
})
const numberedCss = printPageSideCss(numbered)
assert.match(numberedCss, /counter\(page\)/)
assert.match(numberedCss, /counter\(pages\)/)
assert.match(numberedCss, /@bottom-right/)
assert.match(numberedCss, /偶底/)
assert.equal(estimatePageCount(1000, 400), 3)
assert.equal(estimatePageCount(0, 400), 1)
assert.deepEqual(segmentHeights([200, 0, 5000], 1000), [200, 800])
assert.deepEqual(segmentHeights([200, 200, 500], 1000), [200, 300, 500])
assert.equal(pagesWithBreaks([1000], 400), 3)
assert.equal(pagesWithBreaks([200, 800], 400), 3)
assert.equal(pagesWithBreaks([0, 100], 400), 1)
assert.equal(pageIndexAt([200, 800], 400, 0), 1)
assert.equal(pageIndexAt([200, 800], 400, 200), 2)
assert.equal(pageIndexAt([200, 800], 400, 600), 3)
assert.equal(pageBreakGap(200, 28, 400), 172)
assert.equal(pageBreakGap(0, 28, 400), 0)
assert.equal(pageBreakGap(390, 28, 400), 0)
assert.deepEqual(unwrapPageBreaks([200, 800], [200, 28], [172, 0], 1200), {
  offsets: [200, 628],
  heights: [28, 28],
  content: 1028,
})
assert.deepEqual(
  splitPreviewPages('<p>上</p><div data-page-break="true" class="rte-page-break"><span>分页符</span></div><p>下</p>'),
  ['<p>上</p>', '<p>下</p>'],
)
assert.deepEqual(
  splitPreviewPages('<p>甲</p><hr data-page-break="true"><hr data-page-break="true"><p>乙</p>'),
  ['<p>甲</p>', '<p>乙</p>'],
)
assert.deepEqual(splitPreviewPages('<div data-page-break="true"></div><p>下</p>'), ['<p>下</p>'])
assert.deepEqual(splitPreviewPages('<p>没有分页</p>'), ['<p>没有分页</p>'])

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
