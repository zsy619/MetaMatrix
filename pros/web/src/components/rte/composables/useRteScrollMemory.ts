/**
 * 正文滚动位置记忆（Composable）。
 *
 * - 打开文档时把 .rte-canvas 的滚动位置恢复到上次离开的地方；
 * - 用户滚动时按文档作用域记下来（节流 250ms）；
 * - 内容还没撑开时会分帧重试，等正文渲染完再定位；
 * - 用户在恢复过程中自己滚动了，立刻停止干预。
 */
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import {
  clearScrollMemory,
  readScrollMemory,
  writeScrollMemory,
} from '../../../utils/rteScrollMemory'

export interface RteScrollMemoryDeps {
  /** RTE 根节点，用来找 .rte-canvas。 */
  rootEl: Ref<HTMLElement | null | undefined>
  /** 作用域（如 doc:xxx）；空串表示不记忆。 */
  scope: Ref<string>
  /** 恢复尝试的最大帧数（约 1.5 秒）。 */
  maxFrames?: number
  /** 保存节流间隔（毫秒）。 */
  throttleMs?: number
}

export function useRteScrollMemory(deps: RteScrollMemoryDeps) {
  const maxFrames = deps.maxFrames ?? 90
  const throttleMs = deps.throttleMs ?? 250

  let restoring = false
  let restored = false
  let frames = 0
  let rafId = 0
  let lastSaved = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let userTouched = false

  function canvasEl(): HTMLElement | null {
    const root = deps.rootEl.value
    if (!root) return null
    return root.querySelector('.rte-canvas') as HTMLElement | null
  }

  function scope(): string {
    return deps.scope.value || ''
  }

  function saveNow(top?: number): void {
    const s = scope()
    if (!s) return
    const canvas = canvasEl()
    const value = top ?? canvas?.scrollTop ?? 0
    // 回到顶部就清掉记忆，下次打开从顶部开始，而不是回到上次翻到的地方
    if (value <= 16) {
      clearScrollMemory(s)
      lastSaved = Date.now()
      return
    }
    writeScrollMemory(s, value)
    lastSaved = Date.now()
  }

  function scheduleSave(): void {
    if (restoring || !scope()) return
    const now = Date.now()
    if (now - lastSaved >= throttleMs) {
      saveNow()
      return
    }
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (!restoring) saveNow()
    }, throttleMs - (now - lastSaved))
  }

  function cancelRestore(): void {
    restoring = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  /** 恢复滚动位置；返回是否定位成功。 */
  function restoreOnce(): boolean {
    const s = scope()
    if (!s) return true
    const target = readScrollMemory(s)
    if (target == null || target <= 0) return true
    const canvas = canvasEl()
    if (!canvas) return false
    const max = canvas.scrollHeight - canvas.clientHeight
    if (max <= 0) return false
    canvas.scrollTop = Math.min(target, max)
    return target <= max
  }

  function restoreLoop(): void {
    frames += 1
    const done = restoreOnce()
    if (done || userTouched || frames >= maxFrames) {
      restoring = false
      rafId = 0
      restored = true
      // 恢复后的值直接落盘，避免内容高度变化后又被旧值覆盖
      if (!userTouched) saveNow()
      return
    }
    rafId = requestAnimationFrame(restoreLoop)
  }

  function restore(): void {
    const s = scope()
    if (!s) return
    if (readScrollMemory(s) == null) return
    userTouched = false
    restored = false
    frames = 0
    restoring = true
    rafId = requestAnimationFrame(restoreLoop)
  }

  function onScroll(): void {
    if (restoring) return
    scheduleSave()
  }

  function onUserGesture(): void {
    userTouched = true
    cancelRestore()
  }

  let attached: HTMLElement | null = null

  function attach(): void {
    const canvas = canvasEl()
    if (!canvas || canvas === attached) return
    attached?.removeEventListener('scroll', onScroll)
    attached = canvas
    canvas.addEventListener('scroll', onScroll, { passive: true })
    canvas.addEventListener('wheel', onUserGesture, { passive: true })
    canvas.addEventListener('touchmove', onUserGesture, { passive: true })
  }

  function detach(): void {
    attached?.removeEventListener('scroll', onScroll)
    attached?.removeEventListener('wheel', onUserGesture)
    attached?.removeEventListener('touchmove', onUserGesture)
    attached = null
  }

  onMounted(() => {
    attach()
    restore()
  })

  watch(
    () => deps.scope.value,
    () => {
      detach()
      attach()
      restore()
    },
  )

  onBeforeUnmount(() => {
    // 离开前把当前位置写回，下次打开接着看
    if (!restoring) saveNow()
    cancelRestore()
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    detach()
  })

  return {
    restore,
    saveNow,
    isRestoring: () => restoring,
    isRestored: () => restored,
  }
}
