/** 引导首页主列表的滚动位置。同一标签页离开后再回来，停在离开前的位置。 */
export const GUIDE_SCROLL_KEY = 'metamatrix:guide-scroll'

export function readGuideScroll(storage: Pick<Storage, 'getItem'> | null | undefined): number {
  if (!storage) return 0
  try {
    const raw = storage.getItem(GUIDE_SCROLL_KEY)
    if (!raw) return 0
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return 0
    return Math.round(value)
  } catch {
    return 0
  }
}

export function writeGuideScroll(storage: Pick<Storage, 'setItem'> | null | undefined, top: number): void {
  if (!storage) return
  const value = Number.isFinite(top) ? Math.max(0, Math.round(top)) : 0
  try {
    storage.setItem(GUIDE_SCROLL_KEY, String(value))
  } catch {
    /* 隐私模式或配额满时忽略 */
  }
}

export interface GuideScroller {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface GuideScrollMemory {
  readonly pinned: number
  readonly userMoved: boolean
  /** 分类跳转、滚动到某一栏：立刻停止恢复，接下来的滚动改记新位置。 */
  noteUserMove(): void
  /** 滚轮、触摸、拖滚动条、键盘翻页。真正滚动之后才停止恢复。 */
  armUserScroll(): void
  /** 放到记下的位置。内容还不够高时先停在底部，并返回 false。 */
  apply(box: GuideScroller): boolean
  /**
   * 处理 scroll 事件。
   * 返回 null 表示这次是程序设置的回声，或用户还没自己滚动。
   */
  onScroll(box: GuideScroller): number | null
  /** 离开页面时应该写回存储的位置。 */
  snapshot(box: GuideScroller | null): number
}

export function createGuideScrollMemory(initial: number): GuideScrollMemory {
  let pinned = Math.max(0, Math.round(Number.isFinite(initial) ? initial : 0))
  let userMoved = false
  let userIntent = false

  function maxOf(box: GuideScroller): number {
    return Math.max(0, box.scrollHeight - box.clientHeight)
  }

  return {
    get pinned() {
      return pinned
    },
    get userMoved() {
      return userMoved
    },
    noteUserMove() {
      userMoved = true
    },
    armUserScroll() {
      userIntent = true
    },
    apply(box) {
      if (userMoved || pinned <= 0) return true
      const next = Math.min(pinned, maxOf(box))
      if (Math.abs(box.scrollTop - next) > 1) box.scrollTop = next
      return maxOf(box) + 1 >= pinned
    },
    onScroll(box) {
      const top = Math.max(0, Math.round(box.scrollTop))
      if (!userMoved && !userIntent) return null
      const resting = Math.min(pinned, maxOf(box))
      if (!userMoved && Math.abs(top - resting) <= 1) {
        userIntent = false
        return null
      }
      userMoved = true
      userIntent = false
      pinned = top
      return pinned
    },
    snapshot(box) {
      if (userMoved && box) pinned = Math.max(0, Math.round(box.scrollTop))
      return pinned
    },
  }
}
