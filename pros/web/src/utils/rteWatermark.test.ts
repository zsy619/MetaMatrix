import { describe, expect, it } from 'vitest'
import { normalizeWatermark, readWatermark, writeWatermark } from './rteWatermark'

describe('文档水印', () => {
  it('空文本不能单独打开', () => {
    expect(normalizeWatermark({ enabled: true, text: '  \n ' })).toEqual({ enabled: false, text: '' })
  })

  it('超长文字裁到 24 字，并按面板写回', () => {
    const text = '机密文档请勿外传给未授权的人员机密文档请勿外传给未授权的人员'
    const stored = writeWatermark(undefined, 'panel-a', { enabled: true, text })
    expect(stored?.['panel-a'].text).toHaveLength(24)
    expect(readWatermark(stored, 'panel-a').enabled).toBe(true)
  })

  it('关掉水印后这个面板不再占字段', () => {
    const stored = writeWatermark(
      { 'panel-a': { enabled: true, text: '内部' } },
      'panel-a',
      { enabled: false, text: '内部' },
    )
    expect(stored).toBeUndefined()
  })
})
