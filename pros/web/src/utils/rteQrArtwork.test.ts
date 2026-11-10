// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { QR_PRESETS, makeQrArtwork, qrBits } from './rteQrArtwork'

describe('二维码图片', () => {
  it('定位点是实心的，配色彼此不同', () => {
    const bits = qrBits('https://example.com/report')
    expect(bits.size).toBeGreaterThan(20)
    expect(bits.dark(0, 0)).toBe(true)
    expect(bits.dark(3, 3)).toBe(true)
    expect(new Set(QR_PRESETS.map((preset) => preset.color)).size).toBe(QR_PRESETS.length)
  })

  it('空内容不生成图片', async () => {
    await expect(makeQrArtwork('   ')).rejects.toThrow('二维码内容是空的')
  })
})
