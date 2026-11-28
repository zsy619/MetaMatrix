import { describe, expect, it } from 'vitest'
import { filterTemplateGroups, matchTemplate, type PickerGroup } from './pickerFilter'

const groups: PickerGroup[] = [
  {
    key: 'a',
    label: '方法框架',
    count: 2,
    lanes: [
      {
        id: 'l1',
        title: '想清楚一件事',
        hint: '',
        items: [
          { id: 't1', name: '双三角构建梳理', description: '人类三角 × AI 三角' },
          { id: 't2', name: '时间管理矩阵', description: '艾森豪威尔矩阵' },
        ],
      },
    ],
  },
  {
    key: 'b',
    label: '评估与取舍',
    count: 1,
    lanes: [
      {
        id: 'l2',
        title: '需求',
        hint: '',
        items: [{ id: 't3', name: '需求评估三角形', description: '普遍性 × 频次' }],
      },
    ],
  },
]

describe('matchTemplate', () => {
  it('空关键词全量命中', () => {
    expect(matchTemplate('任意', '说明', '')).toBe(true)
    expect(matchTemplate('任意', '说明', '   ')).toBe(true)
  })

  it('画布名或说明命中即可', () => {
    expect(matchTemplate('时间管理矩阵', '艾森豪威尔', '时间')).toBe(true)
    expect(matchTemplate('双三角', '人类三角 × AI 三角', 'ai')).toBe(true)
    expect(matchTemplate('双三角', '人类三角', '不存在')).toBe(false)
  })
})

describe('filterTemplateGroups', () => {
  it('空关键词原样返回', () => {
    expect(filterTemplateGroups(groups, '')).toBe(groups)
  })

  it('过滤命中的画布并丢掉空级与空分类', () => {
    const out = filterTemplateGroups(groups, '时间')
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('a')
    expect(out[0].lanes[0].items.map((i) => i.id)).toEqual(['t2'])
    expect(out[0].count).toBe(1)
  })

  it('没有命中时返回空列表', () => {
    expect(filterTemplateGroups(groups, 'zzz')).toEqual([])
  })
})
