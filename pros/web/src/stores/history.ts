import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CanvasDocumentJSON } from '../types/canvas'

const MAX_STACK = 50

/**
 * Frontend undo/redo memory stack.
 * Independent from server-side canvas_revisions.
 */
export const useHistoryStore = defineStore('history', () => {
  const past = ref<CanvasDocumentJSON[]>([])
  const future = ref<CanvasDocumentJSON[]>([])

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function push(snapshot: CanvasDocumentJSON) {
    past.value.push(structuredClone(snapshot))
    if (past.value.length > MAX_STACK) {
      past.value.shift()
    }
    future.value = []
  }

  function undo(current: CanvasDocumentJSON): CanvasDocumentJSON | null {
    const prev = past.value.pop()
    if (!prev) return null
    future.value.push(structuredClone(current))
    return prev
  }

  function redo(current: CanvasDocumentJSON): CanvasDocumentJSON | null {
    const next = future.value.pop()
    if (!next) return null
    past.value.push(structuredClone(current))
    return next
  }

  function clear() {
    past.value = []
    future.value = []
  }

  return {
    past,
    future,
    canUndo,
    canRedo,
    push,
    undo,
    redo,
    clear,
  }
})
