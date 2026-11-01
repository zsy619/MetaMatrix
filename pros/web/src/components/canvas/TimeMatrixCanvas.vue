<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle, paintForTone } from './canvasChrome'
import type {
  TimeMatrixBlock,
  TimeMatrixBlockId,
  TimeMatrixDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: TimeMatrixDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<TimeMatrixBlockId, TimeMatrixBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: TimeMatrixBlockId): TimeMatrixBlock | undefined {
  return byId.value.get(id)
}

const axes = computed(() => props.doc.axes)
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

function cellPaint(id: TimeMatrixBlockId) {
  const item = block(id)
  return paintForTone(item?.tone, item)
}

const order: TimeMatrixBlockId[] = ['a', 'b', 'c', 'd']
</script>

<template>
  <div
    class="tm-canvas"
    :style="chrome"
    aria-label="时间管理矩阵"
  >
    <div class="tm-frame">
      <div class="tm-axis-label tm-axis-label--top">
        {{ axes.importanceHigh }}
      </div>
      <div class="tm-axis-label tm-axis-label--left">
        {{ axes.urgencyLow }}
      </div>
      <div class="tm-axis-label tm-axis-label--right">
        {{ axes.urgencyHigh }}
      </div>
      <div class="tm-axis-label tm-axis-label--bottom">
        {{ axes.importanceLow }}
      </div>

      <div class="tm-plot">
        <svg
          class="tm-axes"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="tm-arrow-v"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#3c3424" />
            </marker>
            <marker
              id="tm-arrow-h"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#3c3424" />
            </marker>
          </defs>
          <!-- 竖轴：底 → 顶（箭头朝「重要」） -->
          <line
            x1="50"
            y1="99.2"
            x2="50"
            y2="1.2"
            stroke="#3c3424"
            stroke-width="2.4"
            vector-effect="non-scaling-stroke"
            marker-end="url(#tm-arrow-v)"
          />
          <!-- 横轴：左 → 右（箭头朝「紧急」） -->
          <line
            x1="0.8"
            y1="50"
            x2="98.8"
            y2="50"
            stroke="#3c3424"
            stroke-width="2.4"
            vector-effect="non-scaling-stroke"
            marker-end="url(#tm-arrow-h)"
          />
        </svg>

        <div class="tm-grid" role="group">
          <section
            v-for="id in order"
            :key="id"
            v-show="block(id)"
            class="tm-cell"
            :style="{ backgroundColor: cellPaint(id).fill }"
          >
            <h2 class="tm-title" :style="{ color: cellPaint(id).topic }">{{ block(id)!.title }}</h2>
            <div class="tm-body">
              <YModelBlockCard :block="block(id)!" hide-title />
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tm-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden; /* 页面/画布不出现滚动条 */
  box-sizing: border-box;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  background: #ffffff;
}

.tm-frame {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
  margin: 0;
  min-height: 0;
  height: 100%;
  padding: 36px 52px 40px 58px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.tm-axis-label {
  position: absolute;
  font-size: clamp(16px, 1.8vw, 24px);
  font-weight: 800;
  color: #3c3424;
  letter-spacing: 0.12em;
  line-height: 1.15;
  user-select: none;
  pointer-events: none;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  z-index: 4;
}

.tm-axis-label--top {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.tm-axis-label--bottom {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.tm-axis-label--left {
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.tm-axis-label--right {
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.tm-plot {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.tm-axes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
  overflow: visible;
}

.tm-grid {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  /* 与 star-quadrant（QuadrantGrid gap:0）一致：四格贴满象限、边到边 */
  gap: 0;
  box-sizing: border-box;
}

.tm-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-width: 0;
  min-height: 0; /* 随网格撑满，不把页面撑出滚动条 */
  width: 100%;
  height: 100%;
  border-radius: 0;
  /* padding 对齐 QuadrantCell，面板本体仍占满格子 */
  padding: 12px 14px 14px;
  box-sizing: border-box;
  gap: 8px;
  border: none;
  box-shadow: none;
  overflow: hidden;
}

.tm-title {
  margin: 0;
  flex-shrink: 0;
  text-align: center;
  font-size: clamp(16px, 2vw, 26px);
  font-weight: 800;
  color: #3c3424;
  letter-spacing: 0.04em;
  line-height: 1.35;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.tm-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
}

.tm-body :deep(.ym-block) {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  align-self: stretch;
  min-height: 0;
  width: 100%;
  height: 100%;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  overflow: hidden;
}

.tm-body :deep(.ym-rte),
.tm-body :deep(.rte-root) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.tm-body :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tm-cell:hover :deep(.ym-block-toolbar),
.tm-body :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.tm-body :deep(.ym-block-body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.tm-body :deep(.ym-block-body),
.tm-body :deep(.ym-rte),
.tm-body :deep(.rte-root),
.tm-body :deep(.ProseMirror),
.tm-body :deep([contenteditable='true']) {
  background: transparent !important;
}

.tm-body :deep(.panel-attachments),
.tm-body :deep(.pa-root) {
  opacity: 0.55;
  flex-shrink: 0;
}

.tm-cell:hover :deep(.panel-attachments),
.tm-cell:hover :deep(.pa-root) {
  opacity: 1;
}

@media (max-width: 720px) {
  .tm-canvas {
    overflow: auto; /* 窄屏允许画布内滚动，仍避免撑破外层页面 */
  }

  .tm-frame {
    padding: 36px 10px 42px;
    min-height: 0;
    height: auto;
  }

  .tm-plot,
  .tm-grid {
    min-height: 0;
    height: auto;
  }

  .tm-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    gap: 16px;
  }

  .tm-axes {
    display: none;
  }

  .tm-axis-label--left,
  .tm-axis-label--right {
    display: none;
  }

  .tm-cell {
    min-height: 220px;
    height: auto;
  }
}
</style>
