<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  DemandTriangleAxisId,
  DemandTriangleDirection,
  DemandTriangleDocumentJSON,
  DemandTriangleNotesBlock,
  DemandTriangleScores,
} from '../../types/canvas'
import { demandTriangleNotesBlockId } from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import RichTextItem from '../RichTextItem.vue'
import PanelAttachments from './PanelAttachments.vue'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: DemandTriangleDocumentJSON
}>()

const selection = useSelectionStore()
const documentStore = useDocumentStore()

// Sync notes blocks before first render (v-if hosts need defined ids).
documentStore.ensureDemandTriangleNotesBlocks()

const maximizeKey = computed(() => panelMaximizeKey('demand', 'legend'))
const { isMaximized, toggleMaximize, closeMaximize } =
  usePanelMaximize(maximizeKey)

const bgColor = computed(
  () => props.doc.theme.background.color || '#f4f5f7',
)

const legendBlock = computed(() =>
  props.doc.blocks.find((b) => b.id === 'legend'),
)

const legendItems = computed(() => legendBlock.value?.items ?? [])

const directionById = computed(() => {
  const map = new Map<string, DemandTriangleDirection>()
  for (const d of props.doc.directions) map.set(d.id, d)
  return map
})

const notesBlocks = computed(() => {
  const list: DemandTriangleNotesBlock[] = []
  for (const b of props.doc.blocks) {
    if (b.id !== 'legend' && String(b.id).startsWith('notes:')) {
      list.push(b as DemandTriangleNotesBlock)
    }
  }
  return list
})

function notesBlockOf(dirId: string): DemandTriangleNotesBlock | undefined {
  const id = demandTriangleNotesBlockId(dirId)
  return props.doc.blocks.find((b) => b.id === id) as
    | DemandTriangleNotesBlock
    | undefined
}

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
    documentStore.ensureDemandTriangleNotesBlocks()
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

/* ---- 备注：每方向 notes:<dirId> → 全局 panel-maximize 全屏 RTE ---- */
const activeNotesDirId = ref<string | null>(null)

const activeNotesMaximizeKey = computed(() => {
  const dirId = activeNotesDirId.value
  if (!dirId) return 'demand-notes:idle'
  const b = notesBlockOf(dirId)
  return b ? panelMaximizeKey('block', b.id) : 'demand-notes:idle'
})

const { maximizedPanelKey } = usePanelMaximize(activeNotesMaximizeKey)

function openDirectionNotes(dirId: string, event?: Event) {
  event?.stopPropagation()
  event?.preventDefault()
  documentStore.ensureDemandTriangleNotesBlocks()
  const b = notesBlockOf(dirId)
  if (!b) return
  activeNotesDirId.value = dirId
  selection.selectBlock(b.id)
  const key = panelMaximizeKey('block', b.id)
  nextTick(() => {
    maximizedPanelKey.value = key
  })
}

watch(maximizedPanelKey, (key) => {
  if (!key && activeNotesDirId.value) {
    activeNotesDirId.value = null
  }
})

onMounted(() => {
  documentStore.ensureDemandTriangleNotesBlocks()
})

onBeforeUnmount(() => {
  if (
    activeNotesDirId.value &&
    maximizedPanelKey.value === activeNotesMaximizeKey.value
  ) {
    maximizedPanelKey.value = null
  }
})

/* ---- radar geometry (viewBox 720×640，给顶点标签留边) ---- */
const CX = 360
const CY = 340
const R = 220

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

/**
 * 轴标题 + 四级刻度：贴着顶点外侧排版（对齐参考图）。
 * levels 外→内；标题在 levels 下方；装饰线在标题上方。
 */
const vertexPanels = computed(() => {
  const u = props.doc.axes.universality
  const f = props.doc.axes.frequency
  const r = props.doc.axes.rigidity
  const [tx, ty] = polar(0, R)
  const [rx, ry] = polar(1, R)
  const [lx, ly] = polar(2, R)
  return [
    {
      key: 'universality',
      axis: u,
      side: 'top' as const,
      // 百分比相对 viewBox，供 HTML 覆盖层使用
      leftPct: (tx / 720) * 100,
      topPct: (ty / 640) * 100,
    },
    {
      key: 'rigidity',
      axis: r,
      side: 'right' as const,
      leftPct: (rx / 720) * 100,
      topPct: (ry / 640) * 100,
    },
    {
      key: 'frequency',
      axis: f,
      side: 'left' as const,
      leftPct: (lx / 720) * 100,
      topPct: (ly / 640) * 100,
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
            <div class="legend-row-actions">
              <button
                type="button"
                class="legend-notes-btn"
                title="备注"
                @click="openDirectionNotes(item.id, $event)"
              >
                备注
              </button>
              <button
                v-if="itemSelected(item.id)"
                type="button"
                class="legend-remove"
                title="删除"
                @click="onRemoveItem($event, item.id)"
              >
                ×
              </button>
            </div>
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
                <div class="legend-row-actions">
                  <button
                    type="button"
                    class="legend-notes-btn"
                    title="备注"
                    @click="openDirectionNotes(item.id, $event)"
                  >
                    备注
                  </button>
                  <button
                    v-if="itemSelected(item.id)"
                    type="button"
                    class="legend-remove"
                    title="删除"
                    @click="onRemoveItem($event, item.id)"
                  >
                    ×
                  </button>
                </div>
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
      <div class="dt-radar-wrap">
        <svg
          class="dt-radar"
          viewBox="0 0 720 640"
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
        </svg>

        <!-- 顶点刻度面板：贴着三角边缘，非整屏漂浮 -->
        <div
          v-for="vp in vertexPanels"
          :key="vp.key"
          class="axis-panel"
          :class="`axis-panel--${vp.side}`"
          :style="{
            left: vp.leftPct + '%',
            top: vp.topPct + '%',
          }"
        >
          <div class="axis-levels">
            <div
              v-for="(lv, i) in vp.axis.levels"
              :key="`${vp.key}-lv-${i}`"
              class="axis-level-row"
            >
              <strong>{{ lv.label }}</strong>
              <span class="axis-level-sep">：</span>
              <span>{{ lv.detail }}</span>
            </div>
          </div>
          <div class="axis-deco" aria-hidden="true">
            <span class="axis-deco-line" />
            <span class="axis-deco-dot" />
          </div>
          <div class="axis-title">{{ vp.axis.title }}</div>
        </div>
      </div>
    </div>

    <!--
      隐藏挂载各方向备注 YModelBlock：点击「备注」写入全局 maximizedPanelKey，
      由块内 Teleport .pm-overlay 铺满文档视口（approach B，v-if 避免 undefined block.id）。
    -->
    <div class="dt-notes-host" aria-hidden="true">
      <template v-for="block in notesBlocks" :key="block.id">
        <YModelBlockCard
          v-if="block"
          :block="block"
          hide-title
        />
      </template>
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
  grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
  grid-template-rows: 1fr;
  gap: 8px 4px;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
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
  column-gap: 8px;
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

.legend-row-actions {
  grid-column: 3;
  grid-row: 1;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.legend-notes-btn {
  height: 22px;
  padding: 0 7px;
  border: 1px solid #dadce0;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.92);
  color: #5f6368;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
}

.legend-notes-btn:hover {
  border-color: #1a73e8;
  color: #1a73e8;
  background: #e8f0fe;
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

.dt-radar-wrap {
  position: relative;
  width: min(100%, 780px);
  height: min(100%, 700px);
  max-height: 100%;
  aspect-ratio: 720 / 640;
}

.dt-radar {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* 顶点标签：锚在顶点坐标，按侧面偏移贴边 */
.axis-panel {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 210px;
}

.axis-panel--top {
  transform: translate(-18%, calc(-100% - 10px));
  align-items: flex-start;
}

.axis-panel--left {
  transform: translate(calc(-100% - 8px), -72%);
  align-items: flex-start;
  text-align: left;
}

.axis-panel--right {
  transform: translate(8px, -72%);
  align-items: flex-start;
  text-align: left;
}

.axis-levels {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.axis-level-row {
  display: flex;
  align-items: baseline;
  gap: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: #9aa0a6;
  white-space: nowrap;
}

.axis-level-row strong {
  font-weight: 700;
  color: #5f6368;
}

.axis-level-sep {
  color: #9aa0a6;
  font-weight: 500;
}

.axis-deco {
  display: flex;
  align-items: center;
  gap: 0;
  width: 78px;
  margin-top: 2px;
  opacity: 0.7;
}

.axis-panel--left .axis-deco {
  flex-direction: row-reverse;
}

.axis-deco-line {
  flex: 1;
  height: 1px;
  background: #9aa0a6;
}

.axis-deco-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.2px solid #9aa0a6;
  box-sizing: border-box;
  flex-shrink: 0;
  background: transparent;
}

.axis-title {
  font-size: 20px;
  font-weight: 800;
  color: #3c4043;
  letter-spacing: 0.06em;
  line-height: 1.2;
}

.dt-notes-host {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
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

  .axis-level-row {
    font-size: 11px;
  }

  .axis-title {
    font-size: 16px;
  }
}
</style>
