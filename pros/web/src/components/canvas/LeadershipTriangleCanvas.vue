<script setup lang="ts">
/**
 * 领导核心价值驱动三角。
 *
 * 图形部分（顶部 A ⇄ B、领导力标题、5 层金字塔、右侧上下箭头与管理/权力两角）
 * 全部用 SVG 绘制，尽量还原参考图配色与排版；用户填写的内容用
 * CanvasRegionEditor 浮层渲染，位置由 leadershipTriangleLayout.ts 给出。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  LeadershipTriangleBlock,
  LeadershipTriangleDocumentJSON,
  LeadershipTriangleRegionId,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import CanvasRegionEditor from './CanvasRegionEditor.vue'
import {
  chipLeft,
  toPercent,
  type RegionLayout,
} from './regionLayout'
import {
  LEADERSHIP_TRIANGLE_LAYOUT,
  LT_COLORS,
  LT_LAYER_TAGS,
  LT_PYRAMID,
  LT_PYRAMID_LAYERS,
  LT_VIEW,
} from './leadershipTriangleLayout'

const props = defineProps<{
  doc: LeadershipTriangleDocumentJSON
}>()

const documentStore = useDocumentStore()

/** 补齐缺失的块，保证每个区域都有可编辑入口 */
documentStore.ensureLeadershipTriangleBlocks()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const blocksById = computed(() => {
  const map = new Map<LeadershipTriangleRegionId, LeadershipTriangleBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function blockOf(
  id: LeadershipTriangleRegionId,
): LeadershipTriangleBlock | undefined {
  return blocksById.value.get(id)
}

function regionTitle(id: LeadershipTriangleRegionId): string {
  return props.doc.regions?.[id]?.title ?? blockOf(id)?.title ?? id
}

interface PlacedRegion {
  id: LeadershipTriangleRegionId
  title: string
  layout: RegionLayout
  items: LeadershipTriangleBlock['items']
  left: string
  top: string
  width: string
}

const placedRegions = computed<PlacedRegion[]>(() =>
  (
    Object.keys(LEADERSHIP_TRIANGLE_LAYOUT) as LeadershipTriangleRegionId[]
  ).map((id) => {
    const layout = LEADERSHIP_TRIANGLE_LAYOUT[id]
    const chip = layout.chip
    const left = chipLeft(chip)
    return {
      id,
      title: regionTitle(id),
      layout,
      items: blockOf(id)?.items ?? [],
      left: toPercent(left, LT_VIEW.w),
      top: toPercent(chip.y, LT_VIEW.h),
      width: toPercent(chip.width, LT_VIEW.w),
    }
  }),
)

onMounted(() => {
  documentStore.ensureLeadershipTriangleBlocks()
})

onBeforeUnmount(() => {
  /* 组件卸载时无需额外清理：内容已写入文档 JSON */
})
</script>

<template>
  <div
    class="lt-canvas"
    :style="chrome"
    aria-label="领导核心价值驱动三角画布"
  >
    <div class="lt-stage">
      <svg
        class="lt-svg"
        :viewBox="`0 0 ${LT_VIEW.w} ${LT_VIEW.h}`"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="领导核心价值驱动三角示意图"
      >
        <defs>
          <marker
            id="ltArrowLeft"
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="3.2"
            orient="auto"
          >
            <path d="M0,0 L8,3.2 L0,6.4 Z" :fill="LT_COLORS.arrow" />
          </marker>
          <marker
            id="ltArrowRight"
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="3.2"
            orient="auto"
          >
            <path d="M0,0 L8,3.2 L0,6.4 Z" :fill="LT_COLORS.arrow" />
          </marker>
          <marker
            id="ltArrowUp"
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="3.2"
            orient="auto"
          >
            <path d="M0,0 L8,3.2 L0,6.4 Z" :fill="LT_COLORS.arrow" />
          </marker>
        </defs>

        <!-- 顶部 A ⇄ B -->
        <text
          x="165"
          y="150"
          text-anchor="middle"
          font-size="54"
          font-weight="900"
          font-style="italic"
          :fill="LT_COLORS.ink"
          stroke="#e8eef5"
          stroke-width="2"
          paint-order="stroke"
        >
          A
        </text>
        <text
          x="745"
          y="150"
          text-anchor="middle"
          font-size="54"
          font-weight="900"
          font-style="italic"
          :fill="LT_COLORS.ink"
          stroke="#e8eef5"
          stroke-width="2"
          paint-order="stroke"
        >
          B
        </text>
        <path
          d="M 700 118 L 215 118"
          fill="none"
          :stroke="LT_COLORS.arrow"
          stroke-width="2.4"
          stroke-linecap="round"
          marker-end="url(#ltArrowLeft)"
        />
        <path
          d="M 215 146 L 700 146"
          fill="none"
          :stroke="LT_COLORS.arrow"
          stroke-width="2.4"
          stroke-linecap="round"
          marker-end="url(#ltArrowRight)"
        />

        <!-- 5 层金字塔 -->
        <polygon
          v-for="l in LT_PYRAMID_LAYERS"
          :key="`pl-${l.index}`"
          :points="l.points"
          :fill="l.color"
          stroke="#ffffff"
          stroke-width="3"
          stroke-linejoin="round"
        />

        <!-- 层级序号（第 3 层由「难题」充当标题，这里补一条序号） -->
        <text
          v-for="t in LT_LAYER_TAGS"
          :key="`lt-${t.id}`"
          :x="t.x"
          :y="t.y"
          text-anchor="end"
          font-size="12"
          font-weight="700"
          fill="#9aa0a6"
        >
          {{ t.text }}
        </text>

        <!-- 右侧上下箭头 -->
        <path
          d="M 835 530 L 835 292"
          fill="none"
          :stroke="LT_COLORS.arrow"
          stroke-width="2.4"
          stroke-linecap="round"
          marker-end="url(#ltArrowUp)"
        />

        <!-- 静态标签（保留参考图排版） -->
        <g class="lt-labels">
          <template v-for="r in placedRegions" :key="`lb-${r.id}`">
            <text
              :x="r.layout.label.x"
              :y="r.layout.label.y"
              :text-anchor="r.layout.label.anchor"
              :font-size="r.layout.label.size"
              :font-weight="r.layout.label.weight"
              :fill="r.layout.label.color"
              :stroke="r.layout.label.stroke"
              :stroke-width="r.layout.label.strokeWidth"
              :paint-order="r.layout.label.stroke ? 'stroke' : undefined"
            >
              {{ r.layout.label.mainText ?? r.title }}
            </text>
            <text
              v-if="r.layout.label.sub"
              :x="r.layout.label.x"
              :y="r.layout.label.y + r.layout.label.sub.dy"
              :text-anchor="r.layout.label.anchor"
              :font-size="r.layout.label.sub.size"
              :font-weight="r.layout.label.sub.weight"
              :fill="r.layout.label.sub.color"
            >
              {{ r.layout.label.sub.text }}
            </text>
          </template>
        </g>

        <!-- 金字塔顶端与底边的辅助线（视觉收口） -->
        <line
          :x1="LT_PYRAMID.centerX - LT_PYRAMID.apexHalf"
          :y1="LT_PYRAMID.apexY"
          :x2="LT_PYRAMID.centerX + LT_PYRAMID.apexHalf"
          :y2="LT_PYRAMID.apexY"
          stroke="#ffffff"
          stroke-width="3"
        />
      </svg>

      <!-- 用户可填写区域 -->
      <div
        v-for="r in placedRegions"
        :key="`ed-${r.id}`"
        class="lt-region"
        :style="{
          left: r.left,
          top: r.top,
          width: r.width,
        }"
      >
        <CanvasRegionEditor
          :block-id="r.id"
          :title="r.title"
          :items="r.items"
          :placeholder="`填写${r.title}`"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lt-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  overflow: auto;
  padding: 10px;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.lt-stage {
  position: relative;
  flex: 0 0 auto;
  margin: auto;
  width: min(100%, 1060px);
  aspect-ratio: 1000 / 900;
}

.lt-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  user-select: none;
}

.lt-labels text {
  pointer-events: none;
}

.lt-region {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
}
</style>
