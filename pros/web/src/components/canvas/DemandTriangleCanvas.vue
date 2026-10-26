<script setup lang="ts">
import { computed } from 'vue'
import type {
  DemandTriangleAxisId,
  DemandTriangleDirection,
  DemandTriangleDocumentJSON,
  DemandTriangleScores,
} from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import RichTextItem from '../RichTextItem.vue'
import PanelAttachments from './PanelAttachments.vue'

const props = defineProps<{
  doc: DemandTriangleDocumentJSON
}>()

const selection = useSelectionStore()
const documentStore = useDocumentStore()

const maximizeKey = computed(() => panelMaximizeKey('demand', 'legend'))
const { isMaximized, toggleMaximize, closeMaximize } =
  usePanelMaximize(maximizeKey)

const bgColor = computed(
  () => props.doc.theme.background.color || '#f4f5f7',
)

const legendBlock = computed(() => props.doc.blocks.find((b) => b.id === 'legend'))

const legendItems = computed(() => legendBlock.value?.items ?? [])

const directionById = computed(() => {
  const map = new Map<string, DemandTriangleDirection>()
  for (const d of props.doc.directions) map.set(d.id, d)
  return map
})

const PALETTE = [
  { color: 'rgba(212, 175, 55, 0.38)', stroke: '#c9a227' },
  { color: 'rgba(129, 199, 132, 0.4)', stroke: '#66bb6a' },
  { color: 'rgba(77, 182, 172, 0.42)', stroke: '#26a69a' },
  { color: 'rgba(100, 181, 246, 0.4)', stroke: '#42a5f5' },
  { color: 'rgba(240, 152, 120, 0.4)', stroke: '#e57373' },
]

function dirOf(id: string): DemandTriangleDirection {
  return (
    directionById.value.get(id) ?? {
      id,
      color: PALETTE[0].color,
      stroke: PALETTE[0].stroke,
      scores: { universality: 0.5, frequency: 0.5, rigidity: 0.5 },
    }
  )
}

function itemSelected(id: string) {
  return (
    selection.kind === 'item' &&
    selection.itemContainerKind === 'block' &&
    selection.blockId === 'legend' &&
    selection.itemId === id
  )
}

function onSelectLegend() {
  selection.selectBlock('legend')
}

function onSelectItem(event: Event, id: string) {
  event.stopPropagation()
  selection.selectBlockItem('legend', id)
}

function onScoreInput(
  id: string,
  axis: DemandTriangleAxisId,
  event: Event,
) {
  const el = event.target as HTMLInputElement
  const v = Math.min(1, Math.max(0, Number(el.value)))
  documentStore.updateDemandDirectionScores(id, { [axis]: v })
}

function onAddDirection(event: MouseEvent) {
  event.stopPropagation()
  const n = legendItems.value.length
  const palette = PALETTE[n % PALETTE.length]
  const item = documentStore.addBlockItem('legend', {
    text: `第${['一', '二', '三', '四', '五', '六'][n] ?? n + 1}个业务方向`,
    style: { color: '#3c4043', fontSize: 14, fontWeight: '600' },
  })
  if (item) {
    documentStore.ensureDemandDirection(item.id, {
      color: palette.color,
      stroke: palette.stroke,
      scores: { universality: 0.55, frequency: 0.5, rigidity: 0.48 },
    })
    selection.selectBlockItem('legend', item.id)
  }
}

function onRemoveItem(event: MouseEvent, id: string) {
  event.stopPropagation()
  documentStore.removeBlockItem('legend', id)
  documentStore.removeDemandDirection(id)
  if (
    selection.kind === 'item' &&
    selection.itemContainerKind === 'block' &&
    selection.itemId === id
  ) {
    selection.selectBlock('legend')
  }
}

function onToggleMaximize(event: MouseEvent) {
  event.stopPropagation()
  if (!isMaximized.value) {
    selection.selectBlock('legend')
  }
  toggleMaximize()
}

function onCloseMaximize(event?: Event) {
  event?.stopPropagation()
  closeMaximize()
}

/* ---- radar geometry (viewBox 640×580) ---- */
const CX = 330
const CY = 318
const R = 210

/** 顶 / 右下 / 左下 */
const AXIS_ORDER: DemandTriangleAxisId[] = [
  'universality',
  'rigidity',
  'frequency',
]

function polar(i: number, r: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

function ringPoints(r: number): string {
  return [0, 1, 2].map((i) => polar(i, r).join(',')).join(' ')
}

const rings = [1, 0.75, 0.5, 0.25].map((t) => ringPoints(R * t))

const axisLines = [0, 1, 2].map((i) => {
  const [x, y] = polar(i, R)
  return { x1: CX, y1: CY, x2: x, y2: y }
})

function scorePolygon(scores: DemandTriangleScores): string {
  return AXIS_ORDER.map((axis, i) => {
    const t = Math.min(1, Math.max(0.08, scores[axis]))
    return polar(i, R * t).join(',')
  }).join(' ')
}

const overlays = computed(() =>
  legendItems.value.map((item) => {
    const d = dirOf(item.id)
    return {
      id: item.id,
      fill: d.color,
      stroke: d.stroke,
      points: scorePolygon(d.scores),
    }
  }),
)

const vertexLabels = computed(() => {
  const u = props.doc.axes.universality
  const f = props.doc.axes.frequency
  const r = props.doc.axes.rigidity
  const [tx, ty] = polar(0, R)
  const [rx, ry] = polar(1, R)
  const [lx, ly] = polar(2, R)
  return [
    {
      axis: u,
      x: tx,
      y: ty,
      anchor: 'middle' as const,
      titleDy: -28,
      scaleSide: 'top' as const,
    },
    {
      axis: r,
      x: rx,
      y: ry,
      anchor: 'start' as const,
      titleDy: 28,
      scaleSide: 'right' as const,
    },
    {
      axis: f,
      x: lx,
      y: ly,
      anchor: 'end' as const,
      titleDy: 28,
      scaleSide: 'left' as const,
    },
  ]
})
</script>

<template>
  <div class="dt-canvas" :style="{ backgroundColor: bgColor }">
    <!-- 左上图例（可编辑面板） -->
    <aside
      class="dt-legend"
      :class="{ 'is-source-max': isMaximized }"
      @click.stop="onSelectLegend"
    >
      <div class="legend-toolbar">
        <span class="legend-toolbar-label">业务方向</span>
        <div class="legend-toolbar-actions">
          <button
            type="button"
            class="legend-add"
            title="新增业务方向"
            @click="onAddDirection"
          >
            +
          </button>
          <button
            type="button"
            class="pm-max-btn"
            title="最大化"
            aria-label="最大化"
            @click="onToggleMaximize"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <rect
                x="2.5"
                y="2.5"
                width="11"
                height="11"
                rx="1.2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              />
            </svg>
          </button>
        </div>
      </div>

      <template v-if="!isMaximized">
        <ul class="legend-list">
          <li
            v-for="item in legendItems"
            :key="item.id"
            class="legend-row"
            :class="{ selected: itemSelected(item.id) }"
            @click="onSelectItem($event, item.id)"
          >
            <span
              class="legend-dot"
              :style="{ background: dirOf(item.id).stroke }"
            />
            <RichTextItem
              class="legend-name"
              :model-value="item.text"
              :selected="itemSelected(item.id)"
              :legacy-style="item.style ?? { color: '#3c4043', fontSize: 14, fontWeight: '600' }"
              placeholder="业务方向…"
              @update:model-value="(v) => documentStore.updateBlockItem('legend', item.id, { text: v })"
              @focus="() => selection.selectBlockItem('legend', item.id)"
            />
            <div
              v-if="itemSelected(item.id)"
              class="legend-scores"
              @click.stop
            >
              <label class="score-chip" title="普遍性">
                <span>普</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  :value="dirOf(item.id).scores.universality"
                  @input="onScoreInput(item.id, 'universality', $event)"
                />
              </label>
              <label class="score-chip" title="频次">
                <span>频</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  :value="dirOf(item.id).scores.frequency"
                  @input="onScoreInput(item.id, 'frequency', $event)"
                />
              </label>
              <label class="score-chip" title="刚性">
                <span>刚</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  :value="dirOf(item.id).scores.rigidity"
                  @input="onScoreInput(item.id, 'rigidity', $event)"
                />
              </label>
            </div>
            <button
              v-if="itemSelected(item.id)"
              type="button"
              class="legend-remove"
              title="删除"
              @click="onRemoveItem($event, item.id)"
            >
              ×
            </button>
          </li>
        </ul>
      </template>
      <p v-else class="legend-max-hint">正在放大编辑…</p>

      <PanelAttachments
        v-if="!isMaximized"
        :panel-id="maximizeKey"
        compact
      />
    </aside>

    <Teleport to="body">
      <div
        v-if="isMaximized"
        class="pm-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="业务方向放大编辑"
        @click.self="onCloseMaximize"
      >
        <div class="pm-card" @click.stop>
          <div class="pm-header">
            <h3 class="pm-title">业务方向</h3>
            <div class="pm-actions">
              <button
                type="button"
                class="pm-icon-btn"
                title="新增业务方向"
                @click="onAddDirection"
              >
                +
              </button>
              <button
                type="button"
                class="pm-icon-btn"
                title="还原"
                aria-label="还原"
                @click="onCloseMaximize"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <rect
                    x="4"
                    y="4"
                    width="9"
                    height="9"
                    rx="1"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                  <path
                    d="M3 10.5V3.5h7"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="pm-icon-btn pm-close"
                title="关闭"
                aria-label="关闭"
                @click="onCloseMaximize"
              >
                ×
              </button>
            </div>
          </div>
          <div class="pm-body">
            <ul class="legend-list legend-list-max">
              <li
                v-for="item in legendItems"
                :key="item.id"
                class="legend-row"
                :class="{ selected: itemSelected(item.id) }"
                @click="onSelectItem($event, item.id)"
              >
                <span
                  class="legend-dot"
                  :style="{ background: dirOf(item.id).stroke }"
                />
                <RichTextItem
                  class="legend-name"
                  :model-value="item.text"
                  :selected="itemSelected(item.id)"
                  :legacy-style="item.style ?? { color: '#3c4043', fontSize: 14, fontWeight: '600' }"
                  placeholder="业务方向…"
                  @update:model-value="(v) => documentStore.updateBlockItem('legend', item.id, { text: v })"
                  @focus="() => selection.selectBlockItem('legend', item.id)"
                />
                <div
                  v-if="itemSelected(item.id)"
                  class="legend-scores"
                  @click.stop
                >
                  <label class="score-chip" title="普遍性">
                    <span>普</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      :value="dirOf(item.id).scores.universality"
                      @input="onScoreInput(item.id, 'universality', $event)"
                    />
                  </label>
                  <label class="score-chip" title="频次">
                    <span>频</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      :value="dirOf(item.id).scores.frequency"
                      @input="onScoreInput(item.id, 'frequency', $event)"
                    />
                  </label>
                  <label class="score-chip" title="刚性">
                    <span>刚</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      :value="dirOf(item.id).scores.rigidity"
                      @input="onScoreInput(item.id, 'rigidity', $event)"
                    />
                  </label>
                </div>
                <button
                  v-if="itemSelected(item.id)"
                  type="button"
                  class="legend-remove"
                  title="删除"
                  @click="onRemoveItem($event, item.id)"
                >
                  ×
                </button>
              </li>
            </ul>
            <p v-if="legendItems.length === 0" class="pm-empty">点击 + 添加业务方向</p>
          </div>

          <PanelAttachments :panel-id="maximizeKey" />
        </div>
      </div>
    </Teleport>

    <!-- 雷达主体 -->
    <div class="dt-stage">
      <svg
        class="dt-radar"
        viewBox="0 0 640 580"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="需求评估三角形"
      >
        <!-- 同心三角网格 -->
        <polygon
          v-for="(pts, idx) in rings"
          :key="`ring-${idx}`"
          :points="pts"
          fill="none"
          :stroke="idx === 0 ? '#9aa0a6' : '#c5c9ce'"
          :stroke-width="idx === 0 ? 2.2 : 1.4"
          opacity="0.85"
        />

        <!-- 中心到顶点轴线 -->
        <line
          v-for="(ln, i) in axisLines"
          :key="`axis-${i}`"
          :x1="ln.x1"
          :y1="ln.y1"
          :x2="ln.x2"
          :y2="ln.y2"
          stroke="#b0b4b8"
          stroke-width="1.2"
          stroke-dasharray="4 3"
          opacity="0.7"
        />

        <!-- 业务方向叠绘 -->
        <polygon
          v-for="ov in overlays"
          :key="ov.id"
          :points="ov.points"
          :fill="ov.fill"
          :stroke="ov.stroke"
          stroke-width="1.8"
          stroke-linejoin="round"
        />

        <!-- 顶点装饰线 + 空心圆 -->
        <g v-for="(v, i) in vertexLabels" :key="`deco-${i}`" opacity="0.55">
          <template v-if="v.scaleSide === 'top'">
            <line
              :x1="v.x - 36"
              :y1="v.y - 14"
              :x2="v.x + 36"
              :y2="v.y - 14"
              stroke="#9aa0a6"
              stroke-width="1"
            />
            <circle
              :cx="v.x + 40"
              :cy="v.y - 14"
              r="3.5"
              fill="none"
              stroke="#9aa0a6"
              stroke-width="1.2"
            />
          </template>
          <template v-else-if="v.scaleSide === 'right'">
            <line
              :x1="v.x + 10"
              :y1="v.y + 8"
              :x2="v.x + 72"
              :y2="v.y + 8"
              stroke="#9aa0a6"
              stroke-width="1"
            />
            <circle
              :cx="v.x + 76"
              :cy="v.y + 8"
              r="3.5"
              fill="none"
              stroke="#9aa0a6"
              stroke-width="1.2"
            />
          </template>
          <template v-else>
            <line
              :x1="v.x - 10"
              :y1="v.y + 8"
              :x2="v.x - 72"
              :y2="v.y + 8"
              stroke="#9aa0a6"
              stroke-width="1"
            />
            <circle
              :cx="v.x - 76"
              :cy="v.y + 8"
              r="3.5"
              fill="none"
              stroke="#9aa0a6"
              stroke-width="1.2"
            />
          </template>
        </g>

        <!-- 轴标题 -->
        <text
          v-for="(v, i) in vertexLabels"
          :key="`title-${i}`"
          :x="v.x"
          :y="v.y + v.titleDy"
          :text-anchor="v.anchor"
          class="axis-title"
        >
          {{ v.axis.title }}
        </text>
      </svg>

      <!-- HTML 刻度说明（比 SVG 文本更易排版） -->
      <div class="scale-panel scale-top">
        <div
          v-for="(lv, i) in doc.axes.universality.levels"
          :key="`u-${i}`"
          class="scale-row"
        >
          <strong>{{ lv.label }}</strong>
          <span>{{ lv.detail }}</span>
        </div>
      </div>
      <div class="scale-panel scale-left">
        <div
          v-for="(lv, i) in doc.axes.frequency.levels"
          :key="`f-${i}`"
          class="scale-row"
        >
          <strong>{{ lv.label }}</strong>
          <span>{{ lv.detail }}</span>
        </div>
      </div>
      <div class="scale-panel scale-right">
        <div
          v-for="(lv, i) in doc.axes.rigidity.levels"
          :key="`r-${i}`"
          class="scale-row"
        >
          <strong>{{ lv.label }}</strong>
          <span>{{ lv.detail }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dt-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 18px 20px 20px;
  display: grid;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  grid-template-rows: 1fr;
  gap: 8px 4px;
}

.dt-legend {
  position: relative;
  z-index: 3;
  align-self: start;
  justify-self: start;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.55);
  border: 1.5px dashed #c5c9ce;
  border-radius: 10px;
  box-shadow: none;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.dt-legend.is-source-max {
  border-color: rgba(26, 115, 232, 0.45);
  background: rgba(232, 240, 254, 0.45);
}

.legend-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.legend-toolbar-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: #5f6368;
  letter-spacing: 0.02em;
}

.legend-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.legend-max-hint {
  margin: 0;
  padding: 10px 2px;
  font-size: 12px;
  color: #1a73e8;
  font-weight: 550;
  line-height: 1.45;
}

.legend-list-max {
  gap: 10px;
}

.legend-list-max .legend-row {
  padding: 8px 8px 8px 4px;
}

.legend-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-row {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 10px;
  row-gap: 4px;
  align-items: center;
  padding: 4px 4px 4px 2px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}

.legend-row.selected {
  border-color: rgba(26, 115, 232, 0.55);
  background: rgba(232, 240, 254, 0.65);
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  grid-row: 1;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.legend-name {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  line-height: 1.35;
  padding: 2px 0;
}

.legend-scores {
  grid-column: 2 / 4;
  grid-row: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.score-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 650;
  color: #80868b;
}

.score-chip input[type='range'] {
  width: 56px;
  height: 4px;
  accent-color: #5f6368;
  cursor: pointer;
}

.legend-remove {
  grid-column: 3;
  grid-row: 1;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #d93025;
  font-size: 15px;
  cursor: pointer;
  line-height: 1;
}

.legend-remove:hover {
  background: #fce8e6;
}

.legend-add {
  align-self: flex-start;
  width: 24px;
  height: 24px;
  border: 1px dashed #9aa0a6;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.8);
  color: #5f6368;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.legend-add:hover {
  border-color: #1a73e8;
  color: #1a73e8;
  background: #e8f0fe;
}

.dt-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dt-radar {
  width: min(100%, 720px);
  height: min(100%, 640px);
  max-height: 100%;
  overflow: visible;
}

.axis-title {
  fill: #3c4043;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.scale-panel {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: none;
  z-index: 2;
}

.scale-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  line-height: 1.45;
  color: #9aa0a6;
}

.scale-row strong {
  font-weight: 700;
  color: #5f6368;
  min-width: 3.4em;
}

.scale-top {
  top: 1.5%;
  left: 54%;
  transform: none;
  text-align: left;
}

.scale-left {
  left: 1%;
  bottom: 6%;
  align-items: flex-start;
}

.scale-right {
  right: 1%;
  bottom: 6%;
  align-items: flex-start;
}

@media (max-width: 960px) {
  .dt-canvas {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .dt-legend {
    max-width: 100%;
  }

  .dt-stage {
    min-height: 420px;
  }

  .scale-panel {
    font-size: 11px;
  }

  .axis-title {
    font-size: 18px;
  }
}

</style>
