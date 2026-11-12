<script setup lang="ts">
import { computed, ref } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  SceneThreeHighAxisId,
  SceneThreeHighBusiness,
  SceneThreeHighDocumentJSON,
} from '../../types/canvas'
import { isSceneThreeHighDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { panelMaximizeKey, usePanelMaximize } from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import { itemTextToHtml, normalizeHtmlForCompare } from '../../utils/itemsHtml'
import {
  SCENE_THREE_HIGH_AXIS_IDS,
  SCENE_THREE_HIGH_AXIS_LABEL,
  SCENE_THREE_HIGH_MAX,
  clampSceneScore,
  sceneRadarPoint,
  sceneRadarRing,
  sceneRecordText,
  sceneThreeHighGaps,
  sceneThreeHighPasses,
} from '../../utils/sceneThreeHigh'

const props = defineProps<{ doc: SceneThreeHighDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const selectedId = ref(props.doc.businesses[0]?.id ?? '')
const noteBizId = ref('')

const noteKey = computed(() => panelMaximizeKey('scene-three-high', noteBizId.value || 'idle'))
const { isMaximized, openMaximize, closeMaximize } = usePanelMaximize(noteKey)

const PALETTE = [
  { color: 'rgba(212, 175, 55, 0.38)', stroke: '#c9a227' },
  { color: 'rgba(77, 182, 172, 0.42)', stroke: '#26a69a' },
  { color: 'rgba(66, 133, 244, 0.32)', stroke: '#1a73e8' },
  { color: 'rgba(234, 67, 53, 0.28)', stroke: '#d93025' },
  { color: 'rgba(142, 68, 173, 0.3)', stroke: '#8e44ad' },
]

const CX = 320
const CY = 286
const R = 168
const passScore = computed(() => props.doc.passScore || 70)
const passedCount = computed(() => props.doc.businesses.filter((biz) => sceneThreeHighPasses(biz.scores, passScore.value)).length)
const rings = [20, 40, 60, 80, 100].map((level) => sceneRadarRing(level, CX, CY, R))
const passRing = computed(() => sceneRadarRing(passScore.value, CX, CY, R))
const spokes = [0, 1, 2].map((index) => {
  const [x, y] = sceneRadarPoint(index, SCENE_THREE_HIGH_MAX, CX, CY, R)
  return { x, y }
})
function axisLabelPoint(index: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 3
  const radius = R + 36
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)]
}

const axisLabels = computed(() =>
  SCENE_THREE_HIGH_AXIS_IDS.map((id, index) => {
    const [x, y] = axisLabelPoint(index)
    const axis = props.doc.axes.find((item) => item.id === id)
    return { id, x, y, title: axis?.title || SCENE_THREE_HIGH_AXIS_LABEL[id] }
  }),
)

function patch(mutator: (doc: SceneThreeHighDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isSceneThreeHighDoc(doc)) return
    mutator(doc)
  })
}

function polygon(biz: SceneThreeHighBusiness): string {
  return SCENE_THREE_HIGH_AXIS_IDS.map((id, index) => sceneRadarPoint(index, biz.scores[id], CX, CY, R).join(',')).join(' ')
}

function setName(id: string, name: string) {
  patch((doc) => {
    const biz = doc.businesses.find((item) => item.id === id)
    if (biz && biz.name !== name) biz.name = name
  })
}

function setScore(id: string, axis: SceneThreeHighAxisId, raw: string) {
  const value = clampSceneScore(Number(raw))
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
      scores: { frequency: 50, value: 50, marginal: 50 },
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

function verdictOf(biz: SceneThreeHighBusiness): string {
  const gaps = sceneThreeHighGaps(biz.scores, passScore.value)
  return gaps.length ? `还差${gaps.join('、')}` : `三项都到 ${passScore.value}`
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
  <div class="sheet scene-high" :style="chrome" aria-label="选场景三高">
    <header class="top">
      <div>
        <p class="kicker">{{ doc.kicker }}</p>
        <h2>{{ doc.title }}</h2>
      </div>
      <p class="score">过了 <strong>{{ passedCount }}</strong> / {{ doc.businesses.length }}</p>
    </header>

    <section class="criteria" aria-label="三高说明">
      <article v-for="axis in doc.axes" :key="axis.id" class="card">
        <h3>{{ axis.title }}</h3>
        <p class="headline">{{ axis.headline }}</p>
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
          :class="{ selected: selectedId === biz.id, pass: sceneThreeHighPasses(biz.scores, passScore) }"
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
            <button type="button" @click.stop="openNote(biz.id)">描述</button>
            <button type="button" aria-label="删除业务" @click.stop="removeBusiness(biz.id)">×</button>
          </header>
          <label v-for="axis in SCENE_THREE_HIGH_AXIS_IDS" :key="axis">
            <span>{{ SCENE_THREE_HIGH_AXIS_LABEL[axis] }}</span>
            <input
              type="range"
              min="0"
              :max="SCENE_THREE_HIGH_MAX"
              step="1"
              :aria-label="`${biz.name}的${SCENE_THREE_HIGH_AXIS_LABEL[axis]}`"
              :value="biz.scores[axis]"
              @click.stop
              @input="setScore(biz.id, axis, ($event.target as HTMLInputElement).value)"
            />
            <input
              class="num"
              type="number"
              min="0"
              :max="SCENE_THREE_HIGH_MAX"
              step="1"
              :value="biz.scores[axis]"
              @click.stop
              @change="setScore(biz.id, axis, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <p v-if="sceneRecordText(biz.note)" class="record">{{ sceneRecordText(biz.note) }}</p>
        </article>
        <p v-if="!doc.businesses.length" class="empty">先加一个业务，再按三高打分。</p>
        </div>
      </section>

      <section class="radar" aria-label="三高雷达图">
        <svg viewBox="0 0 640 560" role="img">
          <polygon v-for="(points, index) in rings" :key="index" :points="points" class="ring" />
          <polygon :points="passRing" class="gate" />
          <line v-for="(spoke, index) in spokes" :key="index" :x1="CX" :y1="CY" :x2="spoke.x" :y2="spoke.y" class="spoke" />
          <polygon
            v-for="biz in doc.businesses"
            :key="biz.id"
            :points="polygon(biz)"
            :fill="biz.color"
            :stroke="biz.stroke"
            :stroke-width="selectedId === biz.id ? 3 : 1.6"
            @click="selectedId = biz.id"
          />
          <text
            v-for="label in axisLabels"
            :key="label.id"
            :x="label.x"
            :y="label.y"
            text-anchor="middle"
            dominant-baseline="middle"
            class="axis"
          >{{ label.title }}</text>
          <text :x="CX + 14" :y="CY - (R * passScore) / SCENE_THREE_HIGH_MAX" class="gate-label">{{ passScore }}</text>
        </svg>
      </section>
    </div>

    <p class="verdict">{{ doc.verdict }}</p>
  </div>

  <Teleport to="body">
    <div v-if="isMaximized && noteBiz" class="pm-overlay" role="dialog" aria-modal="true" :aria-label="`${noteBiz.name}的判断`" @click.self="closeMaximize()">
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ noteBiz.name }} · 三高判断</h3>
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
            placeholder="写下这个业务为什么高或不高"
            :model-value="noteHtml"
            @update:model-value="writeNote"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; overflow: auto; padding: 18px 20px 24px; color: #202124; background: var(--cv-page, #f4f0e8); }
.top, .list-bar, .biz header, .biz label { display: flex; align-items: center; }
.top { justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.kicker, .top h2, .card h3, .card p, .verdict, .empty { margin: 0; }
.kicker { color: #a84562; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.top h2 { margin-top: 4px; font-size: 28px; letter-spacing: -0.02em; }
.score { margin: 0; padding: 8px 12px; border-radius: 999px; background: #fff; white-space: nowrap; }
.score strong { color: #125c3b; font-size: 18px; }
.criteria { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.card { min-height: 168px; padding: 16px 16px 14px; border-radius: 12px; background: #f7f1e6; }
.card h3 { color: #a84562; font-size: 14px; }
.headline { margin-top: 10px; font-size: 22px; font-weight: 750; line-height: 1.3; }
.card p:last-child { margin-top: 8px; color: #3c4043; font-size: 14px; line-height: 1.55; }
.work { display: grid; grid-template-columns: minmax(340px, 440px) minmax(320px, 1fr); gap: 16px; align-items: stretch; }
.list, .radar { background: #fffdf8; border: 1px solid rgba(62, 48, 28, 0.08); border-radius: 14px; box-sizing: border-box; }
.list { display: flex; flex-direction: column; height: 0; min-height: 100%; overflow: hidden; padding: 12px; }
.list-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.list-bar { justify-content: space-between; margin-bottom: 8px; font-weight: 700; }
.list-bar button, .biz header button { border: 1px solid #e4ddd2; background: #fff; border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.biz { margin-top: 8px; padding: 10px; border: 1px solid #f1ebe3; border-radius: 12px; }
.biz.selected { border-color: #1c4c7c; }
.biz.pass { background: #f4fbf6; }
.biz header { gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.biz header input { flex: 1; min-width: 0; border: none; background: transparent; font: inherit; font-weight: 700; }
.biz header strong { color: #5c574e; font-size: 12px; font-weight: 650; white-space: nowrap; }
.biz.pass header strong { color: #125c3b; }
.biz label { gap: 8px; margin-top: 6px; }
.biz label span { width: 5.5em; color: #5c574e; font-size: 13px; }
.biz label input[type='range'] { flex: 1; }
.num { width: 64px; border: 1px solid #e4ddd2; border-radius: 8px; padding: 4px 6px; font: inherit; }
.record { margin: 8px 0 0; color: #3c4043; font-size: 13px; line-height: 1.5; }
.radar { min-height: 420px; }
.radar svg { display: block; width: 100%; height: auto; }
.ring, .spoke { fill: none; stroke: #e4ddd2; stroke-width: 1; }
.gate { fill: none; stroke: #a84562; stroke-width: 1.4; stroke-dasharray: 5 4; }
.axis { fill: #3e3428; font-size: 16px; font-weight: 700; }
.gate-label { fill: #a84562; font-size: 12px; font-weight: 700; }
.verdict { margin-top: 14px; font-size: 16px; font-weight: 750; }
.empty { color: #8a8175; }
@media (max-width: 980px) {
  .criteria, .work { grid-template-columns: 1fr; }
  .list { height: auto; min-height: 0; overflow: visible; }
  .list-body { overflow: visible; }
  .top h2, .headline { font-size: 22px; }
}
</style>

<style>
.canvas-viewport .sheet.scene-high .card,
.canvas-viewport .sheet.scene-high .biz {
  background: #f7f1e6;
  border-color: transparent;
  box-shadow: none;
}
.canvas-viewport .sheet.scene-high .biz { background: #fff; }
.canvas-viewport .sheet.scene-high .biz.pass { background: #f4fbf6; }
.canvas-viewport .sheet.scene-high .card h3 {
  background: none;
  text-shadow: none;
  color: #a84562;
  padding: 0;
}
</style>
