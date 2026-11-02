/**
 * 工具栏分组内的按钮显隐与顺序。
 *
 * 与 utils/rteToolbarGroups.ts 的分组顺序一样，按面板 id 存在画布 JSON 里，
 * 键是面板 id -> 分组 id -> 配置。旧文档没有这个字段。
 */

/** 每个分组内按钮的显隐与顺序。缺省用分组默认顺序、全部显示。 */
export type ToolbarGroupButtonConfig = {
  /** 组内按钮顺序（工具 key）。缺省用分组默认顺序 */
  order?: string[]
  /** 隐藏的按钮 key。隐藏的按钮不参与分组渲染 */
  hidden?: string[]
}

/** 面板 id -> 分组 id -> 配置 */
export type ToolbarGroupButtonsByPanelId = Record<string, Record<string, ToolbarGroupButtonConfig>>

/** 归一化：丢掉未知 key，补齐缺失的默认 key，隐藏列表去重。 */
export function normalizeGroupButtonConfig(
  saved: unknown,
  groupKeys: readonly string[],
): Required<ToolbarGroupButtonConfig> {
  const keys = Array.isArray(groupKeys) ? groupKeys : []
  const known = new Set(keys)
  const order: string[] = []
  const hidden: string[] = []
  const raw = (saved ?? {}) as ToolbarGroupButtonConfig
  if (Array.isArray(raw.order)) {
    for (const key of raw.order) {
      if (typeof key !== 'string') continue
      if (!known.has(key) || order.includes(key)) continue
      order.push(key)
    }
  }
  // 剩下没写进 order 的按钮按默认顺序补在后面
  for (const key of keys) {
    if (!order.includes(key)) order.push(key)
  }
  if (Array.isArray(raw.hidden)) {
    for (const key of raw.hidden) {
      if (typeof key !== 'string') continue
      if (!known.has(key) || hidden.includes(key)) continue
      hidden.push(key)
    }
  }
  return { order, hidden }
}

/** 实际渲染顺序：先按 order 排，再用 groupKeys 里剩下的补齐；隐藏的剔除。 */
export function resolveGroupButtonOrder(
  config: ToolbarGroupButtonConfig | null | undefined,
  groupKeys: readonly string[],
): string[] {
  const normalized = normalizeGroupButtonConfig(config, groupKeys)
  return normalized.order.filter((key) => !normalized.hidden.includes(key))
}

/** 该分组最终显示的按钮 key。 */
export function visibleGroupButtonKeys(
  config: ToolbarGroupButtonConfig | null | undefined,
  groupKeys: readonly string[],
): string[] {
  return resolveGroupButtonOrder(config, groupKeys)
}

/** 是否等于默认状态（默认顺序且没有隐藏）。 */
function isDefaultConfig(
  config: ToolbarGroupButtonConfig,
  groupKeys: readonly string[],
): boolean {
  const normalized = normalizeGroupButtonConfig(config, groupKeys)
  const defaultOrder = normalizeGroupButtonConfig(null, groupKeys).order
  const sameOrder =
    normalized.order.length === defaultOrder.length &&
    normalized.order.every((key, index) => key === defaultOrder[index])
  return sameOrder && normalized.hidden.length === 0
}

/** 写入某个面板某个分组的配置。空配置会把分组从表里删掉。 */
export function writeToolbarGroupButtons(
  map: ToolbarGroupButtonsByPanelId | null | undefined,
  panelId: string,
  groupId: string,
  config: ToolbarGroupButtonConfig | null | undefined,
): ToolbarGroupButtonsByPanelId | undefined {
  const next: ToolbarGroupButtonsByPanelId = { ...(map || {}) }
  if (!panelId || !groupId) return Object.keys(next).length ? next : undefined
  const panel = { ...(next[panelId] || {}) }
  if (!config) {
    delete panel[groupId]
  } else {
    panel[groupId] = {
      order: Array.isArray(config.order) ? [...config.order] : [],
      hidden: Array.isArray(config.hidden) ? [...config.hidden] : [],
    }
  }
  if (Object.keys(panel).length) next[panelId] = panel
  else delete next[panelId]
  return Object.keys(next).length ? next : undefined
}

/** 读取某个面板某个分组的配置，已归一化。 */
export function readToolbarGroupButtons(
  map: ToolbarGroupButtonsByPanelId | null | undefined,
  panelId: string | null | undefined,
  groupId: string,
  groupKeys: readonly string[],
): Required<ToolbarGroupButtonConfig> {
  if (!map || !panelId || !groupId) return normalizeGroupButtonConfig(null, groupKeys)
  return normalizeGroupButtonConfig(map[panelId]?.[groupId], groupKeys)
}

/** 把某个按钮在组内移动到 toIndex（0 基）。没变化返回 null。 */
export function moveGroupButton(
  config: ToolbarGroupButtonConfig | null | undefined,
  groupKeys: readonly string[],
  key: string,
  toIndex: number,
): ToolbarGroupButtonConfig | null {
  const normalized = normalizeGroupButtonConfig(config, groupKeys)
  const from = normalized.order.indexOf(key)
  if (from < 0 || !Number.isInteger(toIndex)) return null
  if (toIndex < 0 || toIndex >= normalized.order.length) return null
  if (from === toIndex) return null
  const next = [...normalized.order]
  const [moved] = next.splice(from, 1)
  next.splice(toIndex, 0, moved!)
  return { order: next, hidden: [...normalized.hidden] }
}

/** 切换某个按钮的隐藏状态。 */
export function toggleGroupButtonHidden(
  config: ToolbarGroupButtonConfig | null | undefined,
  groupKeys: readonly string[],
  key: string,
): ToolbarGroupButtonConfig | null {
  const normalized = normalizeGroupButtonConfig(config, groupKeys)
  if (!normalized.order.includes(key)) return null
  const hidden = normalized.hidden.includes(key)
    ? normalized.hidden.filter((k) => k !== key)
    : [...normalized.hidden, key]
  return { order: [...normalized.order], hidden }
}

/** 配置是否等于默认（用于判断要不要写回画布）。 */
export function isDefaultToolbarGroupConfig(
  config: ToolbarGroupButtonConfig | null | undefined,
  groupKeys: readonly string[],
): boolean {
  if (!config) return true
  return isDefaultConfig(config, groupKeys)
}
