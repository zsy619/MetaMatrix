<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  RoiDecisionBlock,
  RoiDecisionChoice,
  RoiDecisionDocumentJSON,
  RoiDecisionRow,
  RoiDecisionVerdict,
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

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const VERDICTS: Array<{ id: RoiDecisionVerdict; label: string }> = [
  { id: 'worth', label: '划算' },
  { id: 'even', label: '持平' },
  { id: 'poor', label: '不划算' },
]

const CHOICES: Array<{ id: RoiDecisionChoice; label: string }> = [
  { id: 'do', label: '去做' },
  { id: 'validate', label: '先小范围验证' },
  { id: 'stop', label: '不做' },
]

const byId = computed(() => {
  const map = new Map<string, RoiDecisionBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

const readout = computed(() => {
  const rows = props.doc.rows
  const judged = rows.filter((row) => row.verdict === 'worth' || row.verdict === 'even' || row.verdict === 'poor').length
  return `${rows.length} 个维度，${judged} 个已判断`
})

function block(id: string): RoiDecisionBlock | undefined {
  return byId.value.get(id)
}

function onDecisionInput(event: Event) {
  documentStore.updateRoiDecisionDecision((event.target as HTMLInputElement).value)
}

function onDimensionInput(rowId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  documentStore.updateRoiDecisionDimension(rowId, value)
}

function onVerdict(rowId: string, verdict: RoiDecisionVerdict) {
  documentStore.updateRoiDecisionVerdict(rowId, verdict)
}

function onChoice(choice: RoiDecisionChoice) {
  documentStore.updateRoiDecisionChoice(choice)
}

function verdictLabel(row: RoiDecisionRow): string {
  return VERDICTS.find((item) => item.id === row.verdict)?.label || '还没判断'
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
    :style="chrome"
    aria-label="ROI决策评估"
  >
    <header class="rd-decision">
      <label class="rd-decision-field">
        <span class="rd-decision-kicker">这次要决定</span>
        <input
          class="rd-decision-input"
          type="text"
          :value="doc.decision || ''"
          maxlength="80"
          placeholder="例如：要不要做这个功能"
          aria-label="这次要决定的事"
          @input="onDecisionInput"
        />
      </label>
      <p class="rd-readout">{{ readout }}</p>
    </header>

    <!-- Top matrix: 维度 | 收益项 | 成本项 | 判断 | 操作 -->
    <div class="rd-matrix" role="table" aria-label="维度收益成本矩阵">
      <div class="rd-matrix-headers" role="row">
        <div class="rd-col-header rd-col-header--dim" role="columnheader" :style="toneVars(0)">
          <span>维度</span>
          <small>从哪个角度看</small>
        </div>
        <div class="rd-col-header" role="columnheader" :style="toneVars(1)">
          <span>收益项</span>
          <small>得到什么</small>
        </div>
        <div class="rd-col-header" role="columnheader" :style="toneVars(2)">
          <span>成本项</span>
          <small>付出什么</small>
        </div>
        <div class="rd-col-header rd-col-header--judge" role="columnheader">
          <span>判断</span>
          <small>划不划算</small>
        </div>
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
            <p class="rd-cell-label">收益项 · 得到什么</p>
            <YModelBlockCard
              :block="block(row.benefitBlockId)!"
              hide-title
              placeholder="写具体结果"
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
            <p class="rd-cell-label">成本项 · 付出什么</p>
            <YModelBlockCard
              :block="block(row.costBlockId)!"
              hide-title
              placeholder="时间、钱、人力"
            />
          </section>
          <section
            v-else
            class="rd-cell rd-cell--empty tbl-tone"
            role="cell"
            :style="toneVars(2)"
          />
          <div class="rd-judge" role="cell">
            <p class="rd-cell-label">判断</p>
            <div class="rd-verdicts" role="group" :aria-label="`${row.dimension || '未命名'}的判断，当前${verdictLabel(row)}`">
              <button
                v-for="item in VERDICTS"
                :key="item.id"
                type="button"
                class="rd-verdict"
                :class="`rd-verdict--${item.id}`"
                :aria-pressed="row.verdict === item.id"
                @click="onVerdict(row.id, item.id)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="rd-row-actions">
            <button
              type="button"
              class="rd-row-delete"
              title="删除本行"
              aria-label="删除本行"
              :disabled="doc.rows.length <= 1"
              @click="onRemoveRow(row.id)"
            >
              <span class="rd-row-delete-mark" aria-hidden="true">×</span>
              <span class="rd-row-delete-text">删除本行</span>
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
          <p class="rd-mid-hint">不做的话，这些资源会用在哪</p>
        </header>
        <div class="rd-panel">
          <YModelBlockCard
            :block="block('opportunityCost')!"
            hide-title
            placeholder="不做的话，这些资源会用在哪"
          />
        </div>
      </section>
      <section class="rd-mid-col tbl-tone" :style="toneVars(4)" v-if="block('timeWindow')">
        <header class="rd-mid-head">
          <h2 class="rd-mid-title">时间窗口</h2>
          <p class="rd-mid-hint">现在做和以后做，差在哪里</p>
        </header>
        <div class="rd-panel">
          <YModelBlockCard
            :block="block('timeWindow')!"
            hide-title
            placeholder="现在做和以后做，差在哪里"
          />
        </div>
      </section>
    </div>

    <!-- Bottom: 最终结论 -->
    <section class="rd-conclusion tbl-tone" :style="toneVars(5)" v-if="block('conclusion')" aria-label="最终结论">
      <div class="rd-conclusion-bar">
        <div class="rd-conclusion-label">最终结论</div>
        <div class="rd-choices" role="group" aria-label="最终选择">
          <button
            v-for="item in CHOICES"
            :key="item.id"
            type="button"
            class="rd-choice"
            :class="`rd-choice--${item.id}`"
            :aria-pressed="doc.choice === item.id"
            @click="onChoice(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="rd-panel rd-panel--conclusion">
        <YModelBlockCard
          :block="block('conclusion')!"
          hide-title
          placeholder="写下决定，以及还要验证什么"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.rd-canvas {
  position: absolute;
  inset: 14px 16px 12px;
  z-index: 10;
  /* Page scrolls when matrix rows (≥400px) + panels exceed the viewport */
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0;
  background: var(--tbl-body, #E8F1FA);
  border: 1px solid var(--cv-frame, #ececec);
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
  border-bottom: 1px solid var(--cv-frame, #ececec);
  overflow: visible;
}

.rd-matrix-headers {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(96px, 0.7fr) minmax(0, 1.4fr) minmax(0, 1.4fr) 118px 52px;
  background: transparent;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.rd-col-header {
  padding: 10px 12px;
  text-align: center;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #fff;
  background: var(--tbl-header, #2a649f);
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  border-right: 1px solid var(--cv-frame, #ececec);
  letter-spacing: 0.04em;
  line-height: 1.3;
}

.rd-col-header--dim {
  text-align: center;
}

.rd-col-header--actions {
  border-right: none;
  padding: 0;
  background: #fafafa;
  text-shadow: none;
}

.rd-matrix-body {
  flex: 0 0 auto;
  min-height: min-content;
  overflow: visible;
}

.rd-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.7fr) minmax(0, 1.4fr) minmax(0, 1.4fr) 118px 52px;
  grid-auto-rows: max-content;
  /* Empty rows stay readable; taller notes extend the row */
  min-height: 400px;
  height: auto;
  border-bottom: 1px solid var(--cv-frame, #ececec);
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
  border-right: 1px solid var(--cv-frame, #ececec);
  background: var(--tbl-body, #e8f1fa);
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
  border-bottom-color: var(--cv-select-soft, rgba(28, 76, 124, 0.34));
}

.rd-dim-input:focus {
  border-bottom-color: var(--cv-focus, #1c4c7c);
}

.rd-dim-input::placeholder {
  color: #90a4ae;
  font-weight: 600;
}

.rd-cell {
  min-width: 0;
  height: auto;
  padding: 6px 8px;
  box-sizing: border-box;
  border-right: 1px solid var(--cv-frame, #ececec);
  display: flex;
  flex-direction: column;
  background: var(--tbl-body, #e8f1fa);
}

.rd-cell--empty {
  background: var(--tbl-body, #e8f1fa);
}

.rd-cell :deep(.ym-block) {
  flex: 1 0 auto;
  height: auto;
  min-height: 100%;
  width: 100%;
  background: transparent;
  border: none;
  box-shadow: none;
}

.rd-cell :deep(.ym-block-body),
.rd-cell :deep(.rte-root),
.rd-cell :deep(.rte-workspace),
.rd-cell :deep(.rte-canvas),
.rd-cell :deep(.rte-body),
.rd-cell :deep(.ProseMirror) {
  height: auto;
  max-height: none;
  max-width: 100%;
  min-width: 0;
  overflow: visible;
  flex: 1 0 auto;
}

.rd-cell :deep(.rte-workspace),
.rd-cell :deep(.rte-canvas),
.rd-cell :deep(.ProseMirror) {
  width: 100%;
}

.rd-cell :deep(.ProseMirror p) {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.rd-cell :deep(.pm-max-btn) {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.rd-cell :deep(.ym-block-toolbar) {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.rd-cell:hover :deep(.ym-block-toolbar),
.rd-cell :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.rd-cell :deep(.rte-root .ProseMirror),
.rd-cell :deep(.rte-root.compact .ProseMirror) {
  text-align: left;
  min-height: 320px;
  font-size: 16px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid #e4e6e8;
  border-radius: 8px;
  background: #fff;
  color: #5f6368;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.rd-row-delete-text {
  display: none;
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
  border-top: 1px solid var(--cv-frame, #ececec);
  background: var(--cv-page, #f7f7f7);
}

.rd-add-btn {
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 8px;
  background: #fff;
  color: var(--cv-ink, #3c4043);
  font-size: 15px;
  font-weight: 650;
  min-height: 40px;
  padding: 8px 18px;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.rd-add-btn:hover {
  background: var(--cv-hover-wash, #e8f1fa);
  border-color: var(--cv-focus, #1c4c7c);
  color: var(--cv-focus, #1c4c7c);
}

/* ---- Middle section ---- */
.rd-middle {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.rd-mid-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--tbl-body, #e8f1fa);
  border-right: 1px solid var(--cv-frame, #ececec);
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
  border-bottom: 1px solid var(--cv-frame, #ececec);
  color: #fff;
}

.rd-mid-title {
  margin: 0;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-align: center;
}

.rd-panel {
  flex: 0 0 auto;
  min-height: 400px;
  height: auto;
  display: flex;
  flex-direction: column;
  background: transparent;
  padding: 10px 12px 8px;
  box-sizing: border-box;
  overflow: visible;
}

.rd-panel :deep(.ym-block) {
  flex: 1 0 auto;
  height: auto;
  min-height: 100%;
  width: 100%;
  background: transparent;
  border: none;
  box-shadow: none;
}

.rd-panel :deep(.ym-block-body),
.rd-panel :deep(.rte-root),
.rd-panel :deep(.rte-workspace),
.rd-panel :deep(.rte-canvas),
.rd-panel :deep(.rte-body),
.rd-panel :deep(.ProseMirror) {
  height: auto;
  max-height: none;
  max-width: 100%;
  min-width: 0;
  overflow: visible;
  flex: 1 0 auto;
}

.rd-panel :deep(.rte-workspace),
.rd-panel :deep(.rte-canvas),
.rd-panel :deep(.ProseMirror) {
  width: 100%;
}

.rd-panel :deep(.rte-root .ProseMirror),
.rd-panel :deep(.rte-root.compact .ProseMirror) {
  text-align: left;
  min-height: 320px;
  font-size: 16px;
  line-height: 1.7;
  color: #202124;
}

.rd-panel :deep(.pm-max-btn) {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.rd-panel :deep(.ProseMirror p) {
  margin: 0.35em 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

/* ---- Bottom conclusion ---- */
.rd-conclusion {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--tbl-body, #e8f1fa);
}

.rd-conclusion-label {
  flex-shrink: 0;
  padding: 10px 14px;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #fff;
  background: var(--tbl-header, #a84562);
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-align: left;
}

.rd-panel--conclusion {
  min-height: 400px;
}

@media (max-width: 720px) {
  .rd-canvas {
    padding-bottom: 96px;
  }

  .rd-matrix-headers,
  .rd-row {
    grid-template-columns: 1fr;
  }

  .rd-col-header--actions {
    display: none;
  }

  .rd-row-actions {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px 14px;
    background: transparent;
  }

  .rd-row-delete {
    width: auto;
    height: 40px;
    gap: 6px;
    padding: 0 14px;
    border-color: #f3c1bc;
    background: #fff;
    color: #c5221f;
    font-size: 15px;
    font-weight: 650;
  }

  .rd-row-delete-mark {
    font-size: 20px;
  }

  .rd-row-delete-text {
    display: inline;
  }

  .rd-dim,
  .rd-cell {
    border-right: none;
    border-bottom: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
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
    min-height: 180px;
    height: auto;
  }

  .rd-cell :deep(.rte-root .ProseMirror),
  .rd-cell :deep(.rte-root.compact .ProseMirror),
  .rd-panel :deep(.rte-root .ProseMirror),
  .rd-panel :deep(.rte-root.compact .ProseMirror) {
    min-height: 96px;
  }

  .rd-cell :deep(.ym-block-toolbar) {
    opacity: 1;
  }

  .rd-panel,
  .rd-panel--conclusion {
    min-height: 180px;
  }

  .rd-middle {
    grid-template-columns: 1fr;
  }

  .rd-mid-col {
    border-right: none;
    border-bottom: 1px solid var(--cv-frame, #ececec);
  }
}

/* ---- PR #295 evaluation chrome, kept on top of main's tall-row matrix ---- */
.rd-decision {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--cv-frame, #ececec);
  background: #fff;
}
.rd-decision-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rd-decision-kicker {
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0.04em;
  color: var(--tbl-topic, #1c4c7c);
}
.rd-decision-input {
  width: 100%;
  border: none;
  border-bottom: 1.5px solid transparent;
  background: transparent;
  padding: 2px 0 6px;
  font-size: 22px;
  font-weight: 750;
  line-height: 1.35;
  color: #202124;
  font-family: inherit;
  outline: none;
}
.rd-decision-input:focus { border-bottom-color: var(--cv-focus, #1c4c7c); }
.rd-decision-input::placeholder { color: #9aa0a6; font-weight: 600; }
.rd-readout {
  flex-shrink: 0;
  margin: 0 0 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef3f8;
  color: #1c4c7c;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.rd-col-header span {
  display: block;
  font-weight: 800;
}
.rd-col-header small {
  display: block;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.92;
}
.rd-col-header--judge {
  background: #3e4a59;
}
.rd-judge {
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px;
  border-right: 1px solid var(--cv-frame, #ececec);
  background: #f7f8f9;
}
.rd-cell-label {
  display: none;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--tbl-topic, #1c4c7c);
}
.rd-verdicts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rd-verdict,
.rd-choice {
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid #d7dce2;
  background: #fff;
  color: #3c4043;
  font-size: 14px;
  font-weight: 750;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 8px;
}
.rd-verdict--worth[aria-pressed='true'] { background: #187a4e; border-color: #187a4e; color: #fff; }
.rd-verdict--even[aria-pressed='true'] { background: #a67c00; border-color: #a67c00; color: #fff; }
.rd-verdict--poor[aria-pressed='true'] { background: #a84562; border-color: #a84562; color: #fff; }
.rd-mid-hint {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.92;
}
.rd-conclusion-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--tbl-header, #2a649f);
  color: #fff;
}
.rd-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rd-choice--do[aria-pressed='true'] { background: #187a4e; border-color: #187a4e; color: #fff; }
.rd-choice--validate[aria-pressed='true'] { background: #a67c00; border-color: #a67c00; color: #fff; }
.rd-choice--stop[aria-pressed='true'] { background: #a84562; border-color: #a84562; color: #fff; }

@media (max-width: 720px) {
  .rd-decision { flex-direction: column; align-items: stretch; }
  .rd-readout { margin: 0; white-space: normal; }
  .rd-cell-label { display: block; }
  .rd-verdicts { flex-direction: row; flex-wrap: wrap; }
}

</style>
