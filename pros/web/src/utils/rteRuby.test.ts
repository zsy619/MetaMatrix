import { describe, expect, it } from 'vitest'
import { rubyPieces } from './rteRuby'

describe('自动注音', () => {
  it('按词给汉字标声调，多音字跟着词走', () => {
    expect(rubyPieces('银行')).toEqual([
      { text: '银', ruby: 'yín' },
      { text: '行', ruby: 'háng' },
    ])
    expect(rubyPieces('重庆')).toEqual([
      { text: '重', ruby: 'chóng' },
      { text: '庆', ruby: 'qìng' },
    ])
  })

  it('标点和英文留在原文里，但不加拼音', () => {
    expect(rubyPieces('你好，A1')).toEqual([
      { text: '你', ruby: 'nǐ' },
      { text: '好', ruby: 'hǎo' },
      { text: '，A1', ruby: '' },
    ])
  })
})