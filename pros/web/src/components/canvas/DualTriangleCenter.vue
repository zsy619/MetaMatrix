<script setup lang="ts">
import { computed, useId } from 'vue'
import type { DualTriangleBlock, DualTriangleCenter } from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'

const props = defineProps<{
  center: DualTriangleCenter
  blocks: DualTriangleBlock[]
}>()

const emit = defineEmits<{
  hover: [id: string | null]
}>()

const selection = useSelectionStore()

const humanColor = computed(() => props.center.humanColor || '#F2D27A')
const aiColor = computed(() => props.center.aiColor || '#7DCFC4')
const arrowColor = computed(() => props.center.arrowColor || '#E25B52')

const markerId = `dt-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

const HUMAN_ACCENT = '#C9A14A'
const AI_ACCENT = '#3A9E96'

function keywordOf(id: string): string {
  return props.blocks.find((b) => b.id === id)?.keyword ?? ''
}

function accentOf(id: string, fallback: string): string {
  return props.blocks.find((b) => b.id === id)?.accentColor || fallback
}

const keywords = computed(() => [
  {
    id: 'innovation',
    label: keywordOf('innovation') || '创造力',
    cls: 'kw-creativity',
    color: accentOf('innovation', HUMAN_ACCENT),
  },
  {
    id: 'scenario',
    label: keywordOf('scenario') || '场景',
    cls: 'kw-scenario',
    color: accentOf('scenario', AI_ACCENT),
  },
  {
    id: 'aesthetics',
    label: keywordOf('aesthetics') || '审美',
    cls: 'kw-aesthetics',
    color: accentOf('aesthetics', HUMAN_ACCENT),
  },
  {
    id: 'system',
    label: keywordOf('system') || '体系',
    cls: 'kw-system',
    color: accentOf('system', HUMAN_ACCENT),
  },
  {
    id: 'basics',
    label: keywordOf('basics') || '基本功',
    cls: 'kw-basics',
    color: accentOf('basics', AI_ACCENT),
  },
  {
    id: 'data',
    label: keywordOf('data') || '数据',
    cls: 'kw-data',
    color: accentOf('data', AI_ACCENT),
  },
])

function isActive(id: string): boolean {
  return selection.blockId === id
}

function onKeyword(id: string) {
  selection.selectBlock(id)
  emit('hover', id)
  requestAnimationFrame(() => {
    const el = document.querySelector(
      `[data-dt-card="${id}"] .ProseMirror`,
    ) as HTMLElement | null
    el?.focus()
  })
}
</script>

<template>
  <div class="dt-center">
    <div class="tri-stage">
      <svg
        class="tri-svg"
        viewBox="0 0 600 520"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <polygon points="300,10 18,506 300,506" :fill="humanColor" />
        <polygon points="300,10 300,506 582,506" :fill="aiColor" />
        <line
          x1="300"
          y1="10"
          x2="300"
          y2="506"
          stroke="rgba(255,255,255,0.55)"
          stroke-width="1.25"
        />
        <polygon
          points="300,10 18,506 582,506"
          fill="none"
          stroke="#d5d5d5"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>

      <div class="tri-copy">
        <p class="cap">{{ center.topArrowText }}</p>
        <svg class="arc" viewBox="0 0 240 26" aria-hidden="true">
          <defs>
            <marker
              :id="markerId"
              markerUnits="userSpaceOnUse"
              markerWidth="11"
              markerHeight="11"
              refX="9.5"
              refY="5.5"
              orient="auto"
            >
              <path d="M0,0.6 L10.5,5.5 L0,10.4 Z" :fill="arrowColor" />
            </marker>
          </defs>
          <path
            d="M6 18 C 62 3, 178 3, 226 13"
            fill="none"
            :stroke="arrowColor"
            stroke-width="2.2"
            stroke-linecap="round"
            :marker-end="`url(#${markerId})`"
          />
        </svg>

        <div class="title-row">
          <div class="side">
            <div class="main">{{ center.humanTitle }}</div>
            <div class="sub">{{ center.humanSubtitle }}</div>
          </div>
          <div class="times" aria-hidden="true">×</div>
          <div class="side">
            <div class="main">{{ center.aiTitle }}</div>
            <div class="sub">{{ center.aiSubtitle }}</div>
          </div>
        </div>

        <svg class="arc" viewBox="0 0 240 26" aria-hidden="true">
          <path
            d="M226 8 C 178 23, 62 23, 6 13"
            fill="none"
            :stroke="arrowColor"
            stroke-width="2.2"
            stroke-linecap="round"
            :marker-end="`url(#${markerId})`"
          />
        </svg>
        <p class="cap">{{ center.bottomArrowText }}</p>
      </div>
    </div>

    <button
      v-for="kw in keywords"
      :key="kw.id"
      type="button"
      class="kw"
      :class="[kw.cls, { 'is-active': isActive(kw.id) }]"
      :style="{ color: kw.color }"
      :data-dt-kw="kw.id"
      :aria-pressed="isActive(kw.id)"
      :title="`编辑「${kw.label}」`"
      @click="onKeyword(kw.id)"
      @mouseenter="emit('hover', kw.id)"
      @mouseleave="emit('hover', null)"
      @focus="emit('hover', kw.id)"
      @blur="emit('hover', null)"
    >
      {{ kw.label }}
    </button>
  </div>
</template>

<style scoped>
.dt-center {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  container-type: size;
}

.tri-stage {
  position: absolute;
  left: 11%;
  right: 11%;
  top: 0;
  bottom: 18%;
  container-type: size;
}

.tri-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.tri-copy {
  position: absolute;
  left: 50%;
  top: 62%;
  transform: translate(-50%, -50%);
  width: min(86%, 440px);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  text-align: center;
}

.cap {
  margin: 0;
  color: v-bind(arrowColor);
  font-size: clamp(10px, 3.15cqw, 13px);
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.arc {
  width: min(92%, 250px);
  height: 18px;
  display: block;
  overflow: visible;
  margin: 1px 0;
}

.title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  column-gap: clamp(6px, 1.6cqw, 14px);
  width: 100%;
  margin: 2px 0 1px;
  color: #1a1a1a;
}

.side {
  min-width: 0;
  text-align: center;
}

.main {
  font-size: clamp(14px, 5.4cqw, 22px);
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.15;
  color: #161616;
}

.sub {
  margin-top: 3px;
  font-size: clamp(10px, 3cqw, 13px);
  font-weight: 500;
  line-height: 1.3;
  color: #5e646a;
  white-space: nowrap;
}

.times {
  font-size: clamp(15px, 5cqw, 22px);
  font-weight: 700;
  line-height: 1.15;
  color: #1a1a1a;
  padding-top: 0;
}

.kw {
  position: absolute;
  z-index: 2;
  margin: 0;
  padding: 2px 4px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: clamp(13px, 8cqh, 16px);
  font-weight: 750;
  letter-spacing: 0.08em;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 4px;
}

.kw:hover,
.kw.is-active,
.kw:focus-visible {
  background: color-mix(in srgb, currentColor 12%, transparent);
  outline: none;
}

.kw-creativity {
  top: 7%;
  left: 0;
}

.kw-scenario {
  top: 7%;
  right: 0;
}

.kw-aesthetics {
  left: 0;
  bottom: 20%;
}

.kw-data {
  right: 0;
  bottom: 20%;
}

.kw-system {
  left: 25%;
  bottom: 12%;
  transform: translateX(-50%);
}

.kw-basics {
  left: 75%;
  bottom: 12%;
  transform: translateX(-50%);
}
</style>
