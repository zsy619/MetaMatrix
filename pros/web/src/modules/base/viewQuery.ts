/**
 * 视图查询口径的纯函数（第十四轮）。
 *
 * 单独成文件是为了能直接跑单测 —— 口径合并是最容易写出
 * 「A 改了 B 的条件」这种隐蔽 bug 的地方。
 */
import type { FilterGroup, GroupRule, SortRule } from './types'

/**
 * 查询规模上限，与后端 pros/api/internal/base/query.go 的常量一一对应。
 *
 * 前端必须自己守住上限：后端越限会直接返回 422（query too large），
 * 一条脏规则会让整个表格加载失败，所以这里在入口处去重 + 截断。
 */
export const MAX_FILTERS = 20
export const MAX_SORTS = 5
export const MAX_GROUPS = 3

/** 去掉空字段、同字段只保留第一条、截断到上限。 */
export function normalizeSorts(rules?: SortRule[] | null): SortRule[] {
  const seen = new Set<string>()
  const out: SortRule[] = []
  for (const rule of rules ?? []) {
    if (!rule?.fieldId || seen.has(rule.fieldId)) continue
    seen.add(rule.fieldId)
    out.push({ fieldId: rule.fieldId, order: rule.order ?? 'asc' })
    if (out.length >= MAX_SORTS) break
  }
  return out
}

/** 去掉空字段、同字段只保留第一条、截断到上限。 */
export function normalizeGroups(rules?: GroupRule[] | null): GroupRule[] {
  const seen = new Set<string>()
  const out: GroupRule[] = []
  for (const rule of rules ?? []) {
    if (!rule?.fieldId || seen.has(rule.fieldId)) continue
    seen.add(rule.fieldId)
    out.push({ fieldId: rule.fieldId, order: rule.order ?? 'asc' })
    if (out.length >= MAX_GROUPS) break
  }
  return out
}

/** 我的条件与共享条件的组合方式。 */
export type QueryCombine = 'override' | 'and' | 'or'

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

/** 把两组条件合并成「A OR B」（任一满足）。 */
export function mergeFiltersOr(a: FilterGroup, b: FilterGroup): FilterGroup {
  const aEmpty = !a.conditions.length && !a.children.length
  const bEmpty = !b.conditions.length && !b.children.length
  if (aEmpty) return b
  if (bEmpty) return a
  return {
    logic: 'OR',
    conditions: [...a.conditions, ...b.conditions],
    children: [...a.children, ...b.children],
  }
}

/** 归一化组合方式：'and' / 'or' 各自保留，其余一律按覆盖处理。 */
export function normalizeCombine(raw: unknown): QueryCombine {
  if (raw === 'and') return 'and'
  if (raw === 'or') return 'or'
  return 'override'
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
  if (combine === 'or') return mergeFiltersOr(shared, personal)
  return personal
}

/** 生效排序：我的排序优先，为空时回落共享排序。 */
export function resolveSorts(
  shared: SortRule[],
  personal: SortRule[] | undefined,
  combine: QueryCombine,
): SortRule[] {
  if (!personal) return normalizeSorts(shared)
  if (combine === 'and') return normalizeSorts(personal.length ? personal : shared)
  return normalizeSorts(personal)
}

/** 生效分组：规则同上。 */
export function resolveGroups(
  shared: GroupRule[],
  personal: GroupRule[] | undefined,
  combine: QueryCombine,
): GroupRule[] {
  if (!personal) return normalizeGroups(shared)
  if (combine === 'and') return normalizeGroups(personal.length ? personal : shared)
  return normalizeGroups(personal)
}

