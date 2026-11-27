import { describe, expect, it } from 'vitest'
import {
  MAX_GROUPS,
  MAX_SORTS,
  mergeFilters,
  normalizeCombine,
  normalizeFilters,
  normalizeGroups,
  normalizeSorts,
  resolveFilters,
  resolveGroups,
  resolveSorts,
} from './viewQuery'

const cond = (fieldId: string) => ({ fieldId, operator: 'is', value: 'x' })

describe('base view query', () => {
  it('兼容历史迁移数据：旧版筛选是条件数组', () => {
    const f = normalizeFilters([cond('f1')])
    expect(f.logic).toBe('AND')
    expect(f.conditions).toHaveLength(1)
    expect(f.children).toEqual([])
  })

  it('空值归一化成空条件组', () => {
    expect(normalizeFilters(undefined).conditions).toEqual([])
    expect(normalizeFilters(null).conditions).toEqual([])
  })

  it('合并两组条件为 AND', () => {
    const a = { logic: 'AND' as const, conditions: [cond('f1')], children: [] }
    const b = { logic: 'OR' as const, conditions: [cond('f2')], children: [] }
    const merged = mergeFilters(a, b)
    expect(merged.logic).toBe('AND')
    expect(merged.conditions.map((c) => c.fieldId)).toEqual(['f1', 'f2'])
  })

  it('任一组为空时直接返回另一组', () => {
    const a = { logic: 'AND' as const, conditions: [cond('f1')], children: [] }
    const empty = { logic: 'AND' as const, conditions: [], children: [] }
    expect(mergeFilters(a, empty)).toBe(a)
    expect(mergeFilters(empty, a)).toBe(a)
  })

  it('组合方式只认 and，其余按覆盖处理', () => {
    expect(normalizeCombine('and')).toBe('and')
    expect(normalizeCombine('override')).toBe('override')
    expect(normalizeCombine(false)).toBe('override')
    expect(normalizeCombine(undefined)).toBe('override')
  })

  it('生效口径：覆盖模式用我的条件，叠加模式是共享 AND 我的', () => {
    const shared = { logic: 'AND' as const, conditions: [cond('shared')], children: [] }
    const personal = { logic: 'AND' as const, conditions: [cond('mine')], children: [] }
    expect(resolveFilters(shared, personal, 'override').conditions.map((c) => c.fieldId)).toEqual(['mine'])
    expect(resolveFilters(shared, personal, 'and').conditions.map((c) => c.fieldId)).toEqual(['shared', 'mine'])
    // 没有个人条件时永远用共享条件。
    expect(resolveFilters(shared, undefined, 'and')).toBe(shared)
  })

  it('排序与分组：叠加模式下个人为空时回落共享', () => {
    const sharedSorts = [{ fieldId: 'f1', order: 'asc' as const }]
    const sharedGroups = [{ fieldId: 'f2', order: 'asc' as const }]
    expect(resolveSorts(sharedSorts, [], 'and')).toEqual(sharedSorts)
    expect(resolveGroups(sharedGroups, [], 'and')).toEqual(sharedGroups)
    expect(resolveSorts(sharedSorts, [{ fieldId: 'f3', order: 'desc' }], 'override')).toEqual([
      { fieldId: 'f3', order: 'desc' },
    ])
  })

  it('重复的排序 / 分组规则会去重：历史视图里存了 9 条同字段分组', () => {
    const nine = Array.from({ length: 9 }, () => ({
      fieldId: 'f1',
      order: 'asc' as const,
    }))
    expect(normalizeGroups(nine)).toEqual([{ fieldId: 'f1', order: 'asc' }])
    expect(resolveGroups(nine, undefined, 'and')).toHaveLength(1)
  })

  it('排序 / 分组规则会截断到后端上限，避免整表查询 422', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      fieldId: `f${i}`,
      order: 'asc' as const,
    }))
    expect(normalizeSorts(many)).toHaveLength(MAX_SORTS)
    expect(normalizeGroups(many)).toHaveLength(MAX_GROUPS)
    expect(normalizeSorts([{ fieldId: '', order: 'asc' }])).toEqual([])
    expect(normalizeGroups(undefined)).toEqual([])
  })
})
