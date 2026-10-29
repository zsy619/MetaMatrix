<script setup lang="ts">
import { computed } from 'vue'
import type {
  WorkStateZonesBlock,
  WorkStateZonesBlockId,
  WorkStateZonesDocumentJSON,
} from '../../types/canvas'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import { useSelectionStore } from '../../stores/selection'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: WorkStateZonesDocumentJSON
}>()

const selection = useSelectionStore()

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

/**
 * 交互与 time-matrix 同构：格内 YModelBlock 直编 RTE；
 * 点击象限标题区 → 写入全局 maximizedPanelKey，由块内 Teleport .pm-overlay
 * 铺满文档视口（GLOBAL_RULES/panel-maximize）。
 */
const { maximizedPanelKey } = usePanelMaximize('wsz:idle')

function onOpenQuadrant(id: WorkStateZonesBlockId, event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  const b = block(id)
  if (!b) return
  selection.selectBlock(b.id)
  maximizedPanelKey.value = panelMaximizeKey('block', b.id)
}
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
              markerWidth="9"
              markerHeight="9"
              orient="auto"
            >
              <path d="M 0 1 L 11 6 L 0 11 z" fill="#b85654" />
            </marker>
            <marker
              id="wsz-arrow-h"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="9"
              markerHeight="9"
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
            stroke-width="2.6"
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
            stroke-width="2.6"
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
            <div
              class="wsz-header"
              role="button"
              tabindex="0"
              :aria-label="`最大化编辑 ${block(id)!.title}`"
              @click="onOpenQuadrant(id, $event)"
              @keydown.enter.prevent="onOpenQuadrant(id, $event)"
              @keydown.space.prevent="onOpenQuadrant(id, $event)"
            >
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
  /* 轴标签留白：双行轴字仍可读，贴 time-matrix 撑满感 */
  padding: 40px 56px 44px 60px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.wsz-axis-label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  user-select: none;
  pointer-events: none;
  z-index: 4;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

/* 轴标签层级对齐 time-matrix 主字：加粗 + 字距；副标题弱化 */
.wsz-axis-main {
  font-size: clamp(16px, 1.85vw, 24px);
  font-weight: 800;
  color: #111111;
  letter-spacing: 0.12em;
  line-height: 1.15;
}

.wsz-axis-sub {
  font-size: clamp(11px, 1.05vw, 13px);
  font-weight: 500;
  color: #9aa0a6;
  letter-spacing: 0.04em;
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
  /* 与 time-matrix / star-quadrant 一致：四格贴满象限、边到边 */
  gap: 0;
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
  width: 100%;
  height: 100%;
  border-radius: 0;
  /* 贴 time-matrix：面板本体占满格子，内边距仅保标题可读 */
  padding: 8px 10px 8px;
  box-sizing: border-box;
  gap: 6px;
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
  gap: 4px;
  padding-top: 0;
  cursor: pointer;
  border-radius: 10px;
  outline: none;
  transition: background-color 0.15s ease;
}

.wsz-header:hover {
  background-color: rgba(184, 86, 84, 0.04);
}

.wsz-header:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(184, 86, 84, 0.45);
}

.wsz-badge {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 16px;
  border-radius: 8px;
  font-size: clamp(15px, 1.85vw, 22px);
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.06em;
  line-height: 1.3;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
  border: none;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  pointer-events: none;
}

.wsz-desc {
  margin: 0;
  text-align: center;
  font-size: clamp(13px, 1.4vw, 17px);
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  /* 浅色描述字在白底上更易辨：轻描边 */
  -webkit-text-stroke: 0.2px currentColor;
  paint-order: stroke fill;
  pointer-events: none;
}

.wsz-body {
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

/* 与 TimeMatrixCanvas 同构：撑满格子的 RTE 链 */
.wsz-body :deep(.ym-block) {
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

.wsz-body :deep(.ym-rte),
.wsz-body :deep(.rte-root) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.wsz-body :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  padding: 0;
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
  /* 收紧 RTE 链边距，避免格内大块空白 */
  padding: 2px 4px 4px;
  scrollbar-gutter: auto;
}


.wsz-body :deep(.ym-block.empty:not(.compact)),
.wsz-body :deep(.ym-block.compact.empty) {
  min-height: 0;
}

.wsz-body :deep(.ym-block-empty) {
  padding: 4px 2px;
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
    overflow: auto; /* 窄屏允许画布内滚动，仍避免撑破外层页面 */
  }

  .wsz-frame {
    padding: 44px 10px 48px;
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
