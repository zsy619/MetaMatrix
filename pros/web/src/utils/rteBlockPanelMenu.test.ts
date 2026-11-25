import { describe, expect, it } from 'vitest'
import {
  BLOCK_PANEL_ENTRIES,
  BLOCK_PANEL_INSERT_SECTIONS,
  BLOCK_PANEL_QUICK_ACTIONS,
  BLOCK_PANEL_TURN_ACTIONS,
  blockPanelCommandKey,
} from './rteBlockPanelMenu'

describe('「+」块操作面板', () => {
  it('同一条命令在整个面板里只出现一次', () => {
    const keys = BLOCK_PANEL_ENTRIES.map(blockPanelCommandKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('公式与分割线只留在基础图标区，常用区不再重复', () => {
    const frequent = BLOCK_PANEL_INSERT_SECTIONS.find((section) => section.label === '常用')
    expect(frequent?.items.map((item) => item.id)).toEqual([
      'image',
      'video',
      'attach',
      'table',
      'columns',
      'linkButton',
      'link',
    ])
    const quickIds = BLOCK_PANEL_QUICK_ACTIONS.map((item) => item.id)
    expect(quickIds).toContain('formula')
    expect(quickIds).toContain('hr')
  })

  it('转换为区只留基础区没覆盖的告示类型', () => {
    expect(BLOCK_PANEL_TURN_ACTIONS.map((item) => item.id)).toEqual(['warn', 'success', 'error'])
  })

  it('基础区保持 12 个图标（两行六列）', () => {
    expect(BLOCK_PANEL_QUICK_ACTIONS).toHaveLength(12)
  })

  it('每个条目要么是转换目标、要么是插入命令', () => {
    for (const entry of BLOCK_PANEL_ENTRIES) {
      expect(Boolean(entry.turn) !== Boolean(entry.slashId)).toBe(true)
    }
  })
})
