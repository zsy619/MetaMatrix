/**
 * 按点号路径读写 ECharts option。
 *
 * 路径示例：
 * - 'title.text'      → option.title.text
 * - 'legend.show'     → option.legend.show
 * - 'xAxis.0.name'    → option.xAxis[0].name
 *
 * 约定：
 * - 路径段是纯数字时按数组下标处理；
 * - 读不到时返回 undefined；
 * - 写的时候自动补齐中间的对象 / 数组。
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 按路径读取。 */
export function getOptionPath(root: unknown, path: string): unknown {
  if (!path) return undefined
  let current: unknown = root
  for (const segment of path.split('.')) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      current = current[index]
      continue
    }
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }
  return current
}

/** 按路径写入（自动补齐中间层）。返回是否真的改了值。 */
export function setOptionPath(root: unknown, path: string, value: unknown): boolean {
  if (!root || !path) return false
  const segments = path.split('.')
  let current: unknown = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!
    const nextSegment = segments[i + 1]!
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return false
      const child = current[index]
      if (!isPlainObject(child) && !Array.isArray(child)) {
        current[index] = /^\d+$/.test(nextSegment) ? [] : {}
      }
      current = current[index]
      continue
    }
    if (!isPlainObject(current)) return false
    const child = current[segment]
    if (!isPlainObject(child) && !Array.isArray(child)) {
      current[segment] = /^\d+$/.test(nextSegment) ? [] : {}
    }
    current = current[segment]
  }
  const last = segments[segments.length - 1]!
  if (Array.isArray(current)) {
    const index = Number(last)
    if (!Number.isInteger(index)) return false
    if (current[index] === value) return false
    current[index] = value
    return true
  }
  if (!isPlainObject(current)) return false
  if (current[last] === value) return false
  current[last] = value
  return true
}

/** 按路径删除（读不到就返回 false）。 */
export function deleteOptionPath(root: unknown, path: string): boolean {
  if (!root || !path) return false
  const segments = path.split('.')
  let current: unknown = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return false
      current = current[index]
      continue
    }
    if (!isPlainObject(current)) return false
    current = current[segment]
  }
  const last = segments[segments.length - 1]!
  if (Array.isArray(current)) {
    const index = Number(last)
    if (!Number.isInteger(index)) return false
    if (index >= current.length) return false
    current.splice(index, 1)
    return true
  }
  if (!isPlainObject(current)) return false
  if (!(last in current)) return false
  delete current[last]
  return true
}

/** 稳定序列化（键排序）：用来比较两份 option 是不是同一份。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * 两份 option 文本是不是同一份（忽略键顺序与空白）。
 *
 * 面板写回后要确认「文档里是不是真的就是我写的那份」：
 * 父组件回写 HTML 时属性会被重新序列化，键顺序可能变。
 */
export function isSameEchartsOption(a: string, b: string): boolean {
  if (a === b) return true
  if (!a || !b) return false
  try {
    return stableStringify(JSON.parse(a)) === stableStringify(JSON.parse(b))
  } catch {
    return false
  }
}
