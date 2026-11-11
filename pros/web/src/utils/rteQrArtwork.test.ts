// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { QR_PRESETS, QR_PRESET_ROWS, QR_STYLES, makeQrArtwork, paintQr, qrBits, qrPixelSize, qrQuietModules } from './rteQrArtwork'

describe('二维码图片', () => {
  it('定位点是实心的，配色彼此不同', () => {
    const bits = qrBits('https://example.com/report')
    expect(bits.size).toBeGreaterThan(20)
    expect(bits.dark(0, 0)).toBe(true)
    expect(bits.dark(3, 3)).toBe(true)
    expect(QR_STYLES).toHaveLength(10)
    expect(QR_PRESET_ROWS).toHaveLength(2)
    expect(QR_PRESET_ROWS[0]).toHaveLength(8)
    expect(QR_PRESET_ROWS[1]).toHaveLength(8)
    expect(QR_PRESETS).toHaveLength(16)
    expect(new Set(QR_PRESETS.map((preset) => preset.color)).size).toBe(QR_PRESETS.length)
  })

  it('留白只接受窄、标准和宽，宽的图更大', () => {
    expect(qrQuietModules(6)).toBe(6)
    expect(qrQuietModules(2)).toBe(2)
    expect(qrQuietModules(3)).toBe(4)
    const text = 'https://example.com/report'
    const narrow = qrPixelSize(text, { quiet: 2, caption: false })
    const wide = qrPixelSize(text, { quiet: 6, caption: false })
    expect(wide.width).toBeGreaterThan(narrow.width)
    expect(wide.width - narrow.width).toBe(8 * 12)
  })

  it('空内容不生成图片', async () => {
    await expect(makeQrArtwork('   ')).rejects.toThrow('二维码内容是空的')
  })

  it('带底部说明时能画完预览，不再引用未定义的边长', () => {
    const calls: string[] = []
    const ctx = new Proxy(
      { canvas: { width: 0, height: 0 } },
      {
        get(target, prop) {
          if (prop in target) return target[prop as keyof typeof target]
          if (prop === 'measureText') return () => ({ width: 80 })
          return () => {
            calls.push(String(prop))
          }
        },
        set(target, prop, value) {
          if (prop === 'canvas') return false
          ;(target as Record<string, unknown>)[prop as string] = value
          return true
        },
      },
    ) as unknown as CanvasRenderingContext2D
    expect(() =>
      paintQr(ctx, 'https://www.baidu.com', {
        caption: true,
        description: '扫码查看详情',
        style: 'rounded',
        quiet: 4,
      }),
    ).not.toThrow()
    expect(calls).toContain('fillText')
    expect(ctx.canvas.width).toBeGreaterThan(0)
    expect(ctx.canvas.height).toBeGreaterThan(ctx.canvas.width)
  })
})
