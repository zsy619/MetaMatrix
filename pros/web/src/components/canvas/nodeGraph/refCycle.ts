/**
 * 画布引用的合法性判断。
 *
 * 引用是「A 的节点指向 B 这张画布」。两条硬规则：
 *   1. 不能引用自己（A → A）。
 *   2. 不能形成环（A → B → A）。
 * 两条都在选择引用目标时就要拦下来并提示，而不是等保存后才报错。
 */

/** 画布 id → 它引用掉的画布 id 列表。 */
export type RefMap = Record<string, string[]>

export type RefProblem = 'self' | 'cycle' | 'missing'

/**
 * 判断「当前画布引用 targetCanvasId」是否合法。
 * 合法返回 null，否则返回原因。
 *
 * @param selfCanvasId 当前画布 id
 * @param targetCanvasId 想引用的画布 id
 * @param refs 项目内的引用图。必须是最新的一份，否则可能漏判环。
 */
export function findRefProblem(params: {
  selfCanvasId: string
  targetCanvasId: string
  refs: RefMap
}): RefProblem | null {
  const { selfCanvasId, targetCanvasId, refs } = params
  if (!targetCanvasId) return 'missing'
  if (targetCanvasId === selfCanvasId) return 'self'

  // 加上 self → target 之后成环，当且仅当 target 已经（间接）能走到 self。
  const visited = new Set<string>()
  const stack: string[] = [targetCanvasId]
  while (stack.length) {
    const current = stack.pop() as string
    if (visited.has(current)) continue
    visited.add(current)
    for (const ref of refs[current] || []) {
      if (ref === selfCanvasId) return 'cycle'
      stack.push(ref)
    }
  }
  return null
}

/** 面向用户的中文提示。 */
export function refProblemMessage(problem: RefProblem | null): string {
  switch (problem) {
    case 'self':
      return '不能引用画布自己'
    case 'cycle':
      return '不能形成循环引用（A → B → A）'
    case 'missing':
      return '请选择要引用的画布'
    default:
      return ''
  }
}
