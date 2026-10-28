<script setup lang="ts">
import { computed } from 'vue'
import type {
  WorkStateZonesBlock,
  WorkStateZonesBlockId,
  WorkStateZonesDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: WorkStateZonesDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<WorkStateZonesBlockId, WorkStateZonesBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: WorkStateZonesBlockId): WorkStateZonesBlock | undefined {
  return byId.value.get(id)
}

const axes = computed(() => props.doc.axes)
const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

/**
 * 附图色值取样：
 * 轴红 #b85654
 * A 绿徽章 #9ad751 / 描述 #98d84e
 * B 黄徽章 #fae254 / 描述 #fde153
 * C 粉徽章 #ff898e / 描述 #fc8b8d
 * D 灰徽章 #8e8e8e / 描述 #8e8e8e
 */
const TONE: Record<
  string,
  { badge: string; desc: string }
> = {
  green: { badge: '#9ad751', desc: '#98d84e' },
  yellow: { badge: '#fae254', desc: '#fde153' },
  pink: { badge: '#ff898e', desc: '#fc8b8d' },
  grey: { badge: '#8e8e8e', desc: '#8e8e8e' },
}

const order: WorkStateZonesBlockId[] = ['a', 'b', 'c', 'd']
</script>

<template>
  <div
    class="wsz-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="人生红点工作状态区间"
  >
    <div class="wsz-frame">
      <div class="wsz-axis-label wsz-axis-label--top">
        <span class="wsz-axis-main">{{ axes.autonomyHigh.label }}</span>
        <span class="wsz-axis-sub">{{ axes.autonomyHigh.sub }}</span>
      </div>
      <div class="wsz-axis-label wsz-axis-label--bottom">
        <span class="wsz-axis-main">{{ axes.autonomyLow.label }}</span>
        <span class="wsz-axis-sub">{{ axes.autonomyLow.sub }}</span>
      </div>
      <div class="wsz-axis-label wsz-axis-label--left">
        <span class="wsz-axis-main">{{ axes.comfort.label }}</span>
        <span class="wsz-axis-sub">{{ axes.comfort.sub }}</span>
      </div>
      <div class="wsz-axis-label wsz-axis-label--right">
        <span class="wsz-axis-main">{{ axes.nonComfort.label }}</span>
        <span class="wsz-axis-sub">{{ axes.nonComfort.sub }}</span>
      </div>

      <div class="wsz-plot">
        <svg
          class="wsz-axes"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="wsz-arrow-v"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#b85654" />
            </marker>
            <marker
              id="wsz-arrow-h"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#b85654" />
            </marker>
          </defs>
          <!-- 竖轴：底 → 顶（箭头朝「自治」） -->
          <line
            x1="50"
            y1="99.2"
            x2="50"
            y2="1.2"
            stroke="#b85654"
            stroke-width="1.6"
            vector-effect="non-scaling-stroke"
            marker-end="url(#wsz-arrow-v)"
          />
          <!-- 横轴：左 → 右（箭头朝「非舒适区」） -->
          <line
            x1="0.8"
            y1="50"
            x2="98.8"
            y2="50"
            stroke="#b85654"
            stroke-width="1.6"
            vector-effect="non-scaling-stroke"
            marker-end="url(#wsz-arrow-h)"
          />
        </svg>

        <div class="wsz-grid" role="group">
          <section
            v-for="id in order"
            :key="id"
            v-show="block(id)"
            class="wsz-cell"
          >
            <div class="wsz-header">
              <h2
                class="wsz-badge"
                :style="{
                  backgroundColor: TONE[block(id)!.tone]?.badge || '#ccc',
                }"
              >
                {{ block(id)!.title }}
              </h2>
              <p
                class="wsz-desc"
                :style="{ color: TONE[block(id)!.tone]?.desc || '#666' }"
              >
                {{ block(id)!.description }}
              </p>
            </div>
            <div class="wsz-body">
              <YModelBlockCard :block="block(id)!" hide-title />
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wsz-canvas {
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

.wsz-frame {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
  margin: 0;
  min-height: 0;
  height: 100%;
  padding: 48px 64px 52px 72px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.wsz-axis-label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  user-select: none;
  pointer-events: none;
  z-index: 4;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.wsz-axis-main {
  font-size: clamp(15px, 1.7vw, 22px);
  font-weight: 800;
  color: #111111;
  letter-spacing: 0.08em;
  line-height: 1.15;
}

.wsz-axis-sub {
  font-size: clamp(11px, 1.1vw, 13px);
  font-weight: 500;
  color: #9aa0a6;
  letter-spacing: 0.02em;
  line-height: 1.2;
  white-space: nowrap;
}

.wsz-axis-label--top {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.wsz-axis-label--bottom {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.wsz-axis-label--left {
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.wsz-axis-label--right {
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.wsz-plot {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.wsz-axes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
  overflow: visible;
}

.wsz-grid {
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

.wsz-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-radius: 0;
  padding: clamp(12px, 1.8vh, 20px) clamp(10px, 1.4vw, 18px) 10px;
  box-sizing: border-box;
  gap: 8px;
  border: none;
  box-shadow: none;
  overflow: hidden;
  background: transparent;
}

.wsz-header {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-top: clamp(4px, 1vh, 12px);
}

.wsz-badge {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 18px;
  border-radius: 8px;
  font-size: clamp(15px, 1.8vw, 22px);
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.06em;
  line-height: 1.3;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  box-shadow: none;
  border: none;
}

.wsz-desc {
  margin: 0;
  text-align: center;
  font-size: clamp(13px, 1.35vw, 16px);
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.35;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.wsz-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
}

.wsz-body :deep(.ym-block) {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  overflow: hidden;
}

.wsz-body :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.wsz-cell:hover :deep(.ym-block-toolbar),
.wsz-body :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.wsz-body :deep(.ym-block-body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.wsz-body :deep(.ym-block-body),
.wsz-body :deep(.ym-rte),
.wsz-body :deep(.rte-root),
.wsz-body :deep(.ProseMirror),
.wsz-body :deep([contenteditable='true']) {
  background: transparent !important;
}

.wsz-body :deep(.panel-attachments),
.wsz-body :deep(.pa-root) {
  opacity: 0.55;
  flex-shrink: 0;
}

.wsz-cell:hover :deep(.panel-attachments),
.wsz-cell:hover :deep(.pa-root) {
  opacity: 1;
}

@media (max-width: 720px) {
  .wsz-canvas {
    overflow: auto;
  }

  .wsz-frame {
    padding: 56px 10px 64px;
    min-height: 0;
    height: auto;
  }

  .wsz-plot,
  .wsz-grid {
    min-height: 0;
    height: auto;
  }

  .wsz-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    gap: 16px;
  }

  .wsz-axes {
    display: none;
  }

  .wsz-axis-label--left,
  .wsz-axis-label--right {
    display: none;
  }

  .wsz-cell {
    min-height: 260px;
    height: auto;
  }
}
</style>
