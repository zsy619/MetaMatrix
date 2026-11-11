/** 查找与替换弹窗的上次位置。 */
export const FIND_DIALOG_POS_KEY = 'rte-find-dialog-pos'

export type FindDialogPos = { left: number; top: number }

export function readFindDialogPos(): FindDialogPos | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = JSON.parse(localStorage.getItem(FIND_DIALOG_POS_KEY) || '')
    if (!Number.isFinite(raw?.left) || !Number.isFinite(raw?.top)) return null
    return { left: Number(raw.left), top: Number(raw.top) }
  } catch {
    return null
  }
}

export function writeFindDialogPos(pos: FindDialogPos): void {
  try {
    localStorage.setItem(FIND_DIALOG_POS_KEY, JSON.stringify({
      left: Math.round(pos.left),
      top: Math.round(pos.top),
    }))
  } catch {
    /* 隐私模式写不进去时，这一次拖动仍然生效 */
  }
}

/** 保证弹窗整块留在视口里，边上留 8px。 */
export function clampFindDialogPos(
  left: number,
  top: number,
  width: number,
  height: number,
  viewport = { width: window.innerWidth, height: window.innerHeight },
): FindDialogPos {
  const margin = 8
  const maxLeft = Math.max(margin, viewport.width - Math.max(width, 0) - margin)
  const maxTop = Math.max(margin, viewport.height - Math.max(height, 0) - margin)
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  }
}
