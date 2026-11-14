<script setup lang="ts">
import { computed, ref } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { AiBoundaryAxisId, AiBoundaryBusiness, AiBoundaryDocumentJSON } from '../../types/canvas'
import { isAiBoundaryDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { panelMaximizeKey, usePanelMaximize } from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import { itemTextToHtml, normalizeHtmlForCompare } from '../../utils/itemsHtml'
import {
  AI_BOUNDARY_AXIS_IDS,
  AI_BOUNDARY_AXIS_LABEL,
  AI_BOUNDARY_MAX,
  AI_BOUNDARY_NUMERAL,
  aiBoundaryHits,
  aiBoundaryRadarPoint,
  aiBoundaryRadarRing,
  aiBoundaryStops,
  clampAiBoundaryScore,
} from '../../utils/aiBoundary'
import { sceneRecordText } from '../../utils/sceneThreeHigh'

const props = defineProps<{ doc: AiBoundaryDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const selectedId = ref(props.doc.businesses[0]?.id ?? '')
const noteBizId = ref('')

const noteKey = computed(() => panelMaximizeKey('ai-boundary', noteBizId.value || 'idle'))
const { isMaximized, openMaximize, closeMaximize } = usePanelMaximize(noteKey)

const PALETTE = [
  { color: 'rgba(154, 52, 18, 0.28)', stroke: '#9a3412' },
  { color: 'rgba(185, 28, 28, 0.28)', stroke: '#b91c1c' },
  { color: 'rgba(180, 83, 9, 0.3)', stroke: '#b45309' },
  { color: 'rgba(124, 58, 237, 0.26)', stroke: '#7c3aed' },
  { color: 'rgba(15, 118, 110, 0.28)', stroke: '#0f766e' },
]

const CX = 320
const CY = 320
const R = 168
const ringLevels = [20, 40, 60, 80]
const warnScore = computed(() => props.doc.warnScore || 70)
const selected = computed(() => props.doc.businesses.find((biz) => biz.id === selectedId.value) ?? null)
const radarBusinesses = computed(() => {
  const rest = props.doc.businesses.filter((biz) => biz.id !== selectedId.value)
  return selected.value ? [...rest, selected.value] : props.doc.businesses
})
const stoppedCount = computed(() => props.doc.businesses.filter((biz) => aiBoundaryStops(biz.scores, warnScore.value)).length)
const rings = ringLevels.map((level) => aiBoundaryRadarRing(level, CX, CY, R))
const warnRing = computed(() => aiBoundaryRadarRing(warnScore.value, CX, CY, R))
const spokes = [0, 1, 2, 3].map((index) => {
  const [x, y] = aiBoundaryRadarPoint(index, AI_BOUNDARY_MAX, CX, CY, R)
  return { x, y }
})

function axisLabelPoint(index: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / AI_BOUNDARY_AXIS_IDS.length
  const radius = R + 48
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)]
}

const axisLabels = computed(() =>
  AI_BOUNDARY_AXIS_IDS.map((id, index) => {
    const [x, y] = axisLabelPoint(index)
    const axis = props.doc.axes.find((item) => item.id === id)
    return { id, x, y, title: axis?.title || AI_BOUNDARY_AXIS_LABEL[id] }
  }),
)

function patch(mutator: (doc: AiBoundaryDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isAiBoundaryDoc(doc)) return
    mutator(doc)
  })
}

function polygon(biz: AiBoundaryBusiness): string {
  return AI_BOUNDARY_AXIS_IDS.map((id, index) => aiBoundaryRadarPoint(index, biz.scores[id], CX, CY, R).join(',')).join(' ')
}

function setName(id: string, name: string) {
  patch((doc) => {
    const biz = doc.businesses.find((item) => item.id === id)
    if (biz && biz.name !== name) biz.name = name
  })
}

function setScore(id: string, axis: AiBoundaryAxisId, raw: string) {
  const value = clampAiBoundaryScore(Number(raw))
  patch((doc) => {
    const biz = doc.businesses.find((item) => item.id === id)
    if (!biz || biz.scores[axis] === value) return
    biz.scores[axis] = value
  })
}

function addBusiness() {
  const n = props.doc.businesses.length
  const palette = PALETTE[n % PALETTE.length]
  const id = `biz_${Date.now().toString(36)}`
  patch((doc) => {
    doc.businesses.push({
      id,
      name: `第${doc.businesses.length + 1}个业务`,
      color: palette.color,
      stroke: palette.stroke,
      scores: { cause: 50, irreversible: 50, data: 50, compliance: 50 },
      note: '',
    })
  })
  selectedId.value = id
}

function removeBusiness(id: string) {
  patch((doc) => {
    doc.businesses = doc.businesses.filter((item) => item.id !== id)
  })
  if (selectedId.value === id) selectedId.value = props.doc.businesses[0]?.id ?? ''
  if (noteBizId.value === id) closeMaximize()
}

function verdictOf(biz: AiBoundaryBusiness): string {
  const hits = aiBoundaryHits(biz.scores, warnScore.value).map((id) => AI_BOUNDARY_AXIS_LABEL[id])
  return hits.length ? `别用：${hits.join('、')}` : '可以考虑'
}

const noteBiz = computed(() => props.doc.businesses.find((item) => item.id === noteBizId.value))
const noteHtml = computed(() => itemTextToHtml(noteBiz.value?.note || ''))

function openNote(id: string) {
  noteBizId.value = id
  selectedId.value = id
  openMaximize()
}

function writeNote(html: string) {
  const current = noteBiz.value
  if (!current) return
  if (normalizeHtmlForCompare(itemTextToHtml(current.note)) === normalizeHtmlForCompare(html)) return
  patch((doc) => {
    const biz = doc.businesses.find((item) => item.id === current.id)
    if (biz) biz.note = html
  })
}
</script>

<template>
  <div class="sheet ai-boundary" :style="chrome" aria-label="业务别用 AI 的情况">
    <header class="top">
      <div>
        <p class="kicker">{{ doc.kicker }}</p>
        <h2>{{ doc.title }}</h2>
      </div>
      <p class="score">别用 <strong>{{ stoppedCount }}</strong> / {{ doc.businesses.length }}</p>
    </header>

    <section class="criteria" aria-label="四种情况">
      <article
        v-for="(axis, index) in doc.axes"
        :key="axis.id"
        class="card"
        :class="{ hot: selected && selected.scores[axis.id] >= warnScore }"
      >
        <div class="card-top">
          <p class="index">{{ AI_BOUNDARY_NUMERAL[index] || index + 1 }}</p>
          <p v-if="selected" class="axis-score" :class="{ hot: selected.scores[axis.id] >= warnScore }">
            {{ selected.scores[axis.id] }}
          </p>
        </div>
        <h3>{{ axis.title }}</h3>
        <p>{{ axis.body }}</p>
      </article>
    </section>

    <div class="work">
      <section class="list" aria-label="业务">
        <div class="list-bar">
          <span>业务</span>
          <button type="button" @click="addBusiness">新增业务</button>
        </div>
        <div class="list-body">
          <article
            v-for="biz in doc.businesses"
            :key="biz.id"
            class="biz"
            :class="{ selected: selectedId === biz.id, stop: aiBoundaryStops(biz.scores, warnScore) }"
            :data-biz="biz.id"
            @click="selectedId = biz.id"
          >
            <header>
              <span class="dot" :style="{ background: biz.stroke }" />
              <input
                :value="biz.name"
                :aria-label="`${biz.name}的名称`"
                @click.stop
                @input="setName(biz.id, ($event.target as HTMLInputElement).value)"
              />
              <strong>{{ verdictOf(biz) }}</strong>
              <button type="button" @click.stop="openNote(biz.id)">判断</button>
              <button type="button" aria-label="删除业务" @click.stop="removeBusiness(biz.id)">×</button>
            </header>
            <label v-for="axis in AI_BOUNDARY_AXIS_IDS" :key="axis">
              <span>{{ AI_BOUNDARY_AXIS_LABEL[axis] }}</span>
              <input
                type="range"
                min="0"
                :max="AI_BOUNDARY_MAX"
                step="1"
                :aria-label="`${biz.name}的${AI_BOUNDARY_AXIS_LABEL[axis]}`"
                :value="biz.scores[axis]"
                @click.stop
                @input="setScore(biz.id, axis, ($event.target as HTMLInputElement).value)"
              />
              <input
                class="num"
                :class="{ hot: biz.scores[axis] >= warnScore }"
                type="number"
                min="0"
                :max="AI_BOUNDARY_MAX"
                step="1"
                :value="biz.scores[axis]"
                @click.stop
                @change="setScore(biz.id, axis, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <p v-if="sceneRecordText(biz.note)" class="record">{{ sceneRecordText(biz.note) }}</p>
          </article>
          <p v-if="!doc.businesses.length" class="empty">先加一个业务，再按四条边界打分。</p>
        </div>
      </section>

      <section class="radar" aria-label="别用 AI 雷达图">
        <svg viewBox="0 0 640 640" role="img">
          <polygon v-for="(points, index) in rings" :key="index" :points="points" class="ring" />
          <polygon :points="warnRing" class="gate" />
          <line v-for="(spoke, index) in spokes" :key="index" :x1="CX" :y1="CY" :x2="spoke.x" :y2="spoke.y" class="spoke" />
          <g v-for="biz in radarBusinesses" :key="biz.id" class="shape" @click="selectedId = biz.id">
            <polygon
              :points="polygon(biz)"
              :fill="biz.color"
              :fill-opacity="selectedId === biz.id ? 0.9 : 0.18"
              stroke="none"
            />
            <polygon
              class="radar-flow-line"
              :class="{ 'is-selected': selectedId === biz.id }"
              :points="polygon(biz)"
              fill="none"
              :stroke="biz.stroke"
              :stroke-width="selectedId === biz.id ? 3.2 : 1.6"
              :stroke-opacity="selectedId === biz.id ? 1 : 0.55"
              pointer-events="none"
            />
          </g>
          <text
            v-for="label in axisLabels"
            :key="label.id"
            :x="label.x"
            :y="label.y"
            text-anchor="middle"
            dominant-baseline="middle"
            class="axis"
          >{{ label.title }}</text>
          <text
            v-for="level in ringLevels"
            :key="`tick-${level}`"
            :x="CX + 8"
            :y="CY - (R * level) / AI_BOUNDARY_MAX + 4"
            class="tick"
          >{{ level }}</text>
          <text :x="CX - 36" :y="CY - (R * warnScore) / AI_BOUNDARY_MAX + 4" class="gate-label">{{ warnScore }}</text>
        </svg>
        <ul class="legend">
          <li v-for="biz in doc.businesses" :key="biz.id">
            <button type="button" :class="{ on: selectedId === biz.id }" @click="selectedId = biz.id">
              <i :style="{ background: biz.stroke }" />
              {{ biz.name }}
            </button>
          </li>
        </ul>
      </section>
    </div>

    <p class="verdict">{{ doc.verdict }}</p>
  </div>

  <Teleport to="body">
    <div v-if="isMaximized && noteBiz" class="pm-overlay" role="dialog" aria-modal="true" :aria-label="`${noteBiz.name}的判断`" @click.self="closeMaximize()">
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ noteBiz.name }} · 别用 AI 的判断</h3>
          <div class="pm-actions">
            <button type="button" class="pm-icon-btn" title="还原" aria-label="还原" @click="closeMaximize()">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="4" y="4" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" />
                <path d="M3 10.5V3.5h7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </button>
            <button type="button" class="pm-icon-btn pm-close" title="关闭" aria-label="关闭" @click="closeMaximize()">×</button>
          </div>
        </div>
        <div class="pm-body">
          <RichTextEditor
            class="pm-rte"
            :expanded="true"
            :show-title="false"
            :show-bottom-bar="true"
            :show-publish-actions="false"
            placeholder="写下这个业务为什么不该交给 AI，或为什么可以考虑"
            :model-value="noteHtml"
            @update:model-value="writeNote"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; overflow: auto; padding: 18px 20px 24px; color: #1c1917; background: var(--cv-page, #f6f1e6); }
.top, .list-bar, .biz header, .biz label { display: flex; align-items: center; }
.top { justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.kicker, .top h2, .card h3, .card p, .verdict, .empty, .index { margin: 0; }
.kicker { color: #9a3412; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.top h2 { margin-top: 4px; font-size: 28px; letter-spacing: -0.02em; }
.score { margin: 0; padding: 8px 12px; border-radius: 999px; background: #fff; white-space: nowrap; }
.score strong { color: #9a3412; font-size: 18px; }
.criteria { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.card { padding: 16px 16px 14px; border: 1px solid #e6d7c3; border-radius: 4px; background: #fbf7f1; }
.card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.index { color: #a8a29e; font-size: 13px; font-weight: 700; }
.axis-score { margin: 0; color: #0f766e; font-size: 18px; font-weight: 800; }
.axis-score.hot { color: #9a3412; }
.card.hot { border-color: #e7b8a8; background: #fff6f4; }
.card h3 { margin-top: 8px; color: #1c1917; font-size: 20px; letter-spacing: -0.02em; }
.card p:last-child { margin-top: 8px; color: #44403c; font-size: 14px; line-height: 1.6; }
.work { display: grid; grid-template-columns: minmax(380px, 480px) minmax(320px, 1fr); gap: 16px; align-items: stretch; }
.list, .radar { background: #fffdf8; border: 1px solid rgba(90, 60, 30, 0.12); border-radius: 14px; box-sizing: border-box; }
.list { display: flex; flex-direction: column; height: 0; min-height: 100%; overflow: hidden; padding: 12px; }
.list-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.list-bar { justify-content: space-between; margin-bottom: 8px; font-weight: 700; }
.list-bar button, .biz header button { border: 1px solid #e4ddd2; background: #fff; border-radius: 999px; min-height: 32px; padding: 4px 12px; cursor: pointer; font-size: 13px; }
.biz { margin-top: 8px; padding: 10px; border: 1px solid #f1ebe3; border-radius: 12px; background: #f4fbf6; }
.biz.selected { border-color: #9a3412; }
.biz.stop { background: #fff6f4; }
.biz header { gap: 8px; flex-wrap: wrap; }
.biz header strong { white-space: normal; line-height: 1.35; max-width: 10em; text-align: right; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.biz header input { flex: 1; min-width: 0; border: none; background: transparent; font: inherit; font-weight: 700; }
.biz header strong { color: #0f766e; font-size: 14px; font-weight: 700; }
.biz.stop header strong { color: #9a3412; }
.biz label { gap: 8px; margin-top: 6px; }
.biz label span { width: 6.2em; color: #57534e; font-size: 13px; flex: none; }
.biz label input[type='range'] { flex: 1; height: 22px; accent-color: #0f766e; cursor: pointer; }
.num { width: 72px; min-height: 36px; border: 1px solid #e4ddd2; border-radius: 8px; padding: 4px 8px; font: inherit; font-size: 15px; font-variant-numeric: tabular-nums; text-align: right; color: #0f766e; font-weight: 700; }
.num.hot { color: #9a3412; border-color: #e7c4b8; background: #fff6f4; }
.record { margin: 8px 0 0; color: #44403c; font-size: 13px; line-height: 1.5; }
.radar { display: flex; flex-direction: column; min-height: 460px; }
.radar svg { display: block; width: 100%; height: auto; }
.legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 4px 12px 12px; list-style: none; }
.legend button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; background: transparent; border-radius: 999px; min-height: 32px; padding: 4px 12px; cursor: pointer; font: inherit; font-size: 13px; color: #44403c; }
.legend button.on { border-color: #e6d7c3; background: #fff; font-weight: 700; }
.legend i { width: 8px; height: 8px; border-radius: 50%; }
.tick, .gate-label { paint-order: stroke; stroke: #fffdf8; stroke-width: 3px; }
.tick { fill: #5f6368; font-size: 18px; font-weight: 700; }
.shape { cursor: pointer; }
.ring, .spoke { fill: none; stroke: #e7d7c4; stroke-width: 1; }
.gate { fill: none; stroke: #9a3412; stroke-width: 1.4; stroke-dasharray: 5 4; }
.axis { fill: #1c1917; font-size: 15px; font-weight: 700; }
.gate-label { fill: #9a3412; font-size: 20px; font-weight: 700; }
.verdict { margin-top: 16px; font-size: 16px; font-weight: 650; line-height: 1.6; }
.empty { color: #8a8175; }
@media (max-width: 1100px) {
  .criteria { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 980px) {
  .criteria, .work { grid-template-columns: 1fr; }
  .list { height: auto; min-height: 0; overflow: visible; }
  .list-body { overflow: visible; }
  .top h2 { font-size: 22px; }
}
</style>

<style>
.canvas-viewport .sheet.ai-boundary .card,
.canvas-viewport .sheet.ai-boundary .biz {
  border-color: #e6d7c3;
  box-shadow: none;
}
.canvas-viewport .sheet.ai-boundary .card {
  background: #fbf7f1;
}
.canvas-viewport .sheet.ai-boundary .biz { background: #f4fbf6; }
.canvas-viewport .sheet.ai-boundary .biz.stop { background: #fff6f4; }
.canvas-viewport .sheet.ai-boundary .card h3,
.canvas-viewport .sheet.ai-boundary .index {
  background: none;
  text-shadow: none;
  color: #1c1917;
  padding: 0;
}
.canvas-viewport .sheet.ai-boundary .index { color: #a8a29e; }
</style>
