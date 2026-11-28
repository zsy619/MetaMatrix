/**
 * 提交进度驱动。
 *
 * 认证是一次不透明的网络往返，拿不到真实进度。这里按"阶段"推进：
 * 每个阶段对应一个目标百分比，阶段之间用缓动补间过渡，
 * 既让进度条持续在动，又让百分比单调递增、不会来回跳。
 *
 * 上限刻意卡在 92%：真正的 100% 只在服务端确认成功后出现，
 * 否则失败时会看到"跳到 100% 又报错"，比停在 92% 更让人困惑。
 */
import { onBeforeUnmount, ref } from 'vue'

const START_PERCENT = 8
const MAX_PERCENT = 92

export interface SubmitProgress {
  /** 当前百分比（0~100）。 */
  percent: ReturnType<typeof ref<number>>
  /** 当前阶段序号（从 0 开始）。 */
  stageIndex: ReturnType<typeof ref<number>>
  /** 阶段总数。 */
  stageCount: ReturnType<typeof ref<number>>
  /** 开始推进。 */
  start: (stageCount: number, stageIntervalMs?: number) => void
  /** 成功：直接满格。 */
  complete: () => void
  /** 失败/取消：停止推进。 */
  stop: () => void
}

export function useSubmitProgress(): SubmitProgress {
  const percent = ref(0)
  const stageIndex = ref(0)
  const stageCount = ref(1)
  let raf = 0
  let target = 0
  let stageTimer: ReturnType<typeof setInterval> | null = null

  /** 阶段目标：越往后越接近上限，但永远不到 100%。 */
  function stageTarget(index: number, total: number): number {
    if (total <= 1) return MAX_PERCENT
    const span = MAX_PERCENT - START_PERCENT
    return START_PERCENT + (span * (index + 1)) / total
  }

  function loop() {
    const gap = target - percent.value
    if (gap <= 0.2) {
      percent.value = target
      raf = 0
      return
    }
    // 越接近目标推进越慢，既有"在动"的感觉，又不会瞬间冲到顶。
    percent.value += Math.max(gap * 0.09, 0.25)
    raf = requestAnimationFrame(loop)
  }

  function schedule() {
    if (raf) return
    raf = requestAnimationFrame(loop)
  }

  function clearStageTimer() {
    if (stageTimer !== null) {
      clearInterval(stageTimer)
      stageTimer = null
    }
  }

  function start(total: number, stageIntervalMs = 900) {
    clearStageTimer()
    stageCount.value = Math.max(1, total)
    stageIndex.value = 0
    percent.value = START_PERCENT
    target = stageTarget(0, stageCount.value)
    schedule()
    if (stageCount.value > 1) {
      stageTimer = setInterval(() => {
        if (stageIndex.value < stageCount.value - 1) {
          stageIndex.value += 1
          target = stageTarget(stageIndex.value, stageCount.value)
        } else {
          clearStageTimer()
        }
      }, stageIntervalMs)
    }
  }

  function complete() {
    clearStageTimer()
    target = 100
    percent.value = 100
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  function stop() {
    clearStageTimer()
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  onBeforeUnmount(stop)

  return { percent, stageIndex, stageCount, start, complete, stop }
}
