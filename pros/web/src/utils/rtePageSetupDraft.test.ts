import { describe, expect, it } from 'vitest'
import { pageSetupDraftDirty, pageSetupDraftOf, resolvePageSetupDraft, type PageSetupSnap } from './rtePageSetupDraft'

const narrow: PageSetupSnap = {
  size: 'a4',
  margin: { preset: 'narrow', top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  chrome: { header: '', footer: '', pageNumber: 'none' },
}

describe('页面设置草稿', () => {
  it('没改过时不产生写入', () => {
    const draft = pageSetupDraftOf(narrow)
    expect(pageSetupDraftDirty(draft, { ...draft })).toBe(false)
    expect(resolvePageSetupDraft(narrow, draft)).toBeNull()
  })

  it('自定义边距原样保留，不改成预设盒', () => {
    const current: PageSetupSnap = {
      ...narrow,
      margin: { preset: 'custom', top: 3, right: 4, bottom: 5, left: 6 },
    }
    expect(resolvePageSetupDraft(current, pageSetupDraftOf(current))).toBeNull()
  })

  it('只改页眉时不动页面大小和边距', () => {
    const next = resolvePageSetupDraft(narrow, { ...pageSetupDraftOf(narrow), header: ' 验收页眉 ' })
    expect(next?.chrome.header).toBe('验收页眉')
    expect(next?.size).toBe('a4')
    expect(next?.margin).toEqual(narrow.margin)
  })

  it('不认识的边距预设不改已保存的边距', () => {
    expect(resolvePageSetupDraft(narrow, { ...pageSetupDraftOf(narrow), marginPreset: 'nope' })).toBeNull()
  })
})
