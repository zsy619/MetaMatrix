<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { canvasChromeStyle } from './canvasChrome'
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

/** 图上静态小要点（与附图一致；非独立编辑器，RTE 内容另存于 blocks） */
const STATIC_BULLETS = {
  premise: ['保持渴望', '提高动力', '提升专注'],
  a: ['稳定范式', '稳定发挥', '借假修真'],
  b: ['避免无脑', '能力拉满', '持续进步'],
  c: ['理解差距', '纠正偏差', '加速练习'],
} as const

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

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const colorA = computed(() => props.doc.nodes.a.color || '#2A649F')
const colorB = computed(() => props.doc.nodes.b.color || '#0E8A84')
const colorC = computed(() => props.doc.nodes.c.color || '#A67C00')
const colorD = computed(() => props.doc.nodes.d.color || '#187A4E')

/* ---- 三角几何（对齐 pm-solution-triangle 的极坐标思路） ---- */
const VB_W = 1000
const VB_H = 640
const CX = 500
const CY = 348
const R = 262

function polar(i: number, r: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

const [ax, ay] = polar(0, R)
const [bx, by] = polar(1, R)
const [cx, cy] = polar(2, R)

const trianglePoints = `${ax},${ay} ${bx},${by} ${cx},${cy}`

/** 顶点外柔光圆半径 */
const HALO_R = 48
/** 彩色三角徽章尺寸 */
const TRI_R = 24

function roundedTriPath(x: number, y: number, size: number): string {
  // 圆角正立三角，顶点朝上
  const h = size * 1.15
  const topX = x
  const topY = y - h * 0.62
  const blX = x - size * 0.62
  const blY = y + h * 0.42
  const brX = x + size * 0.62
  const brY = y + h * 0.42
  return `M ${topX} ${topY} L ${brX} ${brY} L ${blX} ${blY} Z`
}

const vertexNodes = computed(() => [
  {
    id: 'node_a' as const,
    key: 'a',
    x: ax,
    y: ay,
    color: colorA.value,
    title: props.doc.nodes.a.title,
    bullets: STATIC_BULLETS.a,
    /** 标题在圆下方居中，要点在右侧（附图） */
    labelSide: 'under' as const,
    titleX: ax,
    titleY: ay + HALO_R + 22,
    bulletX: ax + HALO_R + 16,
    bulletY: ay - 14,
    anchor: 'middle' as const,
    bulletAnchor: 'start' as const,
  },
  {
    id: 'node_b' as const,
    key: 'b',
    x: bx,
    y: by,
    color: colorB.value,
    title: props.doc.nodes.b.title,
    bullets: STATIC_BULLETS.b,
    labelSide: 'right' as const,
    titleX: bx + HALO_R + 10,
    titleY: by - 18,
    bulletX: bx + HALO_R + 10,
    bulletY: by + 6,
    anchor: 'start' as const,
    bulletAnchor: 'start' as const,
  },
  {
    id: 'node_c' as const,
    key: 'c',
    x: cx,
    y: cy,
    color: colorC.value,
    title: props.doc.nodes.c.title,
    bullets: STATIC_BULLETS.c,
    labelSide: 'left' as const,
    titleX: cx - HALO_R - 10,
    titleY: cy - 18,
    bulletX: cx - HALO_R - 10,
    bulletY: cy + 6,
    anchor: 'end' as const,
    bulletAnchor: 'end' as const,
  },
])

/**
 * 空心粗箭头：沿三角外侧弧带，仿附图大灰箭头。
 * 用外/内两条弧 + 箭头尖闭合成填充带。
 */
function bandArrow(
  fromI: number,
  toI: number,
  rOuter: number,
  rInner: number,
): string {
  const steps = 18
  const a0 = -Math.PI / 2 + (fromI * 2 * Math.PI) / 3
  const a1 = -Math.PI / 2 + (toI * 2 * Math.PI) / 3
  // 顺时针：角度增大
  let start = a0 + 0.32
  let end = a1 - 0.38
  if (end < start) end += 2 * Math.PI

  const outer: [number, number][] = []
  const inner: [number, number][] = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const ang = start + (end - start) * t
    outer.push([CX + rOuter * Math.cos(ang), CY + rOuter * Math.sin(ang)])
    inner.push([CX + rInner * Math.cos(ang), CY + rInner * Math.sin(ang)])
  }

  // 箭头尖（指向终点切线方向）
  const tipAng = end
  const midR = (rOuter + rInner) / 2
  const tipLen = 28
  const tipX = CX + (midR + tipLen * 0.15) * Math.cos(tipAng + 0.06)
  const tipY = CY + (midR + tipLen * 0.15) * Math.sin(tipAng + 0.06)
  // 翼展
  const wing = 18
  const nx = -Math.sin(tipAng)
  const ny = Math.cos(tipAng)
  const tipBaseOuter = outer[outer.length - 1]
  const tipBaseInner = inner[inner.length - 1]
  const wingOuter: [number, number] = [
    tipBaseOuter[0] + nx * wing * 0.35,
    tipBaseOuter[1] + ny * wing * 0.35,
  ]
  const wingInner: [number, number] = [
    tipBaseInner[0] - nx * wing * 0.35,
    tipBaseInner[1] - ny * wing * 0.35,
  ]

  const parts: string[] = []
  parts.push(`M ${outer[0][0]} ${outer[0][1]}`)
  for (let i = 1; i < outer.length; i++) {
    parts.push(`L ${outer[i][0]} ${outer[i][1]}`)
  }
  parts.push(`L ${wingOuter[0]} ${wingOuter[1]}`)
  parts.push(`L ${tipX} ${tipY}`)
  parts.push(`L ${wingInner[0]} ${wingInner[1]}`)
  for (let i = inner.length - 1; i >= 0; i--) {
    parts.push(`L ${inner[i][0]} ${inner[i][1]}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

const cycleArrows = [
  bandArrow(0, 1, R + 78, R + 52),
  bandArrow(1, 2, R + 78, R + 52),
  bandArrow(2, 0, R + 78, R + 52),
]

/** D 中心虚线圈 */
const D_RING_R = 96

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
  <div
    class="dp-canvas"
    :style="chrome"
    aria-label="刻意练习画布"
  >
    <!-- 顶部前提条 -->
    <header class="dp-premise">
      <div
        class="premise-hotspot"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${doc.labels.premiseTitle}`"
        @click="onNodeActivate('premise', $event)"
        @keydown.enter.prevent="openEditor('premise')"
        @keydown.space.prevent="openEditor('premise')"
      >
        <h2 class="premise-title">{{ doc.labels.premiseTitle }}</h2>
        <div class="premise-vbar" aria-hidden="true" />
        <ul class="premise-bullets" aria-hidden="true">
          <li v-for="(t, i) in STATIC_BULLETS.premise" :key="i">{{ t }}</li>
        </ul>
      </div>
      <div class="side-tag deliberate-tag" aria-hidden="true">
        {{ doc.labels.deliberateIsPremise }}
      </div>
    </header>

    <!-- 虚线分隔 + 提炼↓ / 提高↑ -->
    <div class="dp-bridge" aria-hidden="true">
      <div class="bridge-line" />
      <div class="bridge-arrows">
        <div class="bridge-col">
          <span class="bridge-label">{{ doc.labels.extractDown }}</span>
          <svg class="bridge-chevron" viewBox="0 0 20 28" aria-hidden="true">
            <path
              d="M4 4 L10 12 L16 4"
              fill="none"
              stroke="#80868b"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M4 14 L10 22 L16 14"
              fill="none"
              stroke="#80868b"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="bridge-col">
          <svg class="bridge-chevron" viewBox="0 0 20 28" aria-hidden="true">
            <path
              d="M4 24 L10 16 L16 24"
              fill="none"
              stroke="#80868b"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M4 14 L10 6 L16 14"
              fill="none"
              stroke="#80868b"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="bridge-label">{{ doc.labels.improveUp }}</span>
        </div>
      </div>
    </div>

    <!-- 方法论三角舞台（单一 SVG，对齐 pm-solution 占满可视区） -->
    <div class="dp-stage">
      <svg
        class="dp-diagram"
        :viewBox="`0 0 ${VB_W} ${VB_H}`"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="刻意练习方法论三角"
      >
        <defs>
          <filter id="dpHaloShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-opacity="0.14" />
          </filter>
          <marker
            id="dpDHead"
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="3.2"
            orient="auto"
          >
            <path d="M0,0 L8,3.2 L0,6.4 Z" :fill="colorD" />
          </marker>
        </defs>

        <!-- 三角主体 -->
        <polygon
          :points="trianglePoints"
          fill="rgba(198,202,208,0.18)"
          stroke="#c5c9ce"
          stroke-width="11"
          stroke-linejoin="round"
        />

        <!-- 顺时针空心粗箭头 A→B→C→A -->
        <path
          v-for="(d, i) in cycleArrows"
          :key="`arr-${i}`"
          :d="d"
          fill="#d5d8dc"
          stroke="#b8bcc0"
          stroke-width="1.2"
          opacity="0.92"
        />

        <!-- 中心 D 虚线圈 + 旋转箭头感 -->
        <circle
          :cx="CX"
          :cy="CY"
          :r="D_RING_R"
          fill="none"
          :stroke="colorD"
          stroke-width="2.4"
          stroke-dasharray="7 6"
          opacity="0.5"
        />
        <path
          :d="`M ${CX} ${CY - D_RING_R} A ${D_RING_R} ${D_RING_R} 0 1 1 ${CX - D_RING_R * 0.72} ${CY - D_RING_R * 0.7}`"
          fill="none"
          :stroke="colorD"
          stroke-width="2.4"
          stroke-dasharray="7 6"
          opacity="0.85"
          marker-end="url(#dpDHead)"
        />

        <!-- D 可点击热点（透明扩大命中区） -->
        <g
          class="dp-vertex-hit dp-d-hit"
          role="button"
          tabindex="0"
          :style="{ color: colorD }"
          :aria-label="`最大化编辑${doc.nodes.d.title}`"
          @click="onNodeActivate('node_d', $event)"
          @keydown.enter.prevent="openEditor('node_d')"
          @keydown.space.prevent="openEditor('node_d')"
        >
          <circle
            class="dp-hit-pad"
            :cx="CX"
            :cy="CY"
            :r="D_RING_R + 8"
            fill="rgba(255,255,255,0.01)"
          />
          <text
            :x="CX"
            :y="CY - 10"
            text-anchor="middle"
            dominant-baseline="middle"
            class="dp-d-title"
            :fill="colorD"
          >
            {{ doc.nodes.d.title }}
          </text>
          <text
            :x="CX"
            :y="CY + 18"
            text-anchor="middle"
            dominant-baseline="middle"
            class="dp-d-sub"
            :fill="colorD"
          >
            {{ doc.nodes.d.subtitle }}
          </text>
        </g>

        <!-- A / B / C 顶点：柔光圆 + 彩色三角 + 标题热点 + 静态要点 -->
        <g v-for="n in vertexNodes" :key="n.id">
          <!-- 柔光圆 -->
          <circle
            :cx="n.x"
            :cy="n.y"
            :r="HALO_R"
            fill="#e9ebef"
            filter="url(#dpHaloShadow)"
          />
          <!-- 彩色圆角三角徽章 -->
          <path
            :d="roundedTriPath(n.x, n.y, TRI_R)"
            :fill="n.color"
            stroke="#ffffff"
            stroke-width="2.5"
            stroke-linejoin="round"
          />

          <!-- 可点击标题区（仿 pmst-vertex-label 白底胶囊） -->
          <g
            class="dp-vertex-hit"
            role="button"
            tabindex="0"
            :style="{ color: n.color }"
            :aria-label="`最大化编辑${n.title}`"
            @click="onNodeActivate(n.id, $event)"
            @keydown.enter.prevent="openEditor(n.id)"
            @keydown.space.prevent="openEditor(n.id)"
          >
            <!-- 扩大圆点击区 -->
            <circle
              class="dp-hit-pad"
              :cx="n.x"
              :cy="n.y"
              :r="HALO_R + 6"
              fill="rgba(255,255,255,0.01)"
            />
            <rect
              class="dp-label-pill"
              :x="n.labelSide === 'under' ? n.titleX - 77 : n.anchor === 'start' ? n.titleX - 6 : n.titleX - 148"
              :y="n.titleY - 16"
              width="154"
              height="30"
              rx="8"
              fill="rgba(255,255,255,0.92)"
              stroke="#e8eaed"
              stroke-width="1"
            />
            <text
              :x="n.titleX"
              :y="n.titleY"
              :text-anchor="n.anchor"
              dominant-baseline="middle"
              class="dp-node-title"
              :fill="n.color"
            >
              {{ n.title }}
            </text>
          </g>

          <!-- 静态小要点（不可点） -->
          <text
            v-for="(t, bi) in n.bullets"
            :key="`${n.id}-b-${bi}`"
            :x="n.bulletX"
            :y="n.bulletY + bi * 18"
            :text-anchor="n.bulletAnchor"
            dominant-baseline="middle"
            class="dp-node-bullet"
          >
            {{ t }}
          </text>
        </g>
      </svg>

      <div class="side-tag practice-tag" aria-hidden="true">
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
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  color: #3c4043;
}

/* ---- 前提条：红标题居中；要点随标题簇；右标签贴右 ---- */
.dp-premise {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 2px 140px 6px; /* 右侧预留标签宽度，保证标题视觉居中 */
  min-height: 52px;
  box-sizing: border-box;
}

.premise-hotspot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-width: 0;
  cursor: pointer;
  outline: none;
  border-radius: 12px;
  padding: 8px 10px;
  margin: -4px -6px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.premise-hotspot:hover {
  background: rgba(229, 57, 53, 0.08);
  box-shadow: 0 0 0 1px rgba(229, 57, 53, 0.18);
}

.premise-hotspot:focus-visible {
  box-shadow: 0 0 0 2px rgba(229, 57, 53, 0.4);
}

.premise-hotspot:hover .premise-title {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.premise-title {
  margin: 0;
  font-size: clamp(22px, 2.7vw, 30px);
  font-weight: 800;
  color: #e53935;
  letter-spacing: 0.03em;
  white-space: nowrap;
  line-height: 1.15;
  text-align: center;
}

.premise-vbar {
  width: 1px;
  align-self: stretch;
  min-height: 44px;
  background: #c5c9ce;
  flex-shrink: 0;
}

.premise-bullets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #80868b;
  font-size: clamp(12px, 1.35vw, 14px);
  font-weight: 550;
  line-height: 1.35;
  pointer-events: none;
}

.side-tag {
  background: #4a4f55;
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  padding: 11px 18px;
  border-radius: 8px;
  white-space: nowrap;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  line-height: 1.3;
  pointer-events: none;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.deliberate-tag {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}

/* ---- 桥接 ---- */
.dp-bridge {
  flex-shrink: 0;
  position: relative;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 0 2px;
}

.bridge-line {
  position: absolute;
  left: 3%;
  right: 3%;
  top: 50%;
  border-top: 1.6px dashed #b0b4b8;
  pointer-events: none;
}

.bridge-arrows {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 36px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--dp-bg, #f2f2f2) 92%, transparent);
}

.bridge-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  color: #5f6368;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: 0.04em;
}

.bridge-chevron {
  width: 16px;
  height: 22px;
  display: block;
}

/* ---- 舞台：像 pmst-stage 占满剩余高度 ---- */
.dp-stage {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dp-diagram {
  width: min(100%, 980px);
  height: min(100%, 72vh, 620px);
  max-height: 100%;
  overflow: visible;
  user-select: none;
}

/* 顶点/中心可点：仿 pmst-vertex-label */
.dp-vertex-hit {
  cursor: pointer;
  outline: none;
}

.dp-vertex-hit:hover .dp-label-pill {
  fill: color-mix(in srgb, currentColor 12%, #ffffff);
  stroke: currentColor;
}

.dp-vertex-hit:hover .dp-node-title {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dp-vertex-hit:focus-visible .dp-label-pill {
  stroke-width: 2;
}

.dp-d-hit:hover .dp-hit-pad {
  fill: rgba(255, 255, 255, 0.72);
}

.dp-d-hit:hover .dp-d-title {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dp-d-hit:focus-visible .dp-hit-pad {
  stroke: #00a685;
  stroke-width: 2;
  fill: rgba(255, 255, 255, 0.55);
}

.dp-node-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.dp-node-bullet {
  fill: #5f6368;
  font-size: 13px;
  font-weight: 550;
  letter-spacing: 0.01em;
  pointer-events: none;
}

.dp-d-title {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.dp-d-sub {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  pointer-events: none;
}

.practice-tag {
  position: absolute;
  right: 8px;
  top: 46%;
  transform: translateY(-50%);
  z-index: 2;
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

  .dp-premise {
    flex-wrap: wrap;
    padding-right: 16px;
    padding-left: 16px;
  }

  .deliberate-tag {
    position: static;
    transform: none;
    margin-top: 4px;
  }

  .dp-diagram {
    width: min(100%, 720px);
    height: min(100%, 56vh, 480px);
  }

  .dp-node-title {
    font-size: 15px;
  }

  .dp-d-title {
    font-size: 16px;
  }

  .practice-tag {
    top: auto;
    bottom: 4px;
    right: 4px;
    transform: none;
  }
}
</style>
