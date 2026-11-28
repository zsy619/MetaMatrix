/**
 * 「快照型计算字段」的判定（前端 F-03）。
 *
 * 引用 / 汇总的值是**最近一次重算的结果**，不是写入时算好的 ——
 * 改了关联表之后要等服务端重算完才准，所以界面上要提示「值可能过期」。
 *
 * 而公式、创建时间、创建人这些字段虽然是 computed，
 * 但它们的值是写入时算好的，永远是新的 —— 不能一起标。
 */
import { describe, expect, it } from 'vitest'
import { isComputedField, isSnapshotField } from './registry'

describe('快照型计算字段判定', () => {
  it('引用 / 汇总属于快照字段', () => {
    expect(isSnapshotField('lookup')).toBe(true)
    expect(isSnapshotField('rollup')).toBe(true)
  })

  it('公式与系统字段是写入时算好的，不算快照', () => {
    expect(isSnapshotField('formula')).toBe(false)
    expect(isSnapshotField('created_at')).toBe(false)
    expect(isSnapshotField('updated_at')).toBe(false)
    expect(isSnapshotField('created_by')).toBe(false)
    expect(isSnapshotField('text')).toBe(false)
    expect(isSnapshotField('number')).toBe(false)
  })

  it('computed 的口径更宽（公式也算 computed），两者不要混用', () => {
    expect(isComputedField('formula')).toBe(true)
    expect(isSnapshotField('formula')).toBe(false)
  })
})
