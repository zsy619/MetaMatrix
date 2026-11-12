import { describe, expect, it } from 'vitest'
import sceneThreeHighTemplate from '../templates/scene-three-high-v1.json'
import {
  clampSceneScore,
  sceneRadarPoint,
  sceneThreeHighGaps,
  sceneThreeHighPasses,
} from './sceneThreeHigh'

describe('选场景三高', () => {
  it('分值夹在 0 到 10', () => {
    expect(clampSceneScore(-3)).toBe(0)
    expect(clampSceneScore(7.4)).toBe(7)
    expect(clampSceneScore(12)).toBe(10)
    expect(clampSceneScore(Number.NaN)).toBe(0)
  })

  it('三项都到门槛才通过，并指出还差哪一项', () => {
    expect(sceneThreeHighPasses({ frequency: 7, value: 7, marginal: 7 })).toBe(true)
    expect(sceneThreeHighPasses({ frequency: 9, value: 8, marginal: 6 })).toBe(false)
    expect(sceneThreeHighGaps({ frequency: 9, value: 4, marginal: 6 })).toEqual(['高价值', '高边际成本'])
  })

  it('默认给出 5 个 FDE 调研场景', () => {
    const names = sceneThreeHighTemplate.businesses.map((biz) => biz.name)
    expect(names).toEqual(['销售报价', '客服工单', '内部知识问答', '报销审核', '合规审查'])
    const passed = sceneThreeHighTemplate.businesses.filter((biz) => sceneThreeHighPasses(biz.scores))
    expect(passed.map((biz) => biz.name)).toEqual(['销售报价', '客服工单'])
  })

  it('10 分落在外圈顶点，0 分落在圆心', () => {
    expect(sceneRadarPoint(0, 10, 100, 100, 50)).toEqual([100, 50])
    expect(sceneRadarPoint(0, 0, 100, 100, 50)).toEqual([100, 100])
  })
})
