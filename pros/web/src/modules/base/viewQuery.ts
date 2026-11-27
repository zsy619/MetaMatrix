/**
 * 视图查询口径的纯函数（第十四轮）。
 *
 * 单独成文件是为了能直接跑单测 —— 口径合并是最容易写出
 * 「A 改了 B 的条件」这种隐蔽 bug 的地方。
 */
import type { FilterGroup, GroupRule, SortRule } from './types'

/** 我的条件与共享条件的组合方式。 */
export type QueryCombine = 'override' | 'and'

/** 兼容历史迁移数据：旧版把筛选存成条件数组。 */
export function normalizeFilters(raw: unknown): FilterGroup {
  if (Array.isArray(raw)) {
    return { logic: 'AND', conditions: raw as FilterGroup['conditions'], children: [] }
  }
  if (raw && typeof raw === 'object') {
    const group = raw as Partial<FilterGroup>
    return {
      logic: group.logic ?? 'AND',
      conditions: group.conditions ?? [],
      children: group.children ?? [],
    }
  }
  return { logic: 'AND', conditions: [], children: [] }
}

/** 把两组条件合并成「A AND B」。任一为空时直接返回另一组。 */
export function mergeFilters(a: FilterGroup, b: FilterGroup): FilterGroup {
  const aEmpty = !a.conditions.length && !a.children.length
  const bEmpty = !b.conditions.length && !b.children.length
  if (aEmpty) return b
  if (bEmpty) return a
  return {
    logic: 'AND',
    conditions: [...a.conditions, ...b.conditions],
    children: [...a.children, ...b.children],
  }
}

/** 归一化组合方式：只认 'and'，其余一律按覆盖处理。 */
export function normalizeCombine(raw: unknown): QueryCombine {
  return raw === 'and' ? 'and' : 'override'
}

/**
 * 计算生效口径。
 *
 * override —— 我的条件完全覆盖共享条件；
 * and      —— 共享条件 AND 我的条件（叠加）。
 */
export function resolveFilters(
  shared: FilterGroup,
  personal: FilterGroup | undefined,
  combine: QueryCombine,
): FilterGroup {
  if (!personal) return shared
  if (combine === 'and') return mergeFilters(shared, personal)
  return personal
}

/** 生效排序：我的排序优先，为空时回落共享排序。 */
export function resolveSorts(
  shared: SortRule[],
  personal: SortRule[] | undefined,
  combine: QueryCombine,
): SortRule[] {
  if (!personal) return shared
  if (combine === 'and') return personal.length ? personal : shared
  return personal
}

/** 生效分组：规则同上。 */
export function resolveGroups(
  shared: GroupRule[],
  personal: GroupRule[] | undefined,
  combine: QueryCombine,
): GroupRule[] {
  if (!personal) return shared
  if (combine === 'and') return personal.length ? personal : shared
  return personal
}

