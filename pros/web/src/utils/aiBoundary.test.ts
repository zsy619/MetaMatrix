import { describe, expect, it } from 'vitest'
import aiBoundaryTemplate from '../templates/ai-boundary-v1.json'
import { aiBoundaryHits, aiBoundaryRadarPoint, aiBoundaryStops, clampAiBoundaryScore } from './aiBoundary'

describe('业务别用 AI', () => {
  it('分值夹在 0 到 100', () => {
    expect(clampAiBoundaryScore(-1)).toBe(0)
    expect(clampAiBoundaryScore(70.6)).toBe(71)
    expect(clampAiBoundaryScore(140)).toBe(100)
  })

  it('任意一项到门槛就别用，并指出是哪几项', () => {
    const clear = { cause: 20, irreversible: 15, data: 28, compliance: 18 }
    const flagged = { cause: 86, irreversible: 12, data: 20, compliance: 8 }
    expect(aiBoundaryStops(clear)).toBe(false)
    expect(aiBoundaryStops(flagged)).toBe(true)
    expect(aiBoundaryHits(flagged)).toEqual(['cause'])
    expect(aiBoundaryHits({ cause: 20, irreversible: 70, data: 45, compliance: 96 })).toEqual(['irreversible', 'compliance'])
  })

  it('默认五条业务里，只有会议纪要可以考虑交给 AI', () => {
    const names = aiBoundaryTemplate.businesses.filter((biz) => !aiBoundaryStops(biz.scores, aiBoundaryTemplate.warnScore))
    expect(names.map((biz) => biz.name)).toEqual(['会议纪要'])
    expect(aiBoundaryTemplate.axes.map((axis) => axis.title)).toEqual(['单点因果', '错了不可逆', '数据拿不到', '踩合规红线'])
  })

  it('100 分落在正上方外圈', () => {
    expect(aiBoundaryRadarPoint(0, 100, 100, 100, 50)[1]).toBeCloseTo(50)
    expect(aiBoundaryRadarPoint(0, 0, 100, 100, 50)).toEqual([100, 100])
  })
})
