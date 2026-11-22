import { describe, expect, it } from 'vitest'
import { CHART_GROUPS } from './chartGroups'
import { CHART_GROUP_IDS } from './chartGroupIds'

describe('图表分组 id 表', () => {
  it('与 CHART_GROUPS 一一对应且顺序一致', () => {
    expect(CHART_GROUPS.map((group) => group.id)).toEqual([...CHART_GROUP_IDS])
  })
})
