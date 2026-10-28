<script setup lang="ts">
import { computed } from 'vue'
import type {
  UnitModelQuadrantBlock,
  UnitModelQuadrantBlockId,
  UnitModelQuadrantDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: UnitModelQuadrantDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<UnitModelQuadrantBlockId, UnitModelQuadrantBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: UnitModelQuadrantBlockId): UnitModelQuadrantBlock | undefined {
  return byId.value.get(id)
}

const axes = computed(() => props.doc.axes)
const bgColor = computed(
  () => props.doc.theme.background.color || '#f5efe6',
)

/**
 * 附图色值：
 * A 健康模型 青绿
 * B 总部成本过高 芥末黄
 * C 放弃/调整 红
 * D 不存在 浅橙黄
 */
const TONE_COLOR: Record<string, string> = {
  teal: '#2d9b8a',
  mustard: '#c9a227',
  red: '#c94c4c',
  amber: '#e0a85c',
}

/** CSS 网格顺序：TL b · TR a · BL c · BR d（与附图 id 位置一致） */
const order: UnitModelQuadrantBlockId[] = ['b', 'a', 'c', 'd']
</script>

<template>
  <div
    class="umq-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="单元模型象限"
  >
    <div class="umq-frame">
      <div class="umq-axis-label umq-axis-label--top">
        {{ axes.unitModelLongTerm }}
      </div>
      <div class="umq-axis-label umq-axis-label--left">
        {{ axes.companyAccountInvalid }}
      </div>
      <div class="umq-axis-label umq-axis-label--right">
        {{ axes.companyAccountLongTerm }}
      </div>
      <div class="umq-axis-label umq-axis-label--bottom">
        {{ axes.unitModelInvalid }}
      </div>

      <div class="umq-plot">
        <svg
          class="umq-axes"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="umq-arrow-v"
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
              id="umq-arrow-h"
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
          <!-- 竖轴：底 → 顶（箭头朝「单元模型长期成立」） -->
          <line
            x1="50"
            y1="99.2"
            x2="50"
            y2="1.2"
            stroke="#111111"
            stroke-width="1.8"
            vector-effect="non-scaling-stroke"
            marker-end="url(#umq-arrow-v)"
          />
          <!-- 横轴：左 → 右（箭头朝「公司账长期成立」） -->
          <line
            x1="0.8"
            y1="50"
            x2="98.8"
            y2="50"
            stroke="#111111"
            stroke-width="1.8"
            vector-effect="non-scaling-stroke"
            marker-end="url(#umq-arrow-h)"
          />
        </svg>

        <div class="umq-grid" role="group">
          <template v-for="id in order" :key="id">
            <section
              v-if="block(id)"
              class="umq-cell"
              :data-id="id"
              :data-tone="block(id)!.tone"
            >
              <h2
                class="umq-title"
                :style="{ color: TONE_COLOR[block(id)!.tone] || '#111111' }"
              >
                {{ block(id)!.title }}
              </h2>
              <div class="umq-body">
                <YModelBlockCard :block="block(id)!" hide-title />
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.umq-canvas {
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
  background: #f5efe6;
}

.umq-frame {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
  margin: 0;
  min-height: 0;
  height: 100%;
  padding: 44px 72px 48px 80px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.umq-axis-label {
  position: absolute;
  font-size: clamp(14px, 1.55vw, 22px);
  font-weight: 800;
  color: #111111;
  letter-spacing: 0.06em;
  line-height: 1.2;
  user-select: none;
  pointer-events: none;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  z-index: 4;
  text-align: center;
}

.umq-axis-label--top {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90%;
}

.umq-axis-label--bottom {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90%;
}

.umq-axis-label--left {
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  max-width: 6.5em;
}

.umq-axis-label--right {
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  max-width: 6.5em;
}

.umq-plot {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.umq-axes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
  overflow: visible;
}

.umq-grid {
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

.umq-cell {
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

.umq-title {
  margin: 0;
  flex-shrink: 0;
  text-align: center;
  font-size: clamp(16px, 1.9vw, 26px);
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.35;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  padding-top: clamp(4px, 1vh, 12px);
}

.umq-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
}

.umq-body :deep(.ym-block) {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  overflow: hidden;
}

.umq-body :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.umq-cell:hover :deep(.ym-block-toolbar),
.umq-body :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.umq-body :deep(.ym-block-body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.umq-body :deep(.ym-block-body),
.umq-body :deep(.ym-rte),
.umq-body :deep(.rte-root),
.umq-body :deep(.ProseMirror),
.umq-body :deep([contenteditable='true']) {
  background: transparent !important;
}

.umq-body :deep(.panel-attachments),
.umq-body :deep(.pa-root) {
  opacity: 0.55;
  flex-shrink: 0;
}

.umq-cell:hover :deep(.panel-attachments),
.umq-cell:hover :deep(.pa-root) {
  opacity: 1;
}

@media (max-width: 720px) {
  .umq-canvas {
    overflow: auto;
  }

  .umq-frame {
    padding: 48px 10px 56px;
    min-height: 0;
    height: auto;
  }

  .umq-plot,
  .umq-grid {
    min-height: 0;
    height: auto;
  }

  .umq-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    gap: 16px;
  }

  .umq-axes {
    display: none;
  }

  .umq-axis-label--left,
  .umq-axis-label--right {
    display: none;
  }

  .umq-cell {
    min-height: 260px;
    height: auto;
  }
}
</style>
