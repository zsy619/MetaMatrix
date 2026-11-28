import { describe, expect, it } from 'vitest'
import { TEMPLATE_META, type TemplateCategory, type TemplateId } from '../../stores/document'
import { GUIDE_LANES, lanesFor, splitMatch } from './guideLanes'

describe('guide lanes', () => {
  it('每张画布只出现在自己的分类里一次', () => {
    const seen = new Map<TemplateId, TemplateCategory>()
    for (const category of Object.keys(GUIDE_LANES) as TemplateCategory[]) {
      for (const lane of GUIDE_LANES[category]) {
        for (const id of lane.ids) {
          expect(TEMPLATE_META[id].category, id).toBe(category)
          expect(seen.has(id), id).toBe(false)
          seen.set(id, category)
        }
      }
    }
    const missing = (Object.keys(TEMPLATE_META) as TemplateId[]).filter((id) => !seen.has(id))
    expect(missing).toEqual([])
    expect(seen.size).toBe(Object.keys(TEMPLATE_META).length)
  })

  it('五步法和周期复盘按顺序编号', () => {
    const five = GUIDE_LANES.growth.find((lane) => lane.id === 'five-step')
    expect(five?.series).toBe(true)
    expect(five?.ids).toEqual([
      'five-step-basic',
      'five-step-division',
      'five-step-advanced',
      'five-step-pro',
      'five-step-challenge',
      'five-step',
    ])
    expect(GUIDE_LANES.review[0]?.ids[0]).toBe('weekly-summary')
    expect(GUIDE_LANES.review[0]?.ids.at(-1)).toBe('annual-summary')
  })

  it('筛选后仍按分组顺序排，没登记的画布不会消失', () => {
    const cards = [
      { id: 'fde-roi' as const },
      { id: 'ten-check' as const },
      { id: 'fde-pilot' as const },
    ]
    expect(lanesFor('fde', cards).map((block) => block.cards.map((card) => card.id))).toEqual([
      ['ten-check'],
      ['fde-pilot', 'fde-roi'],
    ])
    expect(lanesFor('method', [{ id: 'dual-triangle' }, { id: 'star-quadrant' }]).map((block) => block.lane.id)).toEqual([
      'think',
      'time',
    ])
  })

  it('搜索词在标题里标出来', () => {
    expect(splitMatch('五步法（基础版）', '基础')).toEqual([
      { text: '五步法（', hit: false },
      { text: '基础', hit: true },
      { text: '版）', hit: false },
    ])
    expect(splitMatch('十格自检', '')).toEqual([{ text: '十格自检', hit: false }])
  })
})
