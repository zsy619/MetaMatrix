import { describe, expect, it } from 'vitest'
import {
  BLOCK_MENU,
  blockMenuButtonLabel,
  blockMenuSelection,
  isBlockMenuItemActive,
  visibleBlockMenuItems,
  type BlockMenuState,
} from './rteBlockMenu'

const empty: BlockMenuState = {
  headingLevel: 0,
  bullet: false,
  ordered: false,
  task: false,
  code: false,
  quote: null,
  callout: null,
  sync: false,
}

describe('正文下拉', () => {
  it('顶层顺序和飞书一致', () => {
    expect(BLOCK_MENU.map((item) => item.label)).toEqual([
      '正文',
      '一级标题',
      '二级标题',
      '三级标题',
      '其他标题',
      '有序列表',
      '无序列表',
      '任务',
      '代码块',
      '引用',
      '高亮块',
      '同步块',
    ])
  })

  it('其他标题展开后是四到六级', () => {
    const other = BLOCK_MENU.find((item) => item.id === 'other-headings')
    expect(other?.children?.map((item) => item.label)).toEqual(['四级标题', '五级标题', '六级标题'])
    const visible = visibleBlockMenuItems('other-headings').map((item) => item.id)
    expect(visible).toContain('h4')
    expect(visibleBlockMenuItems(null).some((item) => item.id === 'h4')).toBe(false)
  })

  it('当前块决定回显和勾选', () => {
    expect(blockMenuButtonLabel(empty)).toBe('正文')
    expect(blockMenuSelection(empty).id).toBe('paragraph')
    expect(blockMenuButtonLabel({ ...empty, headingLevel: 2 })).toBe('二级标题')
    expect(blockMenuButtonLabel({ ...empty, headingLevel: 5 })).toBe('五级标题')
    expect(isBlockMenuItemActive('other-headings', { ...empty, headingLevel: 5 })).toBe(true)
    expect(blockMenuButtonLabel({ ...empty, ordered: true, headingLevel: 1 })).toBe('有序列表')
    expect(blockMenuButtonLabel({ ...empty, quote: 'emphasis' })).toBe('引用')
    expect(isBlockMenuItemActive('quote', { ...empty, quote: 'verse' })).toBe(true)
    expect(isBlockMenuItemActive('quote-verse', { ...empty, quote: 'verse' })).toBe(true)
    expect(blockMenuButtonLabel({ ...empty, callout: 'warn', headingLevel: 1 })).toBe('高亮块')
    expect(blockMenuSelection({ ...empty, callout: 'warn' }).id).toBe('callout-warn')
  })
})
