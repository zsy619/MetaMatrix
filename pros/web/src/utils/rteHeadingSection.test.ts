import { describe, expect, it } from 'vitest'
import { moveSectionIndexes, type SectionNode } from './rteHeadingSection'

const doc: SectionNode[] = [
  { type: 'heading', level: 1 },
  { type: 'paragraph', level: 1 },
  { type: 'heading', level: 1 },
  { type: 'paragraph', level: 1 },
  { type: 'heading', level: 2 },
  { type: 'paragraph', level: 1 },
]

describe('标题连同正文移动', () => {
  it('下移一节时，标题和下面的段落一起过去', () => {
    expect(moveSectionIndexes(doc, 0, 1)).toEqual([2, 3, 4, 5, 0, 1])
  })

  it('上移一节时，和上一节整段对调', () => {
    expect(moveSectionIndexes(doc, 2, -1)).toEqual([2, 3, 4, 5, 0, 1])
  })

  it('二级标题只带着自己的正文，不带走上一级', () => {
    expect(moveSectionIndexes(doc, 4, -1)).toEqual([0, 1, 4, 5, 2, 3])
  })

  it('最上面的标题不能再上移', () => {
    expect(moveSectionIndexes(doc, 0, -1)).toBeNull()
  })
})
