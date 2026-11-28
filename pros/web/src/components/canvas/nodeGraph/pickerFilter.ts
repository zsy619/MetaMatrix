/**
 * 「选择画布」弹窗的搜索过滤。
 *
 * 关键词为空时全量返回；有关键词时按画布名或说明过滤，
 * 并丢掉已经空掉的级与分类。
 */
export type PickerItem = { id: string; name: string; description: string }
export type PickerLane = {
  id: string
  title: string
  hint: string
  items: PickerItem[]
}
export type PickerGroup = {
  key: string
  label: string
  count: number
  lanes: PickerLane[]
}

/** 画布名或说明命中关键词就算命中。 */
export function matchTemplate(name: string, description: string, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().includes(q) || description.toLowerCase().includes(q)
}

export function filterTemplateGroups(
  groups: PickerGroup[],
  keyword: string,
): PickerGroup[] {
  if (!keyword.trim()) return groups
  return groups
    .map((group) => {
      const lanes = group.lanes
        .map((lane) => ({
          ...lane,
          items: lane.items.filter((item) =>
            matchTemplate(item.name, item.description, keyword),
          ),
        }))
        .filter((lane) => lane.items.length > 0)
      return {
        ...group,
        lanes,
        count: lanes.reduce((sum, lane) => sum + lane.items.length, 0),
      }
    })
    .filter((group) => group.lanes.length > 0)
}
