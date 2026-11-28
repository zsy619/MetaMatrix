<script setup lang="ts">
/**
 * 右下角缩略图（参照 excalidraw）。
 *
 * 显示全部节点与当前视口；点/拖缩略图可以把视口挪到对应位置。
 */
import { computed, ref } from 'vue'
import type { GraphNode, NodeGraphViewport } from '../../../types/nodeGraph'

const props = defineProps<{
  nodes: GraphNode[]
  viewport: NodeGraphViewport
  /** 画布可视区尺寸（css px）。 */
  size: { width: number; height: number }
}>()

const emit = defineEmits<{ navigate: [worldX: number, worldY: number] }>()

const MAP_WIDTH = 208
const MAP_HEIGHT = 140
/** 缩略图四周留白。 */
const PAD = 12

/** 世界坐标包围盒：所有节点，没有节点时给一个默认小框。 */
const bounds = computed(() => {
  if (!props.nodes.length) {
    return { minX: -200, minY: -150, width: 400, height: 300 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of props.nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
})

const scale = computed(() =>
  Math.min(
    (MAP_WIDTH - PAD * 2) / bounds.value.width,
    (MAP_HEIGHT - PAD * 2) / bounds.value.height,
  ),
)

/** 世界坐标 → 缩略图坐标。 */
function toMap(x: number, y: number) {
  return {
    x: PAD + (x - bounds.value.minX) * scale.value,
    y: PAD + (y - bounds.value.minY) * scale.value,
  }
}

const nodeRects = computed(() =>
  props.nodes.map((n) => {
    const p = toMap(n.x, n.y)
    return {
      id: n.id,
      x: p.x,
      y: p.y,
      w: Math.max(3, n.width * scale.value),
      h: Math.max(3, n.height * scale.value),
    }
  }),
)

/** 当前视口在缩略图上的位置。 */
const viewportRect = computed(() => {
  const zoom = props.viewport.zoom || 1
  // 视口左上角对应的世界坐标
  const worldX = -props.viewport.x / zoom
  const worldY = -props.viewport.y / zoom
  const p = toMap(worldX, worldY)
  return {
    x: p.x,
    y: p.y,
    w: Math.max(6, (props.size.width / zoom) * scale.value),
    h: Math.max(6, (props.size.height / zoom) * scale.value),
  }
})

const dragging = ref(false)

function onPointerDown(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  svg.setPointerCapture(event.pointerId)
  dragging.value = true
  navigateTo(event)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  navigateTo(event)
}

function onPointerUp(event: PointerEvent) {
  dragging.value = false
  const svg = event.currentTarget as SVGSVGElement
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
}

/** 把缩略图上的点击位置换算成世界坐标，交给上层平移视口。 */
function navigateTo(event: PointerEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  const mx = event.clientX - rect.left
  const my = event.clientY - rect.top
  const worldX = bounds.value.minX + (mx - PAD) / scale.value
  const worldY = bounds.value.minY + (my - PAD) / scale.value
  emit('navigate', worldX, worldY)
}
</script>

<template>
  <div class="ng-minimap" aria-label="缩略图">
    <svg
      class="ng-minimap__svg"
      :width="MAP_WIDTH"
      :height="MAP_HEIGHT"
      :viewBox="`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <rect
        v-for="rect in nodeRects"
        :key="rect.id"
        :x="rect.x"
        :y="rect.y"
        :width="rect.w"
        :height="rect.h"
        rx="2"
        fill="none"
        stroke="#6366f1"
        stroke-width="1"
      />
      <rect
        class="ng-minimap__viewport"
        :x="viewportRect.x"
        :y="viewportRect.y"
        :width="viewportRect.w"
        :height="viewportRect.h"
        rx="2"
        fill="rgba(37, 99, 235, 0.10)"
        stroke="#2563eb"
        stroke-width="1.4"
      />
    </svg>
  </div>
</template>

<style scoped>
.ng-minimap {
  position: absolute;
  /* 放左下角、缩放条上方：右侧被节点属性面板整条占着，
     缩略图放右下角会被面板挡住（同 excalidraw 的左下角画布控件区）。 */
  left: 12px;
  bottom: 60px;
  z-index: 8;
  padding: 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e2e8f0;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
}

.ng-minimap__svg {
  display: block;
  cursor: pointer;
  touch-action: none;
}
</style>
