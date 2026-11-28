<script setup lang="ts">
/**
 * 苦练基本功三环分析法。
 *
 * 图形部分（三个半透明圆 + 正六边形 + 顶点圆点 + 装饰弧箭头 + 静态标签）全部用
 * SVG 绘制，尽量还原参考图配色与排版；用户填写的内容用 CanvasRegionEditor
 * 浮层渲染，位置由 threeRingBasicsLayout.ts 统一给出（与 SVG 同一套坐标）。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  ThreeRingBasicsBlock,
  ThreeRingBasicsDocumentJSON,
  ThreeRingBasicsRegionId,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import CanvasRegionEditor from './CanvasRegionEditor.vue'
import {
  chipLeft,
  toPercent,
  type RegionLayout,
} from './regionLayout'
import {
  THREE_RING_LAYOUT,
  TRB_ARROWS,
  TRB_COLORS,
  TRB_HEX,
  TRB_HEX_POINTS,
  TRB_RING_CENTERS,
  TRB_RING_RADIUS,
  TRB_VIEW,
} from './threeRingBasicsLayout'

const props = defineProps<{
  doc: ThreeRingBasicsDocumentJSON
}>()

const documentStore = useDocumentStore()

/** 补齐缺失的块，保证每个区域都有可编辑入口 */
documentStore.ensureThreeRingBasicsBlocks()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const blocksById = computed(() => {
  const map = new Map<ThreeRingBasicsRegionId, ThreeRingBasicsBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function blockOf(id: ThreeRingBasicsRegionId): ThreeRingBasicsBlock | undefined {
  return blocksById.value.get(id)
}

function regionTitle(id: ThreeRingBasicsRegionId): string {
  return props.doc.regions?.[id]?.title ?? blockOf(id)?.title ?? id
}

interface PlacedRegion {
  id: ThreeRingBasicsRegionId
  title: string
  layout: RegionLayout
  items: ThreeRingBasicsBlock['items']
  /** 浮层定位（百分比） */
  left: string
  top: string
  width: string
}

const placedRegions = computed<PlacedRegion[]>(() =>
  (Object.keys(THREE_RING_LAYOUT) as ThreeRingBasicsRegionId[]).map((id) => {
    const layout = THREE_RING_LAYOUT[id]
    const chip = layout.chip
    const left = chipLeft(chip)
    return {
      id,
      title: regionTitle(id),
      layout,
      items: blockOf(id)?.items ?? [],
      left: toPercent(left, TRB_VIEW.w),
      top: toPercent(chip.y, TRB_VIEW.h),
      width: toPercent(chip.width, TRB_VIEW.w),
    }
  }),
)

onMounted(() => {
  documentStore.ensureThreeRingBasicsBlocks()
})

onBeforeUnmount(() => {
  /* 组件卸载时无需额外清理：内容已写入文档 JSON */
})
</script>

<template>
  <div class="trb-canvas" :style="chrome" aria-label="苦练基本功三环分析法画布">
    <div class="trb-board">
    <div class="trb-stage">
      <svg
        class="trb-svg"
        :viewBox="`0 0 ${TRB_VIEW.w} ${TRB_VIEW.h}`"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="三环分析法示意图：足够务实、足够可练、足够价值三环交叠，中间是六边形六条判据"
      >
        <defs>
          <marker
            v-for="(a, i) in TRB_ARROWS"
            :id="`trbArrow${i}`"
            :key="i"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L7,3 L0,6 Z" :fill="a.color" />
          </marker>
        </defs>

        <!-- 三环 -->
        <circle
          :cx="TRB_RING_CENTERS.practical.x"
          :cy="TRB_RING_CENTERS.practical.y"
          :r="TRB_RING_RADIUS"
          :fill="TRB_COLORS.practical.fill"
          :stroke="TRB_COLORS.practical.stroke"
          stroke-width="2.5"
        />
        <circle
          :cx="TRB_RING_CENTERS.trainable.x"
          :cy="TRB_RING_CENTERS.trainable.y"
          :r="TRB_RING_RADIUS"
          :fill="TRB_COLORS.trainable.fill"
          :stroke="TRB_COLORS.trainable.stroke"
          stroke-width="2.5"
        />
        <circle
          :cx="TRB_RING_CENTERS.value.x"
          :cy="TRB_RING_CENTERS.value.y"
          :r="TRB_RING_RADIUS"
          :fill="TRB_COLORS.value.fill"
          :stroke="TRB_COLORS.value.stroke"
          stroke-width="2.5"
        />

        <!-- 六边形 -->
        <polygon
          :points="TRB_HEX_POINTS"
          fill="none"
          :stroke="TRB_COLORS.hex"
          stroke-width="3"
          stroke-linejoin="round"
        />

        <!-- 六边形顶点圆点 -->
        <circle
          v-for="(v, i) in TRB_HEX.vertices"
          :key="`vx-${i}`"
          :cx="v.x"
          :cy="v.y"
          r="6.5"
          fill="#ffffff"
          :stroke="TRB_COLORS.hex"
          stroke-width="2.5"
        />

        <!-- 装饰弧形箭头 -->
        <path
          v-for="(a, i) in TRB_ARROWS"
          :key="`ar-${i}`"
          :d="a.d"
          fill="none"
          :stroke="a.color"
          stroke-width="2.6"
          stroke-linecap="round"
          :marker-end="`url(#trbArrow${i})`"
          opacity="0.9"
        />

        <!-- 静态标签（保留参考图排版） -->
        <g class="trb-labels">
          <template v-for="r in placedRegions" :key="`lb-${r.id}`">
            <text
              :x="r.layout.label.x"
              :y="r.layout.label.y"
              :text-anchor="r.layout.label.anchor"
              :font-size="r.layout.label.size"
              :font-weight="r.layout.label.weight"
              :fill="r.layout.label.color"
              dominant-baseline="alphabetic"
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
      </svg>
    </div>

      <div class="trb-regions">
        <section
          v-for="r in placedRegions"
          :key="`ed-${r.id}`"
          class="trb-region"
          :style="{
            left: r.left,
            top: r.top,
            width: r.width,
          }"
        >
          <h3 class="trb-card-title">{{ r.title }}</h3>
          <CanvasRegionEditor
            :block-id="r.id"
            :title="r.title"
            :items="r.items"
            :placeholder="`填写${r.title}`"
          />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trb-canvas {
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

.trb-board {
  position: relative;
  flex: 0 0 auto;
  margin: auto;
  width: min(100%, 1040px);
}

.trb-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1000 / 900;
}

.trb-regions {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.trb-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  user-select: none;
}

.trb-labels text {
  pointer-events: none;
}

.trb-region {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  pointer-events: auto;
}

.trb-card-title {
  display: none;
  margin: 0;
}

@media (max-width: 800px) {
  .trb-canvas {
    display: block;
    padding: 12px 12px 96px;
  }

  .trb-board {
    width: 100%;
    margin: 0;
  }

  .trb-regions {
    position: static;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
    pointer-events: auto;
  }

  .trb-region {
    position: static;
    left: auto;
    top: auto;
    width: auto !important;
    padding: 12px 12px 10px;
    border: 1px solid var(--cv-frame, #ececec);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 8px 20px rgba(62, 48, 28, 0.06);
  }

  .trb-card-title {
    display: block;
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 750;
    line-height: 1.35;
    color: var(--cv-ink-strong, #202124);
  }

  .trb-region :deep(.region-editor) {
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .trb-region :deep(.region-toolbar) {
    opacity: 1;
    top: 8px;
    right: 8px;
  }

  .trb-region :deep(.region-max-btn) {
    width: 36px;
    height: 36px;
    border-radius: 8px;
  }

  .trb-region :deep(.region-input) {
    min-height: 72px;
    max-height: none;
    overflow: visible;
    padding: 4px 48px 4px 2px;
    font-size: 15px;
    line-height: 1.55;
    white-space: normal;
  }

  .trb-region :deep(.region-input.is-blank) {
    max-height: none;
    white-space: normal;
  }

  .trb-region :deep(.region-input.is-blank::before) {
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
  }
}
</style>
