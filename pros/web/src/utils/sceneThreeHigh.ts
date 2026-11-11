import type { SceneThreeHighAxisId, SceneThreeHighScores } from '../types/canvas'

export const SCENE_THREE_HIGH_AXIS_IDS: SceneThreeHighAxisId[] = ['frequency', 'value', 'marginal']

export const SCENE_THREE_HIGH_AXIS_LABEL: Record<SceneThreeHighAxisId, string> = {
  frequency: '高频',
  value: '高价值',
  marginal: '高边际成本',
}

export const SCENE_THREE_HIGH_MAX = 10

export function clampSceneScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(SCENE_THREE_HIGH_MAX, Math.max(0, Math.round(value)))
}

export function sceneThreeHighPasses(scores: SceneThreeHighScores, passScore = 7): boolean {
  return SCENE_THREE_HIGH_AXIS_IDS.every((id) => scores[id] >= passScore)
}

export function sceneThreeHighGaps(scores: SceneThreeHighScores, passScore = 7): string[] {
  return SCENE_THREE_HIGH_AXIS_IDS.filter((id) => scores[id] < passScore).map((id) => SCENE_THREE_HIGH_AXIS_LABEL[id])
}

/** 顶、右下、左下。分值 0 在圆心，10 在外圈。 */
export function sceneRadarPoint(
  index: number,
  score: number,
  cx: number,
  cy: number,
  radius: number,
): [number, number] {
  const t = clampSceneScore(score) / SCENE_THREE_HIGH_MAX
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 3
  return [cx + radius * t * Math.cos(angle), cy + radius * t * Math.sin(angle)]
}

export function sceneRadarRing(level: number, cx: number, cy: number, radius: number): string {
  return [0, 1, 2]
    .map((index) => sceneRadarPoint(index, level, cx, cy, radius).join(','))
    .join(' ')
}
