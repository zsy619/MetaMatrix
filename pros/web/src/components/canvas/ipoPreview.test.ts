import { describe, expect, it } from 'vitest'
import { ipoBlockPreview } from './ipoPreview'

describe('IPO 方块摘要', () => {
  it('空内容不显示摘要', () => {
    expect(ipoBlockPreview([{ text: '' }, { text: '<p></p>' }])).toBe('')
    expect(ipoBlockPreview(undefined)).toBe('')
  })

  it('去掉富文本标签，多段合成可阅读的摘要', () => {
    expect(
      ipoBlockPreview([
        { text: '<p>用户访谈</p><p>工单记录</p>' },
        { text: '周报&amp;数据' },
      ]),
    ).toBe('用户访谈\n工单记录\n周报&数据')
  })

  it('过长摘要收成一行省略', () => {
    const preview = ipoBlockPreview([{ text: '甲'.repeat(200) }], 8)
    expect(preview).toBe(`${'甲'.repeat(8)}…`)
  })

  it('只有图片时仍提示方块里有内容', () => {
    expect(ipoBlockPreview([{ text: '<p><img src="a.png" alt=""></p>' }])).toBe('图片')
  })
})
