import { describe, expect, it } from 'vitest'
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

  it('10 分落在外圈顶点，0 分落在圆心', () => {
    expect(sceneRadarPoint(0, 10, 100, 100, 50)).toEqual([100, 50])
    expect(sceneRadarPoint(0, 0, 100, 100, 50)).toEqual([100, 100])
  })
})
