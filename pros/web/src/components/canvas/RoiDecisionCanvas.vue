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

/** Sync before first render so editors have real block ids. */
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
  documentStore.updateRoiDecisionDimension(rowId, (event.target as HTMLInputElement).value)
}

function onVerdict(rowId: string, verdict: RoiDecisionVerdict) {
  documentStore.updateRoiDecisionVerdict(rowId, verdict)
}

function onChoice(choice: RoiDecisionChoice) {
  documentStore.updateRoiDecisionChoice(choice)
}

function onAddRow() {
  documentStore.addRoiDecisionRow()
  documentStore.ensureRoiDecisionBlocks()
}

function onRemoveRow(rowId: string) {
  documentStore.removeRoiDecisionRow(rowId)
  documentStore.ensureRoiDecisionBlocks()
}

function verdictLabel(row: RoiDecisionRow): string {
  return VERDICTS.find((item) => item.id === row.verdict)?.label || '还没判断'
}

onMounted(() => {
  documentStore.ensureRoiDecisionBlocks()
})
</script>

<template>
  <div class="rd-canvas" :style="chrome" aria-label="ROI决策评估">
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

    <div class="rd-matrix" role="table" aria-label="维度收益成本矩阵">
      <div class="rd-matrix-headers" role="row">
        <div class="rd-col-header" role="columnheader" :style="toneVars(0)">
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
      </div>

      <div class="rd-matrix-body">
        <div
          v-for="row in doc.rows"
          :key="row.id"
          class="rd-row"
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
            <button
              type="button"
              class="rd-row-delete"
              aria-label="删除本行"
              :disabled="doc.rows.length <= 1"
              @click="onRemoveRow(row.id)"
            >
              删除本行
            </button>
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
          <section v-else class="rd-cell rd-cell--empty tbl-tone" role="cell" :style="toneVars(1)" />

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
          <section v-else class="rd-cell rd-cell--empty tbl-tone" role="cell" :style="toneVars(2)" />

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
        </div>
      </div>

      <div class="rd-add-row">
        <button type="button" class="rd-add-btn" @click="onAddRow">+ 添加行</button>
      </div>
    </div>

    <div class="rd-middle" role="group" aria-label="机会成本与时间窗口">
      <section v-if="block('opportunityCost')" class="rd-mid-col tbl-tone" :style="toneVars(3)">
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
      <section v-if="block('timeWindow')" class="rd-mid-col tbl-tone" :style="toneVars(4)">
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

    <section v-if="block('conclusion')" class="rd-conclusion tbl-tone" :style="toneVars(5)" aria-label="最终结论">
      <div class="rd-conclusion-bar">
        <h2 class="rd-conclusion-label">最终结论</h2>
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
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
  padding: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 120px),
    var(--cv-page, #f4f1ea);
  border: 1px solid var(--cv-frame, #e4ddd2);
  border-radius: 16px;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
  scrollbar-gutter: stable;
}

.rd-canvas::-webkit-scrollbar {
  width: 8px;
}

.rd-canvas::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.35);
  border-radius: 999px;
}

.rd-decision {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--cv-frame, #e4ddd2);
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

.rd-decision-input:focus {
  border-bottom-color: var(--cv-focus, #1c4c7c);
}

.rd-decision-input::placeholder {
  color: #9aa0a6;
  font-weight: 600;
}

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

.rd-matrix,
.rd-middle,
.rd-conclusion {
  border: 1px solid var(--cv-frame, #e4ddd2);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.rd-matrix {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
}

.rd-matrix-headers,
.rd-row {
  display: grid;
  grid-template-columns: minmax(128px, 0.78fr) minmax(0, 1.35fr) minmax(0, 1.35fr) 118px;
}

.rd-row {
  grid-auto-rows: max-content;
  min-height: 0;
  height: auto;
  border-top: 1px solid var(--cv-frame, #e4ddd2);
}

.rd-col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 52px;
  padding: 8px 10px;
  text-align: center;
  color: #fff;
  background: var(--tbl-header, #2a649f);
  border-right: 1px solid rgba(255, 255, 255, 0.18);
}

.rd-col-header span {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.28));
}

.rd-col-header small {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.92;
}

.rd-col-header--judge {
  border-right: none;
  background: #3e4a59;
}

.rd-dim,
.rd-cell,
.rd-judge {
  min-width: 0;
  box-sizing: border-box;
  border-right: 1px solid var(--cv-frame, #e4ddd2);
}

.rd-judge {
  border-right: none;
}

.rd-dim {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  padding: 12px 10px;
  background: var(--tbl-body, #e5f6f5);
}

.rd-dim-input {
  width: 100%;
  border: none;
  border-bottom: 1.5px solid transparent;
  background: transparent;
  text-align: center;
  font-size: 16px;
  font-weight: 750;
  color: var(--tbl-topic, #111);
  padding: 6px 2px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.rd-dim-input:focus {
  border-bottom-color: var(--cv-focus, #1c4c7c);
}

.rd-dim-input::placeholder {
  color: #90a4ae;
  font-weight: 600;
}

.rd-row-delete {
  align-self: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #f0c7c3;
  border-radius: 8px;
  background: #fff;
  color: #c5221f;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.rd-row-delete:hover:not(:disabled) {
  background: #fce8e6;
}

.rd-row-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.rd-cell,
.rd-judge {
  display: flex;
  flex-direction: column;
  height: auto;
  padding: 6px 8px;
  background: var(--tbl-body, #fff);
}

.rd-judge {
  background: #f7f8f9;
  justify-content: center;
}

.rd-cell-label {
  display: none;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--tbl-topic, #1c4c7c);
}

.rd-cell :deep(.ym-block),
.rd-panel :deep(.ym-block) {
  flex: 0 0 auto;
  height: auto;
  min-height: 0;
  width: 100%;
  background: transparent;
  border: none;
  box-shadow: none;
  overflow: visible;
}

.rd-cell :deep(.ym-block-body),
.rd-cell :deep(.rte-root),
.rd-cell :deep(.rte-workspace),
.rd-cell :deep(.rte-canvas),
.rd-cell :deep(.rte-body),
.rd-cell :deep(.ProseMirror),
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
  flex: 0 0 auto;
  width: 100%;
}

.rd-cell :deep(.ProseMirror p),
.rd-panel :deep(.ProseMirror p) {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.rd-cell :deep(.rte-root .ProseMirror),
.rd-cell :deep(.rte-root.compact .ProseMirror),
.rd-panel :deep(.rte-root .ProseMirror),
.rd-panel :deep(.rte-root.compact .ProseMirror) {
  text-align: left;
  min-height: 48px;
  font-size: 15px;
  line-height: 1.65;
  color: #202124;
}

.rd-cell :deep(.pm-max-btn),
.rd-panel :deep(.pm-max-btn) {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.rd-cell :deep(.ym-block-toolbar),
.rd-panel :deep(.ym-block-toolbar) {
  opacity: 1;
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

.rd-verdict--worth[aria-pressed='true'] {
  background: #187a4e;
  border-color: #187a4e;
  color: #fff;
}

.rd-verdict--even[aria-pressed='true'] {
  background: #a67c00;
  border-color: #a67c00;
  color: #fff;
}

.rd-verdict--poor[aria-pressed='true'] {
  background: #a84562;
  border-color: #a84562;
  color: #fff;
}

.rd-add-row {
  display: flex;
  justify-content: center;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--cv-frame, #e4ddd2);
  background: #faf8f5;
}

.rd-add-btn {
  min-height: 40px;
  padding: 8px 18px;
  border: 1px solid var(--cv-frame, #e4ddd2);
  border-radius: 8px;
  background: #fff;
  color: #202124;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.rd-add-btn:hover {
  border-color: var(--cv-focus, #1c4c7c);
  color: var(--cv-focus, #1c4c7c);
}

.rd-middle {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.rd-mid-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--tbl-body, #fff);
  border-right: 1px solid var(--cv-frame, #e4ddd2);
}

.rd-mid-col:last-child {
  border-right: none;
}

.rd-mid-head,
.rd-conclusion-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
  background: var(--tbl-header, #2a649f);
  color: #fff;
}

.rd-mid-title,
.rd-conclusion-label {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.28));
}

.rd-mid-hint {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.92;
}

.rd-panel {
  flex: 0 0 auto;
  min-height: 0;
  height: auto;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  box-sizing: border-box;
}

.rd-conclusion {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--tbl-body, #fff);
}

.rd-conclusion-bar {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rd-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rd-choice--do[aria-pressed='true'] {
  background: #187a4e;
  border-color: #187a4e;
  color: #fff;
}

.rd-choice--validate[aria-pressed='true'] {
  background: #a67c00;
  border-color: #a67c00;
  color: #fff;
}

.rd-choice--stop[aria-pressed='true'] {
  background: #a84562;
  border-color: #a84562;
  color: #fff;
}

@media (max-width: 720px) {
  .rd-canvas {
    inset: 8px;
    padding: 8px;
    padding-bottom: 96px;
    gap: 10px;
  }

  .rd-decision {
    flex-direction: column;
    align-items: stretch;
  }

  .rd-readout {
    margin: 0;
    white-space: normal;
  }

  .rd-decision-input {
    font-size: 18px;
  }

  .rd-matrix-headers {
    display: none;
  }

  .rd-matrix-headers,
  .rd-row,
  .rd-middle {
    grid-template-columns: 1fr;
  }

  .rd-cell-label {
    display: block;
  }

  .rd-dim,
  .rd-cell,
  .rd-judge,
  .rd-mid-col {
    border-right: none;
    border-bottom: 1px solid var(--cv-frame, #e4ddd2);
  }

  .rd-verdicts,
  .rd-choices {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .rd-verdict,
  .rd-choice {
    flex: 1 1 96px;
  }

  .rd-conclusion-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .rd-cell :deep(.rte-root .ProseMirror),
  .rd-cell :deep(.rte-root.compact .ProseMirror),
  .rd-panel :deep(.rte-root .ProseMirror),
  .rd-panel :deep(.rte-root.compact .ProseMirror) {
    min-height: 48px;
  }
}
</style>
