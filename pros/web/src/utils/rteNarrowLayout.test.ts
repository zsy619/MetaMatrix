import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  NARROW_LAYOUT_MAX_WIDTH,
  NARROW_LAYOUT_MEDIA_QUERY,
  isNarrowViewportWidth,
  resolveToolbarLayout,
} from './rteNarrowLayout.ts'

describe('窄屏视口判定', () => {
  it('375 / 768 属于窄屏，901 及以上不是', () => {
    expect(isNarrowViewportWidth(375)).toBe(true)
    expect(isNarrowViewportWidth(768)).toBe(true)
    expect(isNarrowViewportWidth(NARROW_LAYOUT_MAX_WIDTH)).toBe(true)
    expect(isNarrowViewportWidth(NARROW_LAYOUT_MAX_WIDTH + 1)).toBe(false)
    expect(isNarrowViewportWidth(1440)).toBe(false)
  })

  it('非法宽度按非窄屏处理（不误切紧凑态）', () => {
    expect(isNarrowViewportWidth(undefined)).toBe(false)
    expect(isNarrowViewportWidth(null)).toBe(false)
    expect(isNarrowViewportWidth(Number.NaN)).toBe(false)
    expect(isNarrowViewportWidth(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('媒体查询串与阈值一致', () => {
    expect(NARROW_LAYOUT_MEDIA_QUERY).toBe(`(max-width: ${NARROW_LAYOUT_MAX_WIDTH}px)`)
  })
})

describe('工具栏布局形态', () => {
  it('宽屏 + 最大化 → expanded', () => {
    expect(resolveToolbarLayout(true, false)).toBe('expanded')
  })

  it('窄屏一律 compact（主栏 +「更多」），避免横向撑破视口', () => {
    expect(resolveToolbarLayout(true, true)).toBe('compact')
    expect(resolveToolbarLayout(false, true)).toBe('compact')
  })

  it('宽屏 + 非最大化 → compact', () => {
    expect(resolveToolbarLayout(false, false)).toBe('compact')
  })
})

describe('CSS 断点与 JS 阈值对齐', () => {
  const cssPath = fileURLToPath(
    new URL('../components/rte/styles/editor.scoped.css', import.meta.url),
  )
  const css = readFileSync(cssPath, 'utf-8')

  it('editor.scoped.css 使用与 NARROW_LAYOUT_MAX_WIDTH 相同的断点', () => {
    assert.ok(
      css.includes(`@media (max-width: ${NARROW_LAYOUT_MAX_WIDTH}px)`),
      `editor.scoped.css 缺少 @media (max-width: ${NARROW_LAYOUT_MAX_WIDTH}px)`,
    )
  })

  it('窄屏下工具栏允许换行而不是横向滚动', () => {
    assert.ok(css.includes('flex-wrap: wrap'), 'editor.scoped.css 缺少 flex-wrap: wrap')
  })
})
