<script setup lang="ts">
import { computed } from 'vue'
import type { DualTriangleBlock, DualTriangleCenter } from '../../types/canvas'

const props = defineProps<{
  center: DualTriangleCenter
  blocks: DualTriangleBlock[]
}>()

const humanColor = computed(() => props.center.humanColor || '#C4A574')
const aiColor = computed(() => props.center.aiColor || '#5BA8A0')
const arrowColor = computed(() => props.center.arrowColor || '#C75B5B')

function keywordOf(id: string): string {
  return props.blocks.find((b) => b.id === id)?.keyword ?? ''
}
</script>

<template>
  <div class="dt-center">
    <div class="keyword kw-creativity">{{ keywordOf('innovation') }}</div>
    <div class="keyword kw-scenario">{{ keywordOf('scenario') }}</div>
    <div class="keyword kw-aesthetics">{{ keywordOf('aesthetics') }}</div>
    <div class="keyword kw-system">{{ keywordOf('system') }}</div>
    <div class="keyword kw-basics">{{ keywordOf('basics') }}</div>
    <div class="keyword kw-data">{{ keywordOf('data') }}</div>

    <div class="triangle-wrap">
      <svg
        class="triangle-svg"
        viewBox="0 0 320 280"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <!-- left human half -->
        <polygon
          points="160,28 40,248 160,248"
          :fill="humanColor"
          opacity="0.92"
        />
        <!-- right AI half -->
        <polygon
          points="160,28 160,248 280,248"
          :fill="aiColor"
          opacity="0.92"
        />
        <!-- center divider -->
        <line
          x1="160"
          y1="28"
          x2="160"
          y2="248"
          stroke="rgba(255,255,255,0.55)"
          stroke-width="2"
        />

        <!-- dotted connectors to keywords -->
        <g
          stroke="#9aa0a6"
          stroke-width="1.2"
          stroke-dasharray="3 3"
          fill="none"
          opacity="0.7"
        >
          <line x1="100" y1="90" x2="48" y2="52" />
          <line x1="220" y1="90" x2="272" y2="52" />
          <line x1="70" y1="220" x2="36" y2="250" />
          <line x1="120" y1="248" x2="100" y2="268" />
          <line x1="200" y1="248" x2="220" y2="268" />
          <line x1="250" y1="220" x2="284" y2="250" />
        </g>

        <!-- top curved arrow: human -> AI -->
        <path
          d="M 95 55 C 120 18, 200 18, 225 55"
          :stroke="arrowColor"
          stroke-width="2.4"
          fill="none"
          marker-end="url(#arrowHead)"
        />
        <!-- bottom curved arrow: AI -> human -->
        <path
          d="M 225 255 C 200 292, 120 292, 95 255"
          :stroke="arrowColor"
          stroke-width="2.4"
          fill="none"
          marker-end="url(#arrowHead)"
        />

        <defs>
          <marker
            id="arrowHead"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" :fill="arrowColor" />
          </marker>
        </defs>
      </svg>

      <div class="labels">
        <div class="label-human">
          <div class="label-title">{{ center.humanTitle }}</div>
          <div class="label-sub">{{ center.humanSubtitle }}</div>
        </div>
        <div class="label-x">×</div>
        <div class="label-ai">
          <div class="label-title">{{ center.aiTitle }}</div>
          <div class="label-sub">{{ center.aiSubtitle }}</div>
        </div>
      </div>

      <div class="arrow-text top-arrow" :style="{ color: arrowColor }">
        {{ center.topArrowText }}
      </div>
      <div class="arrow-text bottom-arrow" :style="{ color: arrowColor }">
        {{ center.bottomArrowText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.dt-center {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.triangle-wrap {
  position: relative;
  width: min(100%, 360px);
  aspect-ratio: 320 / 280;
  max-height: 100%;
}

.triangle-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.labels {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  pointer-events: none;
  padding: 18% 14% 22%;
  box-sizing: border-box;
}

.label-human,
.label-ai {
  text-align: center;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.label-title {
  font-size: clamp(13px, 2.2vw, 18px);
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.label-sub {
  margin-top: 4px;
  font-size: clamp(10px, 1.4vw, 12px);
  font-weight: 500;
  opacity: 0.95;
  line-height: 1.3;
}

.label-x {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  padding: 0 2px;
  align-self: center;
}

.arrow-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(10px, 1.3vw, 12px);
  font-weight: 650;
  white-space: nowrap;
  pointer-events: none;
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.85);
}

.top-arrow {
  top: 2%;
}

.bottom-arrow {
  bottom: 1%;
}

.keyword {
  position: absolute;
  font-size: clamp(11px, 1.5vw, 13px);
  font-weight: 650;
  color: #5f6368;
  pointer-events: none;
  z-index: 2;
  white-space: nowrap;
}

.kw-creativity {
  top: 6%;
  left: 4%;
  color: #B8956A;
}

.kw-scenario {
  top: 6%;
  right: 4%;
  color: #4A9B94;
}

.kw-aesthetics {
  bottom: 14%;
  left: 2%;
  color: #B8956A;
}

.kw-system {
  bottom: 2%;
  left: 28%;
  color: #B8956A;
}

.kw-basics {
  bottom: 2%;
  right: 28%;
  color: #4A9B94;
}

.kw-data {
  bottom: 14%;
  right: 2%;
  color: #4A9B94;
}
</style>
