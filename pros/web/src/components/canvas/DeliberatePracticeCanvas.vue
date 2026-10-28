<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type {
  DeliberatePracticeBlock,
  DeliberatePracticeBlockId,
  DeliberatePracticeDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: DeliberatePracticeDocumentJSON
}>()

const documentStore = useDocumentStore()

/** Sync before first render so hidden YModelBlock hosts have real ids (v-if). */
documentStore.ensureDeliberatePracticeBlocks()

const BLOCK_ORDER: DeliberatePracticeBlockId[] = [
  'premise',
  'node_a',
  'node_b',
  'node_c',
  'node_d',
]

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

const hostBlocks = computed(() =>
  BLOCK_ORDER.map((id) => ({
    id,
    block: block(id),
  })),
)

const bgColor = computed(
  () => props.doc.theme.background.color || '#f3f4f6',
)

const colorA = computed(() => props.doc.nodes.a.color)
const colorB = computed(() => props.doc.nodes.b.color)
const colorC = computed(() => props.doc.nodes.c.color)
const colorD = computed(() => props.doc.nodes.d.color)

/* ---- 节点 / 前提点击 → 全局 panel-maximize 全屏富文本 ---- */
const activeEditorId = ref<DeliberatePracticeBlockId | null>(null)

const activeMaximizeKey = computed(() => {
  const id = activeEditorId.value
  if (!id) return 'dp:idle'
  const b = block(id)
  return b ? panelMaximizeKey('block', b.id) : 'dp:idle'
})

const { maximizedPanelKey } = usePanelMaximize(activeMaximizeKey)

function openEditor(id: DeliberatePracticeBlockId) {
  documentStore.ensureDeliberatePracticeBlocks()
  const b = block(id)
  if (!b) return
  activeEditorId.value = id
  const key = panelMaximizeKey('block', b.id)
  nextTick(() => {
    maximizedPanelKey.value = key
  })
}

function onNodeActivate(id: DeliberatePracticeBlockId, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  openEditor(id)
}

watch(maximizedPanelKey, (key) => {
  if (!key && activeEditorId.value) {
    activeEditorId.value = null
  }
})

onMounted(() => {
  documentStore.ensureDeliberatePracticeBlocks()
})

onBeforeUnmount(() => {
  if (
    activeEditorId.value &&
    maximizedPanelKey.value === activeMaximizeKey.value
  ) {
    maximizedPanelKey.value = null
  }
})
</script>

<template>
  <div class="dp-canvas" :style="{ backgroundColor: bgColor }" aria-label="刻意练习画布">
    <!-- 顶部前提区：标题 + 刻意标签（无内联编辑器） -->
    <header class="dp-premise">
      <div
        class="premise-row premise-row--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${doc.labels.premiseTitle}`"
        @click="onNodeActivate('premise', $event)"
        @keydown.enter.prevent="openEditor('premise')"
        @keydown.space.prevent="openEditor('premise')"
      >
        <h2 class="premise-title">{{ doc.labels.premiseTitle }}</h2>
        <div class="premise-chrome" :style="{ borderColor: '#F99D1C' }" aria-hidden="true">
          <span class="premise-hint">点击编辑前提要点</span>
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
      Grid layout — stage shows diagram + titles only:
        row1: A A A | tag
        row2: C mid B | tag
    -->
    <div class="dp-triangle-area">
      <!-- A: top -->
      <section
        class="dp-panel panel-a dp-panel--clickable"
        :style="{ '--accent': colorA }"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${doc.nodes.a.title}`"
        @click="onNodeActivate('node_a', $event)"
        @keydown.enter.prevent="openEditor('node_a')"
        @keydown.space.prevent="openEditor('node_a')"
      >
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
      </section>

      <!-- C: left -->
      <section
        class="dp-panel panel-c dp-panel--clickable"
        :style="{ '--accent': colorC }"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${doc.nodes.c.title}`"
        @click="onNodeActivate('node_c', $event)"
        @keydown.enter.prevent="openEditor('node_c')"
        @keydown.space.prevent="openEditor('node_c')"
      >
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
      </section>

      <!-- Mid: SVG triangle + D title/subtitle -->
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
          <circle cx="320" cy="56" r="14" :fill="colorA" stroke="#fff" stroke-width="3" />
          <circle cx="548" cy="430" r="14" :fill="colorB" stroke="#fff" stroke-width="3" />
          <circle cx="92" cy="430" r="14" :fill="colorC" stroke="#fff" stroke-width="3" />
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

        <div
          class="dp-d dp-d--clickable"
          role="button"
          tabindex="0"
          :aria-label="`最大化编辑${doc.nodes.d.title}`"
          @click="onNodeActivate('node_d', $event)"
          @keydown.enter.prevent="openEditor('node_d')"
          @keydown.space.prevent="openEditor('node_d')"
        >
          <h3 class="d-title" :style="{ color: colorD }">
            {{ doc.nodes.d.title }}
          </h3>
          <p class="d-subtitle" :style="{ color: colorD }">
            {{ doc.nodes.d.subtitle }}
          </p>
        </div>
      </div>

      <!-- B: right -->
      <section
        class="dp-panel panel-b dp-panel--clickable"
        :style="{ '--accent': colorB }"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${doc.nodes.b.title}`"
        @click="onNodeActivate('node_b', $event)"
        @keydown.enter.prevent="openEditor('node_b')"
        @keydown.space.prevent="openEditor('node_b')"
      >
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
      </section>

      <div class="side-tag practice-tag">
        {{ doc.labels.practiceHasMethod }}
      </div>
    </div>

    <!--
      隐藏挂载五块 YModelBlock：点击节点/前提时写入全局 maximizedPanelKey，
      由块内 Teleport .pm-overlay 铺满文档视口（panel-maximize 规则）。
      必须用 v-if（非 v-show），避免空 id 挂载崩溃。
    -->
    <div class="dp-block-host" aria-hidden="true">
      <template v-for="item in hostBlocks" :key="item.id">
        <YModelBlockCard
          v-if="item.block"
          :block="item.block"
          hide-title
        />
      </template>
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
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
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

.premise-row--clickable {
  cursor: pointer;
  outline: none;
  border-radius: 10px;
  padding: 4px 6px;
  margin: -4px -6px;
  transition: background 0.15s ease;
}

.premise-row--clickable:hover {
  background: rgba(249, 157, 28, 0.08);
}

.premise-row--clickable:focus-visible {
  box-shadow: 0 0 0 2px rgba(249, 157, 28, 0.35);
}

.premise-row--clickable:hover .premise-title {
  text-decoration: underline;
  text-underline-offset: 4px;
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

.premise-chrome {
  min-width: 0;
  min-height: 52px;
  height: 100%;
  border-left: 3px solid #f99d1c;
  padding-left: 12px;
  display: flex;
  align-items: center;
  border-radius: 0 8px 8px 0;
  background: rgba(255, 255, 255, 0.45);
}

.premise-hint {
  font-size: 13px;
  font-weight: 600;
  color: #80868b;
  letter-spacing: 0.02em;
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
  pointer-events: none;
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

.dp-triangle-area {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(280px, 1.5fr) minmax(160px, 1fr) auto;
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
}

.panel-c {
  grid-area: c;
  align-self: start;
}

.panel-b {
  grid-area: b;
  align-self: start;
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

.dp-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  box-sizing: border-box;
}

.dp-panel--clickable {
  cursor: pointer;
  outline: none;
  border-radius: 12px;
  padding: 8px 10px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.dp-panel--clickable:hover {
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.dp-panel--clickable:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.dp-panel--clickable:hover .panel-title {
  text-decoration: underline;
  text-underline-offset: 3px;
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

.dp-cycle-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.dp-d {
  position: relative;
  z-index: 1;
  width: min(200px, 58%);
  max-width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  margin-top: -4%;
  pointer-events: auto;
  padding: 16px 12px;
  border-radius: 16px;
  box-sizing: border-box;
}

.dp-d--clickable {
  cursor: pointer;
  outline: none;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.dp-d--clickable:hover {
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 2px rgba(0, 166, 133, 0.28);
}

.dp-d--clickable:focus-visible {
  box-shadow: 0 0 0 2px rgba(0, 166, 133, 0.45);
}

.dp-d--clickable:hover .d-title {
  text-decoration: underline;
  text-underline-offset: 3px;
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

.dp-block-host {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  padding: 0;
  margin: -1px;
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

  .practice-tag {
    justify-self: start;
  }
}
</style>
