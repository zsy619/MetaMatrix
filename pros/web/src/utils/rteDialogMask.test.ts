import { describe, expect, it } from 'vitest'
import { dialogHasDraft, maskShouldDismiss } from './rteDialogMask'

describe('弹窗遮罩', () => {
  it('空白弹窗可以关，有草稿或文件选择器时不关', () => {
    expect(maskShouldDismiss({ dirty: false, filePickActive: false })).toBe(true)
    expect(maskShouldDismiss({ dirty: true, filePickActive: false })).toBe(false)
    expect(maskShouldDismiss({ dirty: false, filePickActive: true })).toBe(false)
  })

  it('选中、链接、正在输入的分类都算未提交', () => {
    expect(dialogHasDraft({ selectedCount: 0, externalText: '', addingCategory: false, categoryName: '' })).toBe(false)
    expect(dialogHasDraft({ selectedCount: 1, externalText: '', addingCategory: false, categoryName: '' })).toBe(true)
    expect(dialogHasDraft({ selectedCount: 0, externalText: ' https://a ', addingCategory: false, categoryName: '' })).toBe(true)
    expect(dialogHasDraft({ selectedCount: 0, externalText: '', addingCategory: true, categoryName: '' })).toBe(true)
    expect(dialogHasDraft({ selectedCount: 0, externalText: '', addingCategory: false, categoryName: '课堂' })).toBe(true)
  })
})
