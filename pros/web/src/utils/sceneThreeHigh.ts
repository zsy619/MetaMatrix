import type { SceneThreeHighAxisId, SceneThreeHighScores } from '../types/canvas'

export const SCENE_THREE_HIGH_AXIS_IDS: SceneThreeHighAxisId[] = ['frequency', 'value', 'marginal']

export const SCENE_THREE_HIGH_AXIS_LABEL: Record<SceneThreeHighAxisId, string> = {
  frequency: '高频',
  value: '高价值',
  marginal: '高边际成本',
}

export const SCENE_THREE_HIGH_MAX = 100

export function clampSceneScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(SCENE_THREE_HIGH_MAX, Math.max(0, Math.round(value)))
}

export function sceneThreeHighPasses(scores: SceneThreeHighScores, passScore = 70): boolean {
  return SCENE_THREE_HIGH_AXIS_IDS.every((id) => scores[id] >= passScore)
}

export function sceneThreeHighGaps(scores: SceneThreeHighScores, passScore = 70): string[] {
  return SCENE_THREE_HIGH_AXIS_IDS.filter((id) => scores[id] < passScore).map((id) => SCENE_THREE_HIGH_AXIS_LABEL[id])
}

/** 旧画布按 0–10 打分。门槛还停在 10 分及以下时，分值和门槛一起乘 10。 */
export function upgradeSceneScoresToHundred<T extends {
  passScore: number
  verdict: string
  businesses: Array<{ scores: SceneThreeHighScores }>
}>(doc: T): T {
  if (doc.passScore > 10) return doc
  const scale = (value: number) => clampSceneScore(value * 10)
  return {
    ...doc,
    passScore: scale(doc.passScore || 7),
    verdict: doc.verdict.replace('7 分', '70 分'),
    businesses: doc.businesses.map((biz) => ({
      ...biz,
      scores: {
        frequency: scale(biz.scores.frequency),
        value: scale(biz.scores.value),
        marginal: scale(biz.scores.marginal),
      },
    })),
  }
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

/** 从正上方起，顺时针。分值 0 在圆心，满分在外圈。 */
export function sceneRadarPoint(
  index: number,
  score: number,
  cx: number,
  cy: number,
  radius: number,
  axisCount = 3,
): [number, number] {
  const t = clampSceneScore(score) / SCENE_THREE_HIGH_MAX
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axisCount
  return [cx + radius * t * Math.cos(angle), cy + radius * t * Math.sin(angle)]
}

export function sceneRadarRing(
  level: number,
  cx: number,
  cy: number,
  radius: number,
  axisCount = 3,
): string {
  return Array.from({ length: axisCount }, (_, index) => sceneRadarPoint(index, level, cx, cy, radius, axisCount).join(','))
    .join(' ')
}
