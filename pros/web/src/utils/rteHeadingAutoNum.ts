/**
 * 标题自动编号开关。按面板存在画布 JSON。
 * 关掉或不认识的值不落库，避免旧文档多出一个字段。
 * 编号本身是 CSS 计数器，不写进标题文字。
 */

export function readHeadingAutoNum(
  map: Record<string, unknown> | null | undefined,
  panelId: string | null | undefined,
): boolean {
  if (!map || !panelId) return false
  return map[panelId] === true
}

export function writeHeadingAutoNum(
  map: Record<string, unknown> | null | undefined,
  panelId: string,
  on: boolean,
): Record<string, true> | undefined {
  const next: Record<string, true> = {}
  if (map) {
    for (const [id, value] of Object.entries(map)) {
      if (id !== panelId && value === true) next[id] = true
    }
  }
  if (on) next[panelId] = true
  return Object.keys(next).length ? next : undefined
}
