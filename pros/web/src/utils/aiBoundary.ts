import type { AiBoundaryAxisId, AiBoundaryScores } from '../types/canvas'
import { SCENE_THREE_HIGH_MAX, clampSceneScore, sceneRadarPoint, sceneRadarRing } from './sceneThreeHigh'

export const AI_BOUNDARY_AXIS_IDS: AiBoundaryAxisId[] = ['cause', 'irreversible', 'data', 'compliance']

export const AI_BOUNDARY_AXIS_LABEL: Record<AiBoundaryAxisId, string> = {
  cause: '单点因果',
  irreversible: '错了不可逆',
  data: '数据拿不到',
  compliance: '踩合规红线',
}

export const AI_BOUNDARY_NUMERAL = ['一', '二', '三', '四'] as const

export const AI_BOUNDARY_MAX = SCENE_THREE_HIGH_MAX

export function clampAiBoundaryScore(value: number): number {
  return clampSceneScore(value)
}

/** 任意一项到门槛，这件事就不该交给 AI。 */
export function aiBoundaryHits(scores: AiBoundaryScores, warnScore = 70): AiBoundaryAxisId[] {
  return AI_BOUNDARY_AXIS_IDS.filter((id) => scores[id] >= warnScore)
}

export function aiBoundaryStops(scores: AiBoundaryScores, warnScore = 70): boolean {
  return aiBoundaryHits(scores, warnScore).length > 0
}

export function aiBoundaryRadarPoint(
  index: number,
  score: number,
  cx: number,
  cy: number,
  radius: number,
): [number, number] {
  return sceneRadarPoint(index, score, cx, cy, radius, AI_BOUNDARY_AXIS_IDS.length)
}

export function aiBoundaryRadarRing(level: number, cx: number, cy: number, radius: number): string {
  return sceneRadarRing(level, cx, cy, radius, AI_BOUNDARY_AXIS_IDS.length)
}
