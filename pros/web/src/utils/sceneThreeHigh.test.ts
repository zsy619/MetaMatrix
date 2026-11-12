import { describe, expect, it } from 'vitest'
import sceneThreeHighTemplate from '../templates/scene-three-high-v1.json'
import {
  clampSceneScore,
  sceneRadarPoint,
  isLegacySceneSeed,
  sceneRecordText,
  sceneThreeHighGaps,
  sceneThreeHighPasses,
  upgradeSceneScoresToHundred,
} from './sceneThreeHigh'

describe('选场景三高', () => {
  it('分值夹在 0 到 100', () => {
    expect(clampSceneScore(-3)).toBe(0)
    expect(clampSceneScore(70.4)).toBe(70)
    expect(clampSceneScore(120)).toBe(100)
    expect(clampSceneScore(Number.NaN)).toBe(0)
  })

  it('三项都到门槛才通过，并指出还差哪一项', () => {
    expect(sceneThreeHighPasses({ frequency: 70, value: 70, marginal: 70 })).toBe(true)
    expect(sceneThreeHighPasses({ frequency: 90, value: 80, marginal: 60 })).toBe(false)
    expect(sceneThreeHighGaps({ frequency: 90, value: 40, marginal: 60 })).toEqual(['高价值', '高边际成本'])
  })

  it('旧的 0 到 10 分草稿会乘 10，已经是百分制的不再乘', () => {
    const upgraded = upgradeSceneScoresToHundred({
      passScore: 7,
      verdict: '三项都到 7 分以上',
      businesses: [{ scores: { frequency: 9, value: 8, marginal: 6 } }],
    })
    expect(upgraded.passScore).toBe(70)
    expect(upgraded.verdict).toContain('70 分')
    expect(upgraded.businesses[0]?.scores).toEqual({ frequency: 90, value: 80, marginal: 60 })
    expect(upgradeSceneScoresToHundred(upgraded)).toEqual(upgraded)
  })

  it('默认给出 5 个 FDE 调研场景', () => {
    const names = sceneThreeHighTemplate.businesses.map((biz) => biz.name)
    expect(names).toEqual(['销售报价', '客服工单', '内部知识问答', '报销审核', '合规审查'])
    const passed = sceneThreeHighTemplate.businesses.filter((biz) => sceneThreeHighPasses(biz.scores))
    expect(passed.map((biz) => biz.name)).toEqual(['销售报价', '客服工单'])
  })

  it('旧的两条空示例会换成 5 个调研场景，写过记录的不覆盖', () => {
    expect(isLegacySceneSeed([
      { id: 'biz_service', note: '' },
      { id: 'biz_report', note: '<p></p>' },
    ])).toBe(true)
    expect(isLegacySceneSeed([
      { id: 'biz_service', note: '已经写过调研' },
      { id: 'biz_report', note: '' },
    ])).toBe(false)
    expect(sceneRecordText('<p>每周大量报价</p>')).toBe('每周大量报价')
  })

  it('100 分落在外圈顶点，0 分落在圆心', () => {
    expect(sceneRadarPoint(0, 100, 100, 100, 50)).toEqual([100, 50])
    expect(sceneRadarPoint(0, 0, 100, 100, 50)).toEqual([100, 100])
  })
})
