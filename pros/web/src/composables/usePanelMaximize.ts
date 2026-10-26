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
