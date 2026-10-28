<script setup lang="ts">
import { computed } from 'vue'
import type {
  OnlineOfflineCommBlock,
  OnlineOfflineCommBlockId,
  OnlineOfflineCommDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: OnlineOfflineCommDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<OnlineOfflineCommBlockId, OnlineOfflineCommBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: OnlineOfflineCommBlockId): OnlineOfflineCommBlock | undefined {
  return byId.value.get(id)
}

const axes = computed(() => props.doc.axes)
const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

/** 附图色值取样：蓝 / 绿 / 紫 / 粉 */
const TONE_CHIP: Record<string, string> = {
  blue: '#a4c4fc',
  green: '#b8fcb8',
  purple: '#e4a4fc',
  pink: '#fcb8b8',
}

const order: OnlineOfflineCommBlockId[] = ['a', 'b', 'c', 'd']
</script>

<template>
  <div
    class="ooc-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="线上线下沟通"
  >
    <div class="ooc-frame">
      <div class="ooc-axis-label ooc-axis-label--top">
        {{ axes.online }}
      </div>
      <div class="ooc-axis-label ooc-axis-label--left">
        {{ axes.asyncComm }}
      </div>
      <div class="ooc-axis-label ooc-axis-label--right">
        {{ axes.syncComm }}
      </div>
      <div class="ooc-axis-label ooc-axis-label--bottom">
        {{ axes.offline }}
      </div>

      <div class="ooc-plot">
        <svg
          class="ooc-axes"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="ooc-arrow-v"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#111111" />
            </marker>
            <marker
              id="ooc-arrow-h"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#111111" />
            </marker>
          </defs>
          <!-- 竖轴：底 → 顶（箭头朝「线上」） -->
          <line
            x1="50"
            y1="99.2"
            x2="50"
            y2="1.2"
            stroke="#111111"
            stroke-width="1.6"
            vector-effect="non-scaling-stroke"
            marker-end="url(#ooc-arrow-v)"
          />
          <!-- 横轴：左 → 右（箭头朝「同步沟通」） -->
          <line
            x1="0.8"
            y1="50"
            x2="98.8"
            y2="50"
            stroke="#111111"
            stroke-width="1.6"
            vector-effect="non-scaling-stroke"
            marker-end="url(#ooc-arrow-h)"
          />
        </svg>

        <div class="ooc-grid" role="group">
          <section
            v-for="id in order"
            :key="id"
            v-show="block(id)"
            class="ooc-cell"
            :data-tone="block(id)!.tone"
            :style="{ '--ooc-chip': TONE_CHIP[block(id)!.tone] || '#eee' }"
          >
            <div class="ooc-body">
              <YModelBlockCard :block="block(id)!" hide-title />
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ooc-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  background: #ffffff;
}

.ooc-frame {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
  margin: 0;
  min-height: 0;
  height: 100%;
  padding: 36px 64px 40px 72px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.ooc-axis-label {
  position: absolute;
  font-size: clamp(16px, 1.8vw, 24px);
  font-weight: 800;
  color: #111111;
  letter-spacing: 0.12em;
  line-height: 1.15;
  user-select: none;
  pointer-events: none;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  z-index: 4;
}

.ooc-axis-label--top {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.ooc-axis-label--bottom {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.ooc-axis-label--left {
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  writing-mode: horizontal-tb;
  max-width: 5em;
  text-align: center;
}

.ooc-axis-label--right {
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  max-width: 5em;
  text-align: center;
}

.ooc-plot {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.ooc-axes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
  overflow: visible;
}

.ooc-grid {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: clamp(16px, 2.2vh, 28px) clamp(16px, 2.2vw, 28px);
  box-sizing: border-box;
}

.ooc-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-radius: 0;
  padding: clamp(10px, 1.6vh, 18px) clamp(8px, 1.2vw, 16px) 8px;
  box-sizing: border-box;
  gap: 8px;
  border: none;
  box-shadow: none;
  overflow: hidden;
  background: transparent;
}

.ooc-body {
  flex: 1;
  min-height: 400px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
}

.ooc-body :deep(.ym-block) {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  overflow: hidden;
}

.ooc-body :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ooc-cell:hover :deep(.ym-block-toolbar),
.ooc-body :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.ooc-body :deep(.ym-block-body) {
  flex: 1;
  min-height: 400px;
  overflow: auto;
}

.ooc-body :deep(.ym-block-body),
.ooc-body :deep(.ym-rte),
.ooc-body :deep(.rte-root),
.ooc-body :deep(.ProseMirror),
.ooc-body :deep([contenteditable='true']) {
  background: transparent !important;
}

/* 气泡 chip：附图椭圆色块；strong>mark = 粗黑描边 */
.ooc-body :deep(.ProseMirror) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  min-height: 100%;
  padding: 8px 4px;
}

.ooc-body :deep(.ProseMirror > p) {
  margin: 0.2em 0;
  line-height: 1.4;
}

.ooc-body :deep(mark) {
  display: inline-block;
  border-radius: 999px;
  padding: 0.45em 1.15em;
  margin: 0.15em 0.2em;
  font-weight: 700;
  font-size: clamp(14px, 1.5vw, 20px);
  color: #111111 !important;
  letter-spacing: 0.04em;
  border: 1.5px solid transparent;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.ooc-body :deep(strong mark),
.ooc-body :deep(mark strong),
.ooc-body :deep(strong > mark) {
  border: 3px solid #111111;
  font-weight: 800;
}

.ooc-body :deep(.panel-attachments),
.ooc-body :deep(.pa-root) {
  opacity: 0.55;
  flex-shrink: 0;
}

.ooc-cell:hover :deep(.panel-attachments),
.ooc-cell:hover :deep(.pa-root) {
  opacity: 1;
}

@media (max-width: 720px) {
  .ooc-canvas {
    overflow: auto;
  }

  .ooc-frame {
    padding: 36px 10px 42px;
    min-height: 0;
    height: auto;
  }

  .ooc-plot,
  .ooc-grid {
    min-height: 0;
    height: auto;
  }

  .ooc-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    gap: 16px;
  }

  .ooc-axes {
    display: none;
  }

  .ooc-axis-label--left,
  .ooc-axis-label--right {
    display: none;
  }

  .ooc-cell {
    min-height: 260px;
    height: auto;
  }
}
</style>
