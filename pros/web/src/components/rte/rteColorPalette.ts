/** 主题色列名，对应 Word 主题色从左到右的 10 列。 */
export const THEME_COLUMN_NAMES = ['白', '黑', '浅灰', '蓝灰', '冰蓝', '橙', '灰', '金', '蓝', '绿']

/** 主题色网格按行展开后，第 index 格的名称。第 0 行是基色。 */
export function themeColorLabel(index: number): string {
  const col = index % THEME_COLUMN_NAMES.length
  const row = Math.floor(index / THEME_COLUMN_NAMES.length)
  const name = THEME_COLUMN_NAMES[col] || '主题色'
  if (row <= 0) return name
  return `${name} · ${row}`
}

/** 最近使用的颜色：新的放最前，忽略空值和重复，最多保留 limit 个。 */
export function pushRecentColor(list: string[], color: string, limit = 8): string[] {
  const next = color.trim().toLowerCase()
  if (!next) return list
  return [next, ...list.filter((item) => item.toLowerCase() !== next)].slice(0, limit)
}
