import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_PATTERNS,
  BACKGROUND_PRESETS,
  backgroundStyle,
  backgroundSvg,
  patternTile,
} from './background'
import { DEFAULT_NODE_GRAPH_BACKGROUND } from '../../../types/nodeGraph'

const base = DEFAULT_NODE_GRAPH_BACKGROUND

describe('画布背景模板', () => {
  it('点阵用径向渐变 + 间距', () => {
    const style = backgroundStyle({ ...base, pattern: 'dots', color: '#123456', size: 32 })
    expect(style.backgroundImage).toContain('radial-gradient')
    expect(style.backgroundImage).toContain('#123456')
    expect(style.backgroundSize).toBe('32px 32px')
  })

  it('网格是两层线性渐变，横线只有一层', () => {
    expect(backgroundStyle({ ...base, pattern: 'grid' }).backgroundImage?.split('linear-gradient').length).toBe(3)
    expect(backgroundStyle({ ...base, pattern: 'lines' }).backgroundSize).toBe('100% 24px')
  })

  it('纯色与空白不画图案', () => {
    expect(backgroundStyle({ ...base, pattern: 'solid' }).backgroundImage).toBe('none')
    expect(backgroundStyle({ ...base, pattern: 'none' }).backgroundImage).toBe('none')
  })

  it('导出用的背景：纯色只有一块底色，点阵用 pattern', () => {
    const solid = backgroundSvg({ ...base, pattern: 'solid', background: '#ffffff' }, 100, 50)
    expect(solid).toContain('fill="#ffffff"')
    expect(solid).not.toContain('<pattern')
    const dots = backgroundSvg({ ...base, pattern: 'dots' }, 100, 50)
    expect(dots).toContain('<pattern')
    expect(dots).toContain('<circle')
    expect(dots).toContain('url(#ng-bg)')
  })

  it('导出背景跟随画布平移缩放', () => {
    const style = backgroundStyle(
      { ...base, pattern: 'dots' },
      { x: 120, y: -80, zoom: 1.5 },
    )
    expect(style.backgroundPosition).toBe('120px -80px')
    expect(style.backgroundSize).toBe('36px 36px')
  })

  it('图案 18 个 + 空白，模板 12 个', () => {
    expect(BACKGROUND_PATTERNS.filter((item) => item.id !== 'none')).toHaveLength(18)
    expect(BACKGROUND_PATTERNS[BACKGROUND_PATTERNS.length - 1]!.id).toBe('none')
    expect(BACKGROUND_PRESETS).toHaveLength(12)
  })

  it('新图案用同一块 SVG 瓦片，画布与导出都生效', () => {
    expect(patternTile('hex', 24, '#123456')?.width).toBe(24)
    expect(patternTile('brick', 24, '#123456')?.width).toBe(48)
    for (const id of ['dotgrid', 'dash', 'brick', 'hex', 'tri', 'wave', 'diamond', 'circuit', 'star', 'rings'] as const) {
      const style = backgroundStyle({ ...base, pattern: id, size: 24 }, { x: 10, y: 20, zoom: 1.5 })
      expect(style.backgroundImage).toContain('data:image/svg+xml')
      const tile = patternTile(id, 24, base.color)!
      expect(style.backgroundSize).toBe(`${tile.width * 1.5}px ${tile.height * 1.5}px`)
      expect(backgroundSvg({ ...base, pattern: id }, 200, 100)).toContain('<pattern id="ng-bg"')
    }
  })
})
