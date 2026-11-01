<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  DecisionTriangleBlock,
  DecisionTriangleBlockId,
  DecisionTriangleDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneAt, toneVars } from './fiveStepPalette'

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

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

/** 宽度金 / 高度铜 / 深度青，与 fiveStepPalette 同色相 */
const WIDTH_TONE = 1
const HEIGHT_TONE = 2
const DEPTH_TONE = 0
</script>

<template>
  <div
    class="dec-canvas"
    :style="chrome"
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
          :fill="toneAt(WIDTH_TONE).header"
          filter="url(#dec-shadow)"
        />
        <!-- 右：高度（橙） -->
        <polygon
          points="580,120 920,120 920,520 800,520 640,280"
          :fill="toneAt(HEIGHT_TONE).header"
          filter="url(#dec-shadow)"
        />
        <!-- 底：深度（青） -->
        <polygon
          points="200,580 800,580 700,780 300,780"
          :fill="toneAt(DEPTH_TONE).header"
          filter="url(#dec-shadow)"
        />
      </svg>

      <!-- 左面板 -->
      <section
        v-if="block('width')"
        class="dec-panel dec-panel--width tbl-tone"
        :style="toneVars(WIDTH_TONE)"
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
        class="dec-panel dec-panel--height tbl-tone"
        :style="toneVars(HEIGHT_TONE)"
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
        class="dec-panel dec-panel--depth tbl-tone"
        :style="toneVars(DEPTH_TONE)"
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
  gap: 0;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 0;
  background: var(--tbl-body, #fbf6e4);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
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
  padding: 8px 10px;
  background: var(--tbl-header, #a67c00);
  color: #fff;
}

.dec-title {
  margin: 0;
  flex-shrink: 0;
  font-size: clamp(22px, 2.6vw, 36px);
  font-weight: 900;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
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
  background: rgba(255, 255, 255, 0.55);
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
  color: rgba(255, 255, 255, 0.94);
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
  margin: 6px;
  background: transparent;
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
