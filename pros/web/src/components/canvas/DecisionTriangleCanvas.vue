<script setup lang="ts">
import { computed } from 'vue'
import type {
  DecisionTriangleBlock,
  DecisionTriangleBlockId,
  DecisionTriangleDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: DecisionTriangleDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<DecisionTriangleBlockId, DecisionTriangleBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: DecisionTriangleBlockId): DecisionTriangleBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#f3f3f3',
)

/** 附图取样色 */
const TONE = {
  yellow: { fill: '#f0a810', title: '#d48900' },
  orange: { fill: '#f89048', title: '#e06a28' },
  teal: { fill: '#30c8a8', title: '#1aa88c' },
} as const
</script>

<template>
  <div
    class="dec-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="科学决策三角形"
  >
    <div class="dec-stage">
      <!-- 中空三角：三色梯形（角部留缝） -->
      <svg
        class="dec-svg"
        viewBox="0 0 1000 860"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <filter id="dec-shadow" x="-8%" y="-8%" width="116%" height="116%">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="5"
              flood-color="#000000"
              flood-opacity="0.14"
            />
          </filter>
        </defs>

        <!-- 左：宽度（黄）梯形 -->
        <polygon
          points="80,120 420,120 360,280 200,520 80,520"
          :fill="TONE.yellow.fill"
          filter="url(#dec-shadow)"
        />
        <!-- 右：高度（橙） -->
        <polygon
          points="580,120 920,120 920,520 800,520 640,280"
          :fill="TONE.orange.fill"
          filter="url(#dec-shadow)"
        />
        <!-- 底：深度（青） -->
        <polygon
          points="200,580 800,580 700,780 300,780"
          :fill="TONE.teal.fill"
          filter="url(#dec-shadow)"
        />
      </svg>

      <!-- 左面板 -->
      <section
        v-if="block('width')"
        class="dec-panel dec-panel--width"
        :style="{ '--title-color': TONE.yellow.title }"
      >
        <div class="dec-head">
          <h2 class="dec-title">{{ block('width')!.title }}</h2>
          <span class="dec-divider" aria-hidden="true" />
          <ul class="dec-hints">
            <li v-for="(h, i) in block('width')!.hints" :key="i">{{ h }}</li>
          </ul>
        </div>
        <div class="dec-body">
          <YModelBlockCard :block="block('width')!" hide-title />
        </div>
      </section>

      <!-- 右面板 -->
      <section
        v-if="block('height')"
        class="dec-panel dec-panel--height"
        :style="{ '--title-color': TONE.orange.title }"
      >
        <div class="dec-head">
          <h2 class="dec-title">{{ block('height')!.title }}</h2>
          <span class="dec-divider" aria-hidden="true" />
          <ul class="dec-hints">
            <li v-for="(h, i) in block('height')!.hints" :key="i">{{ h }}</li>
          </ul>
        </div>
        <div class="dec-body">
          <YModelBlockCard :block="block('height')!" hide-title />
        </div>
      </section>

      <!-- 底面板 -->
      <section
        v-if="block('depth')"
        class="dec-panel dec-panel--depth"
        :style="{ '--title-color': TONE.teal.title }"
      >
        <div class="dec-head">
          <h2 class="dec-title">{{ block('depth')!.title }}</h2>
          <span class="dec-divider" aria-hidden="true" />
          <ul class="dec-hints">
            <li v-for="(h, i) in block('depth')!.hints" :key="i">{{ h }}</li>
          </ul>
        </div>
        <div class="dec-body">
          <YModelBlockCard :block="block('depth')!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dec-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f3f3f3;
  /* 淡斜线底纹，贴近附图 */
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 10px,
    rgba(0, 0, 0, 0.025) 10px,
    rgba(0, 0, 0, 0.025) 11px
  );
}

.dec-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.dec-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.dec-panel {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 10px 12px;
}

.dec-panel--width {
  left: 6%;
  top: 12%;
  width: 34%;
  height: 48%;
}

.dec-panel--height {
  right: 6%;
  top: 12%;
  width: 34%;
  height: 48%;
}

.dec-panel--depth {
  left: 22%;
  right: 22%;
  bottom: 6%;
  width: auto;
  height: 28%;
}

.dec-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-shrink: 0;
}

.dec-title {
  margin: 0;
  flex-shrink: 0;
  font-size: clamp(22px, 2.6vw, 36px);
  font-weight: 900;
  color: var(--title-color);
  letter-spacing: 0.08em;
  line-height: 1.15;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  writing-mode: horizontal-tb;
}

.dec-divider {
  flex-shrink: 0;
  width: 2px;
  align-self: stretch;
  min-height: 2.4em;
  background: rgba(32, 33, 36, 0.35);
  border-radius: 1px;
}

.dec-hints {
  margin: 0;
  padding: 2px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dec-hints li {
  font-size: clamp(12px, 1.2vw, 15px);
  font-weight: 700;
  color: #202124;
  line-height: 1.35;
  letter-spacing: 0.02em;
}

.dec-hints li::before {
  content: '· ';
  font-weight: 900;
}

.dec-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 6px;
  overflow: hidden;
}

.dec-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.dec-body :deep(.ym-block-toolbar) {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.dec-panel:hover :deep(.ym-block-toolbar),
.dec-body :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.dec-body :deep(.ym-block-body),
.dec-body :deep(.ym-rte),
.dec-body :deep(.rte-root),
.dec-body :deep(.ProseMirror) {
  background: transparent !important;
}

@media (max-width: 720px) {
  .dec-canvas {
    overflow: auto;
  }

  .dec-stage {
    min-height: 920px;
  }

  .dec-panel--width,
  .dec-panel--height,
  .dec-panel--depth {
    position: relative;
    left: auto;
    right: auto;
    top: auto;
    bottom: auto;
    width: 100%;
    height: auto;
    min-height: 200px;
    margin-bottom: 12px;
  }

  .dec-svg {
    display: none;
  }
}
</style>
