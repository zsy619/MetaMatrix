// @vitest-environment happy-dom
/**
 * 媒体占位图的契约：
 * - 按文件名 / MIME 判定类型；
 * - 文件名截断、特殊字符转义；
 * - 换上占位图后保留原始地址，能原样恢复；
 * - 占位图不再走浏览器的裂图样式。
 */
import { describe, expect, it } from 'vitest'
import {
  applyMediaPlaceholder,
  buildPlaceholderSvg,
  placeholderDataUrl,
  placeholderKind,
  restoreMediaSrc,
  truncateFileName,
} from './mediaPlaceholder'

describe('媒体占位图', () => {
  it('按文件名与 MIME 判定类型', () => {
    expect(placeholderKind('a.png')).toBe('image')
    expect(placeholderKind('a.png', 'image/png')).toBe('image')
    expect(placeholderKind('a.pdf')).toBe('pdf')
    expect(placeholderKind('a.pdf', 'application/pdf')).toBe('pdf')
    expect(placeholderKind('a.xlsx')).toBe('sheet')
    expect(placeholderKind('a.csv', 'text/csv')).toBe('sheet')
    expect(placeholderKind('a.docx')).toBe('doc')
    expect(placeholderKind('a.md')).toBe('doc')
    expect(placeholderKind('a.mp4')).toBe('video')
    expect(placeholderKind('a.mp3')).toBe('audio')
    expect(placeholderKind('a.zip')).toBe('archive')
    expect(placeholderKind('a.bin')).toBe('file')
  })

  it('文件名截断', () => {
    expect(truncateFileName('短名字.png')).toBe('短名字.png')
    const long = truncateFileName('很长的一个文件名很长的一个文件名很长的一个文件名.png')
    expect(long.length).toBe(22)
    expect(long.endsWith('…')).toBe(true)
  })

  it('SVG 里带文件名、类型与状态，特殊字符被转义', () => {
    const svg = buildPlaceholderSvg({ name: 'a&b<c>.png', kind: 'image', status: 'loading' })
    expect(svg).toContain('a&amp;b&lt;c&gt;.png')
    expect(svg).toContain('图片')
    expect(svg).toContain('正在加载')
  })

  it('data URI 可以直接放进 img src', () => {
    const url = placeholderDataUrl({ name: 'x.png', kind: 'image' })
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
  })

  it('换上占位图后保留原始地址，并能恢复', () => {
    const img = document.createElement('img')
    img.setAttribute('src', '/media/abc-123')
    img.classList.add('is-broken')

    expect(applyMediaPlaceholder(img, { name: 'x.png', kind: 'image', status: 'loading' })).toBe(true)
    expect(img.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true)
    expect(img.dataset.mediaOrigSrc).toBe('/media/abc-123')
    expect(img.dataset.mediaPlaceholder).toBe('1')
    expect(img.classList.contains('is-media-placeholder')).toBe(true)
    expect(img.classList.contains('is-broken')).toBe(false)

    expect(restoreMediaSrc(img)).toBe(true)
    expect(img.getAttribute('src')).toBe('/media/abc-123')
    expect(img.classList.contains('is-media-placeholder')).toBe(false)
  })
})
