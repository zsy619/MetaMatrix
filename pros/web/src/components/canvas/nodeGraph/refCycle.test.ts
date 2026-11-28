import { describe, expect, it } from 'vitest'
import { findRefProblem, refProblemMessage, type RefMap } from './refCycle'

const A = 'canvas-a'
const B = 'canvas-b'
const C = 'canvas-c'

describe('findRefProblem', () => {
  it('拒绝引用自己', () => {
    expect(findRefProblem({ selfCanvasId: A, targetCanvasId: A, refs: {} })).toBe('self')
  })

  it('没有引用关系时允许引用', () => {
    const refs: RefMap = { [A]: [C], [B]: [C] }
    expect(findRefProblem({ selfCanvasId: A, targetCanvasId: B, refs })).toBeNull()
  })

  it('拒绝直接成环 A → B → A', () => {
    const refs: RefMap = { [B]: [A] }
    expect(findRefProblem({ selfCanvasId: A, targetCanvasId: B, refs })).toBe('cycle')
  })

  it('拒绝间接成环 A → B → C → A', () => {
    const refs: RefMap = { [B]: [C], [C]: [A] }
    expect(findRefProblem({ selfCanvasId: A, targetCanvasId: B, refs })).toBe('cycle')
  })

  it('环在另一条支路上不算成环', () => {
    const refs: RefMap = { [B]: [C], [C]: [B] }
    expect(findRefProblem({ selfCanvasId: A, targetCanvasId: B, refs })).toBeNull()
  })

  it('空目标视为未选择', () => {
    expect(findRefProblem({ selfCanvasId: A, targetCanvasId: '', refs: {} })).toBe('missing')
  })

  it('每种原因都有中文提示', () => {
    expect(refProblemMessage('self')).toContain('自己')
    expect(refProblemMessage('cycle')).toContain('循环')
    expect(refProblemMessage(null)).toBe('')
  })
})
