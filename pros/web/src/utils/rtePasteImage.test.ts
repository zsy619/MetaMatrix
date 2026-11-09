// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { filesFromImageDataUrls, pasteCarriesText } from './rtePasteImage'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC'

describe('粘贴图片识别', () => {
  it('纯图片文件没有正文', () => {
    expect(pasteCarriesText('', '')).toBe(false)
    expect(pasteCarriesText('   ', '<html><body><img src="x.png"></body></html>')).toBe(false)
  })

  it('带文字的粘贴仍然算正文', () => {
    expect(pasteCarriesText('说明', '')).toBe(true)
    expect(pasteCarriesText('', '<p>说明</p><img src="x.png">')).toBe(true)
  })

  it('HTML 里的 data URL 能还原成图片文件', () => {
    const files = filesFromImageDataUrls(`<img src="${pixel}">`)
    expect(files).toHaveLength(1)
    expect(files[0]?.type).toBe('image/png')
    expect(files[0]?.name).toBe('粘贴的图片-1.png')
    expect(files[0]?.size).toBeGreaterThan(20)
  })
})
