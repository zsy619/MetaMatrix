import { describe, expect, it } from 'vitest'
import {
  colorsEqual,
  highlightColorLabel,
  isLightHighlight,
  pushRecentColor,
  textColorLabel,
  themeColorLabel,
  WORD_HIGHLIGHT_COLORS,
  WORD_HIGHLIGHT_SOFT,
  WORD_HIGHLIGHT_VIVID,
  WORD_STANDARD_COLOR_ITEMS,
  WORD_THEME_COLORS,
  WORD_THEME_FLAT,
  WORD_THEME_ROWS,
} from './rteColorPalette'

describe('颜色板', () => {
  it('主题色第 0 行用列名，后面的格子带行号', () => {
    expect(themeColorLabel(0)).toBe('白')
    expect(themeColorLabel(4)).toBe('冰蓝')
    expect(themeColorLabel(9)).toBe('绿')
    expect(themeColorLabel(14)).toBe('冰蓝 · 1')
  })

  it('最近使用去重并把新颜色放到最前', () => {
    expect(pushRecentColor(['#111111'], '#222222')).toEqual(['#222222', '#111111'])
    expect(pushRecentColor(['#abcdef', '#111111'], '#ABCDEF')).toEqual(['#abcdef', '#111111'])
    expect(pushRecentColor(['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'], '#9', 8)).toEqual([
      '#9',
      '#1',
      '#2',
      '#3',
      '#4',
      '#5',
      '#6',
      '#7',
    ])
    expect(pushRecentColor(['#111111'], '  ')).toEqual(['#111111'])
  })
})

describe('共享色板数据（富文本编辑器与类飞书编辑器共用）', () => {
  it('主题色是 10 列 × 6 行，展平后 60 格', () => {
    expect(WORD_THEME_COLORS).toHaveLength(10)
    expect(WORD_THEME_ROWS).toHaveLength(6)
    expect(WORD_THEME_FLAT).toHaveLength(60)
    expect(WORD_THEME_FLAT[0]).toBe('#FFFFFF')
    expect(WORD_THEME_FLAT[59]).toBe('#375623')
  })

  it('标准颜色 10 个、高亮柔和 10 个 + 荧光笔 10 个', () => {
    expect(WORD_STANDARD_COLOR_ITEMS).toHaveLength(10)
    expect(WORD_HIGHLIGHT_SOFT).toHaveLength(10)
    expect(WORD_HIGHLIGHT_VIVID).toHaveLength(10)
    expect(WORD_HIGHLIGHT_COLORS).toHaveLength(20)
  })

  it('颜色名能落到中文标签', () => {
    expect(textColorLabel('#FF0000')).toBe('红色')
    expect(textColorLabel('#FFFFFF')).toBe('白')
    expect(textColorLabel('')).toBe('自动')
    expect(textColorLabel('#123456')).toBe('#123456')
    expect(highlightColorLabel('#FFF3BF')).toBe('淡黄')
    expect(highlightColorLabel('#00FF00')).toBe('荧光绿')
    expect(highlightColorLabel('')).toBe('无')
  })

  it('浅色判定用于给浅底配深字', () => {
    expect(isLightHighlight('#FFFFFF')).toBe(true)
    expect(isLightHighlight('#000000')).toBe(false)
    expect(isLightHighlight('#FFF3BF')).toBe(true)
    expect(isLightHighlight('#00FF00')).toBe(false)
    expect(isLightHighlight('')).toBe(true)
  })

  it('颜色比较忽略大小写', () => {
    expect(colorsEqual('#FF0000', '#ff0000')).toBe(true)
    expect(colorsEqual('#FF0000', '#00FF00')).toBe(false)
    expect(colorsEqual('', '')).toBe(false)
  })
})
