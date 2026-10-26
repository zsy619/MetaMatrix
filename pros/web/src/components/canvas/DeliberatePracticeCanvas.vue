<script setup lang="ts">
import { computed } from 'vue'
import type {
  DeliberatePracticeBlock,
  DeliberatePracticeBlockId,
  DeliberatePracticeDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: DeliberatePracticeDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<DeliberatePracticeBlockId, DeliberatePracticeBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: DeliberatePracticeBlockId): DeliberatePracticeBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#f3f4f6',
)

const colorA = computed(() => props.doc.nodes.a.color)
const colorB = computed(() => props.doc.nodes.b.color)
const colorC = computed(() => props.doc.nodes.c.color)
const colorD = computed(() => props.doc.nodes.d.color)
</script>

<template>
  <div class="dp-canvas" :style="{ backgroundColor: bgColor }">
    <!-- 顶部前提区：标题 | 橙条+三点 | 刻意标签 -->
    <header class="dp-premise">
      <div class="premise-row">
        <h2 class="premise-title">{{ doc.labels.premiseTitle }}</h2>
        <div class="premise-list" :style="{ borderColor: '#F99D1C' }">
          <YModelBlockCard
            v-if="block('premise')"
            :block="block('premise')!"
            hide-title
            compact
          />
        </div>
        <div class="side-tag deliberate-tag">
          {{ doc.labels.deliberateIsPremise }}
        </div>
      </div>
    </header>

    <!-- 提炼 / 提高 桥接 -->
    <div class="dp-bridge" aria-hidden="true">
      <div class="bridge-line" />
      <div class="bridge-arrows">
        <div class="bridge-col">
          <span class="bridge-label">{{ doc.labels.extractDown }}</span>
          <span class="bridge-arrow">↓</span>
        </div>
        <div class="bridge-col">
          <span class="bridge-arrow">↑</span>
          <span class="bridge-label">{{ doc.labels.improveUp }}</span>
        </div>
      </div>
    </div>

    <!--
      Grid layout — panels OUTSIDE the SVG (no absolute overlays on triangle):
        row1: A A A | tag
        row2: C mid B | tag
    -->
    <div class="dp-triangle-area">
      <!-- A: top row spanning side+mid columns -->
      <section class="dp-panel panel-a" :style="{ '--accent': colorA }">
        <div class="panel-header">
          <div class="panel-badge" :style="{ background: colorA }">
            <svg viewBox="0 0 24 24" class="badge-icon" aria-hidden="true">
              <path d="M12 3 L21 19 H3 Z" fill="currentColor" />
            </svg>
          </div>
          <h3 class="panel-title" :style="{ color: colorA }">
            {{ doc.nodes.a.title }}
          </h3>
        </div>
        <div class="panel-body" :style="{ borderColor: colorA }">
          <YModelBlockCard
            v-if="block('node_a')"
            :block="block('node_a')!"
            hide-title
          />
        </div>
      </section>

      <!-- C: left column -->
      <section class="dp-panel panel-c" :style="{ '--accent': colorC }">
        <div class="panel-header">
          <div class="panel-badge" :style="{ background: colorC }">
            <svg viewBox="0 0 24 24" class="badge-icon" aria-hidden="true">
              <path d="M12 3 L21 19 H3 Z" fill="currentColor" />
            </svg>
          </div>
          <h3 class="panel-title" :style="{ color: colorC }">
            {{ doc.nodes.c.title }}
          </h3>
        </div>
        <div class="panel-body" :style="{ borderColor: colorC }">
          <YModelBlockCard
            v-if="block('node_c')"
            :block="block('node_c')!"
            hide-title
          />
        </div>
      </section>

      <!-- Mid: clean SVG triangle + D only (no A/B/C text panels) -->
      <div class="dp-mid">
        <svg
          class="dp-cycle-svg"
          viewBox="0 0 640 520"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="dpArrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L9,3 L0,6 Z" fill="#9aa0a6" />
            </marker>
          </defs>
          <polygon
            points="320,56 548,430 92,430"
            fill="rgba(200,204,210,0.18)"
            stroke="#c5c9ce"
            stroke-width="9"
            stroke-linejoin="round"
          />
          <path
            d="M360 95 C 470 155, 510 270, 510 355"
            fill="none"
            stroke="#9aa0a6"
            stroke-width="3.5"
            marker-end="url(#dpArrow)"
          />
          <path
            d="M470 420 C 360 455, 280 455, 170 420"
            fill="none"
            stroke="#9aa0a6"
            stroke-width="3.5"
            marker-end="url(#dpArrow)"
          />
          <path
            d="M130 355 C 130 270, 170 155, 280 95"
            fill="none"
            stroke="#9aa0a6"
            stroke-width="3.5"
            marker-end="url(#dpArrow)"
          />
          <!-- Decorative vertex pins only (no panels) -->
          <circle cx="320" cy="56" r="14" :fill="colorA" stroke="#fff" stroke-width="3" />
          <circle cx="548" cy="430" r="14" :fill="colorB" stroke="#fff" stroke-width="3" />
          <circle cx="92" cy="430" r="14" :fill="colorC" stroke="#fff" stroke-width="3" />
          <!-- D dashed ring — only ring -->
          <circle
            cx="320"
            cy="285"
            r="88"
            fill="none"
            stroke="#00A685"
            stroke-width="2"
            stroke-dasharray="5 4"
            opacity="0.55"
          />
        </svg>

        <!-- D: centered in dashed circle; one compact editor, no CSS dashed ring -->
        <div class="dp-d">
          <h3 class="d-title" :style="{ color: colorD }">
            {{ doc.nodes.d.title }}
          </h3>
          <p class="d-subtitle" :style="{ color: colorD }">
            {{ doc.nodes.d.subtitle }}
          </p>
          <div class="d-editor">
            <YModelBlockCard
              v-if="block('node_d')"
              :block="block('node_d')!"
              hide-title
              compact
            />
          </div>
        </div>
      </div>

      <!-- B: right column -->
      <section class="dp-panel panel-b" :style="{ '--accent': colorB }">
        <div class="panel-header">
          <div class="panel-badge" :style="{ background: colorB }">
            <svg viewBox="0 0 24 24" class="badge-icon" aria-hidden="true">
              <path d="M12 3 L21 19 H3 Z" fill="currentColor" />
            </svg>
          </div>
          <h3 class="panel-title" :style="{ color: colorB }">
            {{ doc.nodes.b.title }}
          </h3>
        </div>
        <div class="panel-body" :style="{ borderColor: colorB }">
          <YModelBlockCard
            v-if="block('node_b')"
            :block="block('node_b')!"
            hide-title
          />
        </div>
      </section>

      <div class="side-tag practice-tag">
        {{ doc.labels.practiceHasMethod }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.dp-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 14px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}

.dp-premise {
  flex-shrink: 0;
  padding: 2px 2px 6px;
}

.premise-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px 18px;
  align-items: stretch;
}

.premise-title {
  margin: 0;
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 800;
  color: #f99d1c;
  letter-spacing: 0.02em;
  white-space: nowrap;
  line-height: 1.2;
  align-self: center;
}

.premise-list {
  min-width: 0;
  min-height: 88px;
  height: 100%;
  border-left: 3px solid #f99d1c;
  padding-left: 10px;
  display: flex;
  flex-direction: column;
}

.premise-list :deep(.ym-block) {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.55);
  min-height: 80px;
  height: 100%;
  flex: 1;
}

.side-tag {
  background: #4a4f55;
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  padding: 8px 14px;
  border-radius: 8px;
  white-space: nowrap;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  line-height: 1.3;
  align-self: center;
}

.deliberate-tag {
  justify-self: end;
}

.dp-bridge {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 2px 0 6px;
}

.bridge-line {
  width: min(68%, 480px);
  border-top: 1.5px dashed #b0b4b8;
}

.bridge-arrows {
  display: flex;
  gap: 36px;
  margin-top: 2px;
}

.bridge-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  color: #5f6368;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.15;
}

.bridge-arrow {
  font-size: 15px;
  color: #80868b;
}

/* ===== Triangle area: CSS grid — panels never overlay SVG ===== */
.dp-triangle-area {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(200px, 1.05fr) minmax(280px, 1.4fr) minmax(200px, 1.05fr) auto;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'a a a tag'
    'c mid b tag';
  gap: 12px 14px;
  align-items: stretch;
  box-sizing: border-box;
}

.panel-a {
  grid-area: a;
  min-height: 120px;
}

.panel-c {
  grid-area: c;
  min-height: 0;
}

.panel-b {
  grid-area: b;
  min-height: 0;
}

.dp-mid {
  grid-area: mid;
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.practice-tag {
  grid-area: tag;
  align-self: center;
  writing-mode: horizontal-tb;
}

/* Side / top editable panels */
.dp-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.panel-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.9);
}

.badge-icon {
  width: 16px;
  height: 16px;
}

.panel-title {
  margin: 0;
  font-size: clamp(14px, 1.8vw, 18px);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.panel-body {
  border-left: 3px solid;
  padding-left: 8px;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.panel-body :deep(.ym-block),
.premise-list :deep(.ym-block) {
  height: 100%;
  flex: 1;
  background: rgba(255, 255, 255, 0.78);
}

.panel-a .panel-body :deep(.ym-block) {
  min-height: 88px;
}

.panel-c .panel-body :deep(.ym-block),
.panel-b .panel-body :deep(.ym-block) {
  min-height: 160px;
}

.premise-list :deep(.ym-block) {
  min-height: 80px;
  background: rgba(255, 255, 255, 0.55);
}

/* Mid SVG — decorative only */
.dp-cycle-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

/* D sits in center of mid; sized to fit inside dashed circle */
.dp-d {
  position: relative;
  z-index: 1;
  width: min(200px, 58%);
  max-width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  /* Keep away from triangle base / side panels */
  margin-top: -4%;
  pointer-events: auto;
}

.d-title {
  margin: 0;
  font-size: clamp(14px, 1.8vw, 18px);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.2;
  flex-shrink: 0;
}

.d-subtitle {
  margin: 0;
  font-size: clamp(11px, 1.3vw, 13px);
  font-weight: 650;
  flex-shrink: 0;
  line-height: 1.25;
}

.d-editor {
  width: 100%;
  margin-top: 4px;
  text-align: left;
  display: flex;
  flex-direction: column;
  min-height: 72px;
  max-height: 100px;
}

/* One editor only — no second dashed ring in CSS */
.d-editor :deep(.ym-block) {
  min-height: 72px;
  max-height: 100px;
  height: 100%;
  flex: 1;
  background: rgba(255, 255, 255, 0.88);
  border-style: solid;
  border-color: rgba(0, 166, 133, 0.25);
}

@media (max-width: 900px) {
  .dp-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .premise-row {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .deliberate-tag {
    justify-self: start;
  }

  .dp-triangle-area {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto auto;
    grid-template-areas:
      'a a'
      'mid mid'
      'c b'
      'tag tag';
    gap: 12px 10px;
    min-height: 0;
  }

  .dp-mid {
    min-height: 280px;
  }

  .panel-c .panel-body :deep(.ym-block),
  .panel-b .panel-body :deep(.ym-block) {
    min-height: 120px;
  }

  .practice-tag {
    justify-self: start;
  }
}
</style>
