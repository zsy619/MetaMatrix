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

/** 调研记录正文。富文本只留可见文字，方便直接显示在场景卡片上。 */
export function sceneRecordText(note: string | undefined | null): string {
  return (note ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 旧模板只有客服回复、月度汇报两条空记录。这种草稿换成 5 个调研场景。 */
export function isLegacySceneSeed(
  businesses: Array<{ id: string; note?: string | null }> | undefined | null,
): boolean {
  if (!Array.isArray(businesses) || businesses.length !== 2) return false
  const ids = new Set(businesses.map((biz) => biz.id))
  if (!ids.has('biz_service') || !ids.has('biz_report')) return false
  return businesses.every((biz) => !sceneRecordText(biz.note))
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
