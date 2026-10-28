import {
  computed,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

/** 全局仅允许一个面板处于最大化（跨 YModelBlock / 象限 / 双三角 / 需求三角等） */
const maximizedPanelKey = ref<string | null>(null)

/** 最大化时锁住页面滚动，避免遮罩下出现滚动条 */
let bodyLockCount = 0
let prevBodyOverflow = ''
let prevHtmlOverflow = ''

function lockPageScroll() {
  if (typeof document === 'undefined') return
  if (bodyLockCount === 0) {
    prevBodyOverflow = document.body.style.overflow
    prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  bodyLockCount += 1
}

function unlockPageScroll() {
  if (typeof document === 'undefined') return
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) {
    document.body.style.overflow = prevBodyOverflow
    document.documentElement.style.overflow = prevHtmlOverflow
  }
}

watch(maximizedPanelKey, (key, prev) => {
  if (key && !prev) lockPageScroll()
  if (!key && prev) unlockPageScroll()
})

/** 稳定 key：如 block:xxx / cell:tl / demand:legend */
export function panelMaximizeKey(kind: string, id: string): string {
  return `${kind}:${id}`
}

export function usePanelMaximize(key: MaybeRefOrGetter<string>) {
  const resolvedKey = computed(() => toValue(key))

  const isMaximized = computed(
    () => maximizedPanelKey.value === resolvedKey.value,
  )

  function openMaximize() {
    maximizedPanelKey.value = resolvedKey.value
  }

  function closeMaximize() {
    if (maximizedPanelKey.value === resolvedKey.value) {
      maximizedPanelKey.value = null
    }
  }

  function toggleMaximize() {
    if (isMaximized.value) closeMaximize()
    else openMaximize()
  }

  function onOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMaximize()
    }
  }

  watch(isMaximized, (open) => {
    if (open) {
      window.addEventListener('keydown', onOverlayKeydown)
    } else {
      window.removeEventListener('keydown', onOverlayKeydown)
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onOverlayKeydown)
    if (maximizedPanelKey.value === resolvedKey.value) {
      maximizedPanelKey.value = null
    }
  })

  return {
    isMaximized,
    openMaximize,
    closeMaximize,
    toggleMaximize,
    maximizedPanelKey,
  }
}
