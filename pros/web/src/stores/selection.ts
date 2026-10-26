import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DualTriangleBlockId, QuadrantPosition } from '../types/canvas'

export type SelectionKind = 'quadrant' | 'marker' | 'item' | 'block' | null

/** 条目所属容器：四象限或双三角方块 */
export type ItemContainerKind = 'quadrant' | 'block'

export const useSelectionStore = defineStore('selection', () => {
  const kind = ref<SelectionKind>(null)
  const quadrantPosition = ref<QuadrantPosition | null>(null)
  const blockId = ref<DualTriangleBlockId | string | null>(null)
  const markerId = ref<string | null>(null)
  const itemId = ref<string | null>(null)
  /** 当前选中条目所在容器类型 */
  const itemContainerKind = ref<ItemContainerKind | null>(null)

  function selectQuadrant(position: QuadrantPosition) {
    kind.value = 'quadrant'
    quadrantPosition.value = position
    blockId.value = null
    markerId.value = null
    itemId.value = null
    itemContainerKind.value = null
  }

  function selectBlock(id: DualTriangleBlockId | string) {
    kind.value = 'block'
    blockId.value = id
    quadrantPosition.value = null
    markerId.value = null
    itemId.value = null
    itemContainerKind.value = null
  }

  function selectMarker(id: string) {
    kind.value = 'marker'
    markerId.value = id
    quadrantPosition.value = null
    blockId.value = null
    itemId.value = null
    itemContainerKind.value = null
  }

  function selectItem(quadrant: QuadrantPosition, id: string) {
    kind.value = 'item'
    quadrantPosition.value = quadrant
    itemId.value = id
    markerId.value = null
    blockId.value = null
    itemContainerKind.value = 'quadrant'
  }

  function selectBlockItem(block: DualTriangleBlockId | string, id: string) {
    kind.value = 'item'
    blockId.value = block
    itemId.value = id
    markerId.value = null
    quadrantPosition.value = null
    itemContainerKind.value = 'block'
  }

  function clear() {
    kind.value = null
    quadrantPosition.value = null
    blockId.value = null
    markerId.value = null
    itemId.value = null
    itemContainerKind.value = null
  }

  return {
    kind,
    quadrantPosition,
    blockId,
    markerId,
    itemId,
    itemContainerKind,
    selectQuadrant,
    selectBlock,
    selectMarker,
    selectItem,
    selectBlockItem,
    clear,
  }
})
