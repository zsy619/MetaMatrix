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
  ScientificMeeting10pAxisId,
  ScientificMeeting10pBlock,
  ScientificMeeting10pDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: ScientificMeeting10pDocumentJSON
}>()

const documentStore = useDocumentStore()

// Sync before first render so axisBlocks are defined (v-if hosts).
documentStore.ensureScientificMeeting10pBlocks()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

/**
 * 顺时针自顶（12 点）：民主 → … → 良性
 * （与十瓣花参考图一致）
 */
const AXIS_ORDER: ScientificMeeting10pAxisId[] = [
  'democratic',
  'implementable',
  'motivating',
  'inspiring',
  'devoting',
  'efficient',
  'learning',
  'responsible',
  'pragmatic',
  'friendly',
]

/** 底部滑块展示顺序（与花瓣顺时针一致） */
const SLIDER_ORDER: ScientificMeeting10pAxisId[] = [...AXIS_ORDER]

const AXIS_ZH: Record<ScientificMeeting10pAxisId, string> = {
  democratic: '民主',
  implementable: '落实',
  motivating: '激发',
  inspiring: '点燃',
  devoting: '投入',
  efficient: '高效',
  learning: '学习',
  responsible: '责任',
  pragmatic: '务实',
  friendly: '良性',
}

const AXIS_EN: Record<ScientificMeeting10pAxisId, string> = {
  democratic: 'democratic',
  implementable: 'implementable',
  motivating: 'motivating',
  inspiring: 'inspiring',
  devoting: 'devoting',
  efficient: 'efficient',
  learning: 'learning',
  responsible: 'responsible',
  pragmatic: 'pragmatic',
  friendly: 'friendly',
}

/**
 * 十瓣固定分色（贴近参考花瓣）。
 * 花瓣填充、标签、底栏滑块共用同一色值。
 */
const AXIS_COLOR: Record<ScientificMeeting10pAxisId, string> = {
  democratic: '#43A047',
  implementable: '#C0CA33',
  motivating: '#FB8C00',
  inspiring: '#E53935',
  devoting: '#D81B60',
  efficient: '#B39DDB',
  learning: '#5E35B1',
  responsible: '#1E88E5',
  pragmatic: '#00ACC1',
  friendly: '#8BC34A',
}

function axisColor(axis: ScientificMeeting10pAxisId): string {
  return AXIS_COLOR[axis]
}

const blocksById = computed(() => {
  const map = new Map<ScientificMeeting10pAxisId, ScientificMeeting10pBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function blockOf(
  axis: ScientificMeeting10pAxisId,
): ScientificMeeting10pBlock | undefined {
  return blocksById.value.get(axis)
}

function titleOf(axis: ScientificMeeting10pAxisId): string {
  return props.doc.axes[axis]?.title || AXIS_ZH[axis]
}

const axisBlocks = computed(() =>
  SLIDER_ORDER.map((axis) => ({
    axis,
    block: blockOf(axis),
    title: titleOf(axis),
  })),
)

/* ---- flower geometry (viewBox 800×720) ---- */
const CX = 400
const CY = 360
const R = 260
const SCORE_MAX = 100
const PETAL_COUNT = 10

function clampScore(n: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(SCORE_MAX, Math.max(0, v))
}

function displayScore(n: number): number {
  return Math.round(clampScore(n))
}

/** 12 点起顺时针；i=0 → -π/2 */
function axisAngle(i: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / PETAL_COUNT
}

function polar(i: number, r: number): [number, number] {
  const angle = axisAngle(i)
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

/**
 * 泪滴形花瓣：自中心指向 tip。
 * 宽度随长度缩放；重叠感由相邻角半宽 + 绘制顺序产生。
 */
function petalPath(i: number, length: number): string {
  const angle = axisAngle(i)
  const tipX = CX + length * Math.cos(angle)
  const tipY = CY + length * Math.sin(angle)
  const px = -Math.sin(angle)
  const py = Math.cos(angle)
  const mid = length * 0.52
  const halfW = length * 0.36
  const leftX = CX + mid * Math.cos(angle) + halfW * px
  const leftY = CY + mid * Math.sin(angle) + halfW * py
  const rightX = CX + mid * Math.cos(angle) - halfW * px
  const rightY = CY + mid * Math.sin(angle) - halfW * py
  // 近根部略收窄的二次贝塞尔，形成纸质叠瓣轮廓
  const root = length * 0.08
  const rootLX = CX + root * Math.cos(angle) + halfW * 0.22 * px
  const rootLY = CY + root * Math.sin(angle) + halfW * 0.22 * py
  const rootRX = CX + root * Math.cos(angle) - halfW * 0.22 * px
  const rootRY = CY + root * Math.sin(angle) - halfW * 0.22 * py
  return [
    `M ${CX.toFixed(2)} ${CY.toFixed(2)}`,
    `L ${rootLX.toFixed(2)} ${rootLY.toFixed(2)}`,
    `Q ${leftX.toFixed(2)} ${leftY.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`,
    `Q ${rightX.toFixed(2)} ${rightY.toFixed(2)} ${rootRX.toFixed(2)} ${rootRY.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** 花瓣长度：按 0–100 自中心缩放（保留极小可见根以便点击） */
function petalLength(score: number): number {
  const s = clampScore(score)
  return R * (0.12 + 0.88 * (s / SCORE_MAX))
}

const petals = computed(() =>
  AXIS_ORDER.map((axis, i) => {
    const score = clampScore(props.doc.scores[axis])
    const len = petalLength(score)
    const [tx, ty] = polar(i, len)
    // 文案落在花瓣最宽处附近
    const [lx, ly] = polar(i, len * 0.55)
    return {
      axis,
      i,
      score,
      path: petalPath(i, len),
      tipX: tx,
      tipY: ty,
      labelX: lx,
      labelY: ly,
      zh: titleOf(axis),
      en: AXIS_EN[axis],
      color: axisColor(axis),
    }
  }),
)

const sliderPanels = computed(() =>
  SLIDER_ORDER.map((axis) => ({
    axis,
    title: titleOf(axis),
    en: AXIS_EN[axis],
    score: displayScore(props.doc.scores[axis]),
  })),
)

/** 绘制顺序：后一瓣盖住前一瓣右缘（顺时针叠纸） */
const petalsDrawOrder = computed(() => [...petals.value].reverse())

function setScore(axis: ScientificMeeting10pAxisId, value: number) {
  documentStore.updateScientificMeeting10pScore(axis, clampScore(value))
}

function onSliderInput(axis: ScientificMeeting10pAxisId, event: Event) {
  const el = event.target as HTMLInputElement
  setScore(axis, Number(el.value))
}

/* ---- 花瓣 / 标签点击 → 全局 panel-maximize 全屏富文本 ---- */
const activeEditorAxis = ref<ScientificMeeting10pAxisId | null>(null)

const activeMaximizeKey = computed(() => {
  const axis = activeEditorAxis.value
  if (!axis) return 'sm10p:idle'
  const b = blockOf(axis)
  return b ? panelMaximizeKey('block', b.id) : 'sm10p:idle'
})

const { maximizedPanelKey } = usePanelMaximize(activeMaximizeKey)

function openEditor(axis: ScientificMeeting10pAxisId) {
  documentStore.ensureScientificMeeting10pBlocks()
  const b = blockOf(axis)
  if (!b) return
  activeEditorAxis.value = axis
  const key = panelMaximizeKey('block', b.id)
  nextTick(() => {
    maximizedPanelKey.value = key
  })
}

function onPetalActivate(axis: ScientificMeeting10pAxisId, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  openEditor(axis)
}

watch(maximizedPanelKey, (key) => {
  if (!key && activeEditorAxis.value) {
    activeEditorAxis.value = null
  }
})

onMounted(() => {
  documentStore.ensureScientificMeeting10pBlocks()
})

onBeforeUnmount(() => {
  if (
    activeEditorAxis.value &&
    maximizedPanelKey.value === activeMaximizeKey.value
  ) {
    maximizedPanelKey.value = null
  }
})
</script>

<template>
  <div
    class="sm10p-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="科学开会十大原则"
  >
    <header class="sm10p-title-bar">
      <h1 class="sm10p-title">科学开会十大原则</h1>
    </header>

    <div class="sm10p-stage">
      <svg
        class="sm10p-flower"
        viewBox="0 0 800 720"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="科学开会十大原则十瓣花"
      >
        <defs>
          <pattern
            id="sm10p-stripes"
            patternUnits="userSpaceOnUse"
            width="10"
            height="10"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="10"
              stroke="#d8d8d8"
              stroke-width="1.1"
              opacity="0.55"
            />
          </pattern>
          <filter
            id="sm10p-petal-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx="1.2"
              dy="1.8"
              stdDeviation="2.2"
              flood-color="#000000"
              flood-opacity="0.22"
            />
          </filter>
        </defs>

        <rect
          x="0"
          y="0"
          width="800"
          height="720"
          fill="#ffffff"
        />
        <rect
          x="0"
          y="0"
          width="800"
          height="720"
          fill="url(#sm10p-stripes)"
        />

        <!-- 逆序绘制：后一瓣盖住前一瓣右缘，形成顺时针叠纸感 -->
        <g
          v-for="p in petalsDrawOrder"
          :key="`petal-${p.axis}`"
          class="sm10p-petal"
          role="button"
          tabindex="0"
          :style="{ '--axis': p.color }"
          :aria-label="`最大化编辑${p.zh}`"
          filter="url(#sm10p-petal-shadow)"
          @click="onPetalActivate(p.axis, $event)"
          @keydown.enter.prevent="openEditor(p.axis)"
          @keydown.space.prevent="openEditor(p.axis)"
        >
          <path
            :d="p.path"
            :fill="p.color"
            stroke="rgba(255,255,255,0.35)"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <title>
            {{ p.zh }} / {{ p.en }}：{{ displayScore(p.score) }}（点击最大化编辑）
          </title>
        </g>

        <!-- 文案层（不参与阴影，避免文字发糊） -->
        <g
          v-for="p in petals"
          :key="`label-${p.axis}`"
          class="sm10p-petal-label"
          role="button"
          tabindex="0"
          :style="{ '--axis': p.color }"
          :aria-label="`最大化编辑${p.zh}`"
          @click="onPetalActivate(p.axis, $event)"
          @keydown.enter.prevent="openEditor(p.axis)"
          @keydown.space.prevent="openEditor(p.axis)"
        >
          <text
            :x="p.labelX"
            :y="p.labelY - 7"
            text-anchor="middle"
            dominant-baseline="middle"
            class="sm10p-zh"
          >
            {{ p.zh }}
          </text>
          <text
            :x="p.labelX"
            :y="p.labelY + 12"
            text-anchor="middle"
            dominant-baseline="middle"
            class="sm10p-en"
          >
            {{ p.en }}
          </text>
        </g>

        <!-- 花心 -->
        <circle
          :cx="CX"
          :cy="CY"
          r="18"
          fill="#ffffff"
          stroke="#e0e0e0"
          stroke-width="1.5"
        />
      </svg>
    </div>

    <div class="sm10p-sliders" role="group" aria-label="十大原则分值滑块">
      <label
        v-for="s in sliderPanels"
        :key="`slider-${s.axis}`"
        class="sm10p-slider"
        :title="`${s.title} / ${s.en}`"
        :style="{ '--axis': axisColor(s.axis) }"
      >
        <span class="sm10p-slider-name">{{ s.title }}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="s.score"
          :aria-label="`${s.title} 滑块`"
          @input="onSliderInput(s.axis, $event)"
        />
        <span class="sm10p-slider-val">{{ s.score }}</span>
      </label>
    </div>

    <!--
      隐藏挂载十轴 YModelBlock：点击花瓣时写入全局 maximizedPanelKey，
      由块内 Teleport .pm-overlay 铺满文档视口（panel-maximize 规则）。
    -->
    <div class="sm10p-block-host" aria-hidden="true">
      <template v-for="item in axisBlocks" :key="item.axis">
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
.sm10p-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.sm10p-title-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.sm10p-title {
  margin: 0;
  font-size: clamp(16px, 1.8vw, 22px);
  font-weight: 800;
  color: #3c4043;
  letter-spacing: 0.04em;
  text-align: center;
}

.sm10p-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sm10p-flower {
  width: min(100%, 920px);
  height: min(100%, 78vh, 700px);
  max-height: 100%;
  overflow: visible;
  touch-action: manipulation;
  user-select: none;
}

.sm10p-petal {
  cursor: pointer;
  outline: none;
  transition: opacity 0.15s ease;
}

.sm10p-petal:hover {
  opacity: 0.92;
}

.sm10p-petal:focus-visible path {
  stroke: #ffffff;
  stroke-width: 2.5;
}

.sm10p-petal-label {
  cursor: pointer;
  outline: none;
}

.sm10p-zh {
  fill: #ffffff;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.06em;
  pointer-events: none;
  paint-order: stroke fill;
  stroke: rgba(0, 0, 0, 0.12);
  stroke-width: 0.6px;
}

.sm10p-en {
  fill: rgba(255, 255, 255, 0.92);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  pointer-events: none;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.sm10p-sliders {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px 10px;
  padding: 8px 4px 2px;
  border-top: 1px solid #e8eaed;
}

.sm10p-slider {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(244, 245, 247, 0.95);
  border: 1px solid #e8eaed;
  box-sizing: border-box;
}

.sm10p-slider-name {
  flex: 0 1 auto;
  max-width: 42%;
  font-size: 11px;
  font-weight: 700;
  color: var(--axis, #43a047);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sm10p-slider input[type='range'] {
  flex: 1 1 auto;
  min-width: 0;
  height: 4px;
  accent-color: var(--axis, #43a047);
  cursor: pointer;
}

.sm10p-slider-val {
  flex: 0 0 auto;
  min-width: 2em;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 800;
  color: var(--axis, #43a047);
  text-align: right;
}

.sm10p-block-host {
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

@media (max-width: 1100px) {
  .sm10p-sliders {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .sm10p-sliders {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sm10p-flower {
    width: min(100%, 640px);
    height: min(100%, 52vh, 480px);
  }

  .sm10p-zh {
    font-size: 16px;
  }

  .sm10p-en {
    font-size: 9px;
  }
}
</style>
