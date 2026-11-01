<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type {
  RoiDecisionBlock,
  RoiDecisionDocumentJSON,
  RoiDecisionRow,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: RoiDecisionDocumentJSON
}>()

const documentStore = useDocumentStore()

/** Sync before first render so YModelBlock hosts have real ids (v-if). */
documentStore.ensureRoiDecisionBlocks()

const bgColor = computed(
  () => props.doc.theme.background.color || '#E6F7FF',
)

const byId = computed(() => {
  const map = new Map<string, RoiDecisionBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: string): RoiDecisionBlock | undefined {
  return byId.value.get(id)
}

function onDimensionInput(rowId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  documentStore.updateRoiDecisionDimension(rowId, value)
}

function onAddRow() {
  documentStore.addRoiDecisionRow()
  documentStore.ensureRoiDecisionBlocks()
}

function onRemoveRow(rowId: string) {
  documentStore.removeRoiDecisionRow(rowId)
  documentStore.ensureRoiDecisionBlocks()
}

function isTallRow(row: RoiDecisionRow, index: number): boolean {
  return index === 0 || row.dimension === '基础ROI'
}

onMounted(() => {
  documentStore.ensureRoiDecisionBlocks()
})
</script>

<template>
  <div
    class="rd-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="ROI决策评估"
  >
    <!-- Top matrix: 维度 | 收益项 | 成本项 -->
    <div class="rd-matrix" role="table" aria-label="维度收益成本矩阵">
      <div class="rd-matrix-headers" role="row">
        <div class="rd-col-header rd-col-header--dim" role="columnheader" :style="toneVars(0)">维度</div>
        <div class="rd-col-header" role="columnheader" :style="toneVars(1)">收益项</div>
        <div class="rd-col-header" role="columnheader" :style="toneVars(2)">成本项</div>
        <div class="rd-col-header rd-col-header--actions" aria-hidden="true" />
      </div>

      <div class="rd-matrix-body">
        <div
          v-for="(row, index) in doc.rows"
          :key="row.id"
          class="rd-row"
          :class="{ 'rd-row--tall': isTallRow(row, index) }"
          role="row"
        >
          <div class="rd-dim tbl-tone" role="cell" :style="toneVars(0)">
            <input
              class="rd-dim-input"
              type="text"
              :value="row.dimension"
              placeholder="维度…"
              maxlength="32"
              :aria-label="`维度：${row.dimension || '未命名'}`"
              @input="onDimensionInput(row.id, $event)"
              @click.stop
            />
          </div>
          <section
            v-if="block(row.benefitBlockId)"
            class="rd-cell tbl-tone"
            role="cell"
            :style="toneVars(1)"
          >
            <YModelBlockCard
              :block="block(row.benefitBlockId)!"
              hide-title
            />
          </section>
          <section
            v-else
            class="rd-cell rd-cell--empty tbl-tone"
            role="cell"
            :style="toneVars(1)"
          />
          <section
            v-if="block(row.costBlockId)"
            class="rd-cell tbl-tone"
            role="cell"
            :style="toneVars(2)"
          >
            <YModelBlockCard
              :block="block(row.costBlockId)!"
              hide-title
            />
          </section>
          <section
            v-else
            class="rd-cell rd-cell--empty tbl-tone"
            role="cell"
            :style="toneVars(2)"
          />
          <div class="rd-row-actions">
            <button
              type="button"
              class="rd-row-delete"
              title="删除本行"
              :disabled="doc.rows.length <= 1"
              @click="onRemoveRow(row.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <div class="rd-add-row">
        <button type="button" class="rd-add-btn" @click="onAddRow">
          + 添加行
        </button>
      </div>
    </div>

    <!-- Middle: 机会成本 | 时间窗口 -->
    <div class="rd-middle" role="group" aria-label="机会成本与时间窗口">
      <section class="rd-mid-col tbl-tone" :style="toneVars(3)" v-if="block('opportunityCost')">
        <header class="rd-mid-head">
          <h2 class="rd-mid-title">机会成本</h2>
        </header>
        <div class="rd-panel">
          <YModelBlockCard :block="block('opportunityCost')!" hide-title />
        </div>
      </section>
      <section class="rd-mid-col tbl-tone" :style="toneVars(4)" v-if="block('timeWindow')">
        <header class="rd-mid-head">
          <h2 class="rd-mid-title">时间窗口</h2>
        </header>
        <div class="rd-panel">
          <YModelBlockCard :block="block('timeWindow')!" hide-title />
        </div>
      </section>
    </div>

    <!-- Bottom: 最终结论 -->
    <section class="rd-conclusion tbl-tone" :style="toneVars(5)" v-if="block('conclusion')" aria-label="最终结论">
      <div class="rd-conclusion-label">最终结论</div>
      <div class="rd-panel rd-panel--conclusion">
        <YModelBlockCard :block="block('conclusion')!" hide-title />
      </div>
    </section>
  </div>
</template>

<style scoped>
.rd-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  /* Page scrolls when matrix rows (≥400px) + panels exceed the viewport */
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0;
  background: #e6f7ff;
  border: 1px solid #5f6368;
  border-radius: 2px;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
  scrollbar-gutter: stable;
}

.rd-canvas::-webkit-scrollbar {
  width: 8px;
}

.rd-canvas::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.35);
  border-radius: 999px;
}

/* ---- Top matrix ---- */
.rd-matrix {
  /* Never shrink matrix below row min-heights — let .rd-canvas page-scroll */
  flex: 1 0 auto;
  min-height: min-content;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #5f6368;
  overflow: visible;
}

.rd-matrix-headers {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(96px, 0.7fr) minmax(0, 1.4fr) minmax(0, 1.4fr) 36px;
  background: transparent;
  border-bottom: 1px solid #5f6368;
}

.rd-col-header {
  padding: 10px 12px;
  text-align: center;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #fff;
  background: var(--tbl-header, #2a649f);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  border-right: 1px solid #5f6368;
  letter-spacing: 0.04em;
  line-height: 1.3;
}

.rd-col-header--dim {
  text-align: center;
}

.rd-col-header--actions {
  border-right: none;
  padding: 0;
  background: #e8eaed;
  text-shadow: none;
}

.rd-matrix-body {
  flex: 0 0 auto;
  min-height: min-content;
  overflow: visible;
}

.rd-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.7fr) minmax(0, 1.4fr) minmax(0, 1.4fr) 36px;
  /* Align with global panel min-height (≥400px), including newly added rows */
  min-height: 400px;
  border-bottom: 1px solid #5f6368;
  background: transparent;
}

.rd-row--tall {
  min-height: 400px;
}

.rd-row:last-child {
  border-bottom: none;
}

.rd-dim {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 10px;
  box-sizing: border-box;
  border-right: 1px solid #5f6368;
  background: var(--tbl-body, #e6f7ff);
}

.rd-dim-input {
  width: 100%;
  max-width: 100%;
  border: none;
  border-bottom: 1.5px solid transparent;
  background: transparent;
  text-align: center;
  font-size: clamp(13px, 1.35vw, 16px);
  font-weight: 700;
  color: var(--tbl-topic, #111111);
  padding: 2px 2px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.rd-dim-input:hover {
  border-bottom-color: #90caf9;
}

.rd-dim-input:focus {
  border-bottom-color: #00bfff;
}

.rd-dim-input::placeholder {
  color: #90a4ae;
  font-weight: 600;
}

.rd-cell {
  min-width: 0;
  min-height: inherit;
  padding: 6px 8px;
  box-sizing: border-box;
  border-right: 1px solid #5f6368;
  display: flex;
  flex-direction: column;
  background: var(--tbl-body, #e6f7ff);
}

.rd-cell--empty {
  background: var(--tbl-body, #e6f7ff);
}

.rd-cell :deep(.ym-block) {
  flex: 1;
  /* Match .rd-panel :deep(.ym-block) global panel min-height */
  min-height: 400px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.rd-cell :deep(.ym-block-toolbar) {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.rd-cell:hover :deep(.ym-block-toolbar),
.rd-cell :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.rd-cell :deep(.ProseMirror) {
  text-align: left;
  font-size: 14px;
  line-height: 1.65;
  color: #202124;
}

.rd-row-actions {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
  background: #f4f5f6;
}

.rd-row-delete {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9aa0a6;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.rd-row-delete:hover:not(:disabled) {
  background: #fce8e6;
  color: #d93025;
}

.rd-row-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.rd-add-row {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 12px;
  border-top: 1px dashed #90caf9;
  background: #f0faff;
}

.rd-add-btn {
  border: 1px dashed #64b5f6;
  border-radius: 6px;
  background: #fff;
  color: #0288d1;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 16px;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.rd-add-btn:hover {
  background: #e1f5fe;
  border-color: #00bfff;
  color: #01579b;
}

/* ---- Middle section ---- */
.rd-middle {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
  border-bottom: 1px solid #5f6368;
}

.rd-mid-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--tbl-body, #e6f7ff);
  border-right: 1px solid #5f6368;
}

.rd-mid-col:last-child {
  border-right: none;
}

.rd-mid-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 14px;
  box-sizing: border-box;
  background: var(--tbl-header, #2a649f);
  border-bottom: 1px solid #5f6368;
  color: #fff;
}

.rd-mid-title {
  margin: 0;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-align: center;
}

.rd-panel {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  background: transparent;
  padding: 10px 12px 8px;
  box-sizing: border-box;
  overflow: auto;
}

.rd-panel :deep(.ym-block) {
  flex: 1;
  min-height: 400px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.rd-panel :deep(.ProseMirror) {
  text-align: left;
  font-size: 14px;
  line-height: 1.65;
  color: #202124;
}

.rd-panel :deep(.ProseMirror p) {
  margin: 0.35em 0;
}

/* ---- Bottom conclusion ---- */
.rd-conclusion {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--tbl-body, #e6f7ff);
}

.rd-conclusion-label {
  flex-shrink: 0;
  padding: 10px 14px;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #fff;
  background: var(--tbl-header, #a84562);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-align: left;
}

.rd-panel--conclusion {
  min-height: 400px;
}

@media (max-width: 720px) {
  .rd-matrix-headers,
  .rd-row {
    grid-template-columns: 1fr;
  }

  .rd-col-header--actions,
  .rd-row-actions {
    display: none;
  }

  .rd-dim,
  .rd-cell {
    border-right: none;
    border-bottom: 1px solid #90caf9;
  }

  .rd-row {
    min-height: 0;
  }

  .rd-row--tall {
    min-height: 0;
  }

  .rd-dim {
    min-height: 48px;
  }

  .rd-cell {
    min-height: 200px;
  }

  .rd-middle {
    grid-template-columns: 1fr;
  }

  .rd-mid-col {
    border-right: none;
    border-bottom: 1px solid #5f6368;
  }
}
</style>
