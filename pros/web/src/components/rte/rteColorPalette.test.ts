import { describe, expect, it } from 'vitest'
import { pushRecentColor, themeColorLabel } from './rteColorPalette'

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
