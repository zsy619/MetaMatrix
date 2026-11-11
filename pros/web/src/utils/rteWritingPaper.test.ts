// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { normalizeWritingPaper, readWritingPaper, writeWritingPaper, writingPaperStorageKey } from './rteWritingPaper'

describe('书写纸面', () => {
  it('只接受已知样式，其它值回到默认', () => {
    expect(normalizeWritingPaper('xhs')).toBe('xhs')
    expect(normalizeWritingPaper('tianzi')).toBe('tianzi')
    expect(normalizeWritingPaper('nope')).toBe('')
    expect(normalizeWritingPaper(null)).toBe('')
  })

  it('按面板记住上次选择', () => {
    localStorage.removeItem(writingPaperStorageKey('panel-a'))
    expect(readWritingPaper('panel-a')).toBe('')
    writeWritingPaper('panel-a', 'letter')
    expect(readWritingPaper('panel-a')).toBe('letter')
    writeWritingPaper('panel-a', '')
    expect(readWritingPaper('panel-a')).toBe('')
  })
})