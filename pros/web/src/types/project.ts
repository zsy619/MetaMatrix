/** 项目：画布的容器。一个项目下有多张画布。 */
export type Project = {
  id: string
  ownerUserId: string
  name: string
  /** 项目表情：列表里一眼认出项目。 */
  emoji: string
  /** 项目进度 0-100，由使用者维护。 */
  progress: number
  createdAt: string
  updatedAt: string
}

/** 项目列表项，附带该项目的画布数量。 */
export type ProjectSummary = {
  id: string
  name: string
  emoji: string
  progress: number
  canvasCount: number
  createdAt: string
  updatedAt: string
}

/** 项目基本信息补丁：只更新传进来的字段。 */
export type ProjectPatch = {
  name?: string
  emoji?: string
  progress?: number
}
