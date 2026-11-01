<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  IncidentReviewBlock,
  IncidentReviewBlockId,
  IncidentReviewDocumentJSON,
  IncidentReviewTimelineRow,
  QuadrantItem,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: IncidentReviewDocumentJSON
}>()

const documentStore = useDocumentStore()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const byId = computed(() => {
  const map = new Map<IncidentReviewBlockId, IncidentReviewBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: IncidentReviewBlockId): IncidentReviewBlock | undefined {
  return byId.value.get(id)
}

function behaviorBlockId(rowId: string): string {
  return `${rowId}:behavior`
}

function behaviorAsBlock(row: IncidentReviewTimelineRow) {
  return {
    id: behaviorBlockId(row.id),
    title: '',
    items: row.behavior as QuadrantItem[],
  }
}

function onTimeInput(rowId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  documentStore.updateIncidentReviewTimelineTime(rowId, value)
}

function onAddRow() {
  documentStore.addIncidentReviewTimelineRow()
}

function onRemoveRow(rowId: string) {
  documentStore.removeIncidentReviewTimelineRow(rowId)
}
</script>

<template>
  <div class="ir-canvas" :style="chrome">
    <div class="ir-scroll">
      <header class="ir-header">
        <h1 class="ir-title">{{ doc.title || 'Case Study: 故障复盘' }}</h1>
      </header>

      <!-- 1. 详细描述 -->
      <section class="ir-section tbl-tone" :style="toneVars(0)" v-show="block('description')">
        <h2 class="ir-section-title">
          <span class="ir-num">1.</span>
          详细描述
          <span v-if="block('description')!.required" class="ir-req">（必填）</span>
        </h2>
        <p class="ir-hint">{{ doc.labels.descriptionHint }}</p>
        <div class="ir-panel">
          <YModelBlockCard :block="block('description')!" hide-title />
        </div>

        <div class="ir-sub tbl-tone" :style="toneVars(1)" v-show="block('evidence')">
          <h3 class="ir-sub-title">
            {{ doc.labels.evidenceTitle }}
            <span v-if="block('evidence')!.required" class="ir-req-bracket">【必填】</span>
          </h3>
          <div class="ir-panel ir-panel--sub">
            <YModelBlockCard :block="block('evidence')!" hide-title />
          </div>
        </div>

        <div class="ir-sub tbl-tone" :style="toneVars(2)" v-show="block('probability')">
          <h3 class="ir-sub-title">
            {{ doc.labels.probabilityTitle }}
            <span v-if="block('probability')!.required" class="ir-req-bracket">【必填】</span>
          </h3>
          <p class="ir-hint ir-hint--pre">{{ doc.labels.probabilityHint }}</p>
          <div class="ir-panel ir-panel--sub">
            <YModelBlockCard :block="block('probability')!" hide-title />
          </div>
        </div>
      </section>

      <!-- 2. 发生过程 · 时间线 -->
      <section class="ir-section tbl-tone" :style="toneVars(3)">
        <h2 class="ir-section-title">
          <span class="ir-num">2.</span>
          发生过程
        </h2>
        <p class="ir-hint">{{ doc.labels.processHint }}</p>

        <div class="ir-timeline" role="table" aria-label="发生过程时间线">
          <div class="ir-tl-head" role="row">
            <div class="ir-tl-col ir-tl-col--time" role="columnheader" :style="toneVars(4)">
              {{ doc.labels.timeCol }}
            </div>
            <div class="ir-tl-col ir-tl-col--behavior" role="columnheader" :style="toneVars(5)">
              {{ doc.labels.behaviorCol }}
            </div>
            <div class="ir-tl-col ir-tl-col--actions" aria-hidden="true" />
          </div>

          <div
            v-for="row in doc.timelineRows"
            :key="row.id"
            class="ir-tl-row"
            role="row"
          >
            <div class="ir-tl-cell ir-tl-cell--time tbl-tone" role="cell" :style="toneVars(4)">
              <input
                :id="`ir-time-${row.id}`"
                class="ir-time-input"
                type="text"
                name="irTime"
                :value="row.time"
                placeholder="例如 2022/03/01 10:05"
                maxlength="48"
                autocomplete="off"
                :aria-label="`时间：${row.time || '未填写'}`"
                @input="onTimeInput(row.id, $event)"
                @click.stop
              />
            </div>
            <div class="ir-tl-cell ir-tl-cell--behavior tbl-tone" role="cell" :style="toneVars(5)">
              <YModelBlockCard :block="behaviorAsBlock(row)" hide-title />
            </div>
            <div class="ir-tl-cell ir-tl-cell--actions">
              <button
                type="button"
                class="cv-row-delete"
                title="删除本行"
                :disabled="doc.timelineRows.length <= 1"
                @click="onRemoveRow(row.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div class="cv-add-row">
          <button type="button" class="cv-add-btn" @click="onAddRow">
            + 添加行
          </button>
        </div>
      </section>

      <!-- 3. 原因分析 -->
      <section class="ir-section tbl-tone" :style="toneVars(6)" v-show="block('root_cause')">
        <h2 class="ir-section-title">
          <span class="ir-num">3.</span>
          原因分析
          <span v-if="block('root_cause')!.required" class="ir-req">（必填）</span>
        </h2>
        <p class="ir-hint">{{ doc.labels.rootCauseHint }}</p>
        <div class="ir-panel ir-panel--accent">
          <YModelBlockCard :block="block('root_cause')!" hide-title />
        </div>
      </section>

      <!-- 4. 解决方案 -->
      <section class="ir-section tbl-tone" :style="toneVars(7)" v-show="block('solution')">
        <h2 class="ir-section-title">
          <span class="ir-num">4.</span>
          解决方案
          <span v-if="block('solution')!.required" class="ir-req">（必填）</span>
        </h2>
        <p class="ir-hint">{{ doc.labels.solutionHint }}</p>
        <aside class="ir-tip ir-tip--yellow" role="note">
          {{ doc.labels.solutionTip }}
        </aside>
        <div class="ir-panel">
          <YModelBlockCard :block="block('solution')!" hide-title />
        </div>
      </section>

      <!-- 5. 影响范围 -->
      <section class="ir-section tbl-tone" :style="toneVars(8)" v-show="block('impact')">
        <h2 class="ir-section-title">
          <span class="ir-num">5.</span>
          影响范围
          <span v-if="block('impact')!.required" class="ir-req">（必填）</span>
        </h2>
        <ul class="ir-impact-guide">
          <li>
            客户端问题：引入版本、<mark>影响版本</mark>、<mark>影响用户数</mark>、场景、发现渠道等
          </li>
          <li>
            服务端问题：涉及接口/服务、<mark>影响端/版本</mark>、<mark>影响用户数</mark>、影响功能、发现渠道等
          </li>
        </ul>
        <div class="ir-panel">
          <YModelBlockCard :block="block('impact')!" hide-title />
        </div>
      </section>

      <!-- 6. 关联需求 -->
      <section class="ir-section tbl-tone" :style="toneVars(9)" v-show="block('related_req')">
        <h2 class="ir-section-title">
          <span class="ir-num">6.</span>
          关联需求
        </h2>
        <aside class="ir-tip ir-tip--pink" role="note">
          {{ doc.labels.relatedHint }}
        </aside>
        <div class="ir-panel">
          <YModelBlockCard :block="block('related_req')!" hide-title />
        </div>
      </section>

      <!-- 7. 反思总结 -->
      <section class="ir-section tbl-tone" :style="toneVars(10)" v-show="block('reflection')">
        <h2 class="ir-section-title">
          <span class="ir-num">7.</span>
          反思总结
          <span v-if="block('reflection')!.required" class="ir-req">（必填）</span>
        </h2>
        <p class="ir-hint">{{ doc.labels.reflectionHint }}</p>
        <div class="ir-panel ir-panel--accent">
          <YModelBlockCard :block="block('reflection')!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ir-canvas {
  position: absolute;
  inset: 14px 16px 12px;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 2px;
}

.ir-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 28px 36px 48px;
  box-sizing: border-box;
}

.ir-header {
  margin-bottom: 28px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e8eaed;
}

.ir-title {
  margin: 0;
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.01em;
  line-height: 1.3;
}

.ir-section {
  margin-bottom: 28px;
  border-radius: 8px;
  overflow: visible;
  background: var(--tbl-body, #fafafa);
  padding-bottom: 12px;
}

.ir-section-title {
  margin: 0 0 10px;
  padding: 10px 14px;
  font-size: clamp(16px, 1.6vw, 18px);
  font-weight: 800;
  color: #fff;
  line-height: 1.4;
  background: var(--tbl-header, #0e8a84);
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
}

.ir-num {
  margin-right: 2px;
}

.ir-section-title .ir-req,
.ir-sub-title .ir-req-bracket {
  color: #ffe4e6;
}

.ir-req {
  font-weight: 700;
  color: #d93025;
  font-size: 0.92em;
}

.ir-req-bracket {
  font-weight: 700;
  color: #d93025;
  font-size: 0.95em;
}

.ir-hint {
  margin: 0 14px 10px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--tbl-topic, #80868b);
  white-space: pre-wrap;
}

.ir-hint--pre {
  white-space: pre-wrap;
}

.ir-sub {
  margin: 14px 12px 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--tbl-body, #fff);
  padding-bottom: 8px;
}

.ir-sub-title {
  margin: 0 0 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: var(--tbl-header, #a67c00);
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
}

.ir-panel {
  min-height: 400px;
  margin: 0 12px;
  border: 1px solid color-mix(in srgb, var(--tbl-topic, #e0e0e0) 28%, transparent);
  border-radius: 4px;
  background: transparent;
  padding: 4px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.ir-panel--sub {
  min-height: 400px;
}

.ir-panel--accent {
  border-left: 3px solid #bdc1c6;
}

.ir-panel :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.ir-tip {
  margin: 0 14px 12px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.55;
  color: #5f6368;
  border-radius: 4px;
  border: 1px solid transparent;
}

.ir-tip--yellow {
  background: #FBF6E4;
  border-color: color-mix(in srgb, #a67c00 32%, var(--cv-frame, #ececec));
}

.ir-tip--pink {
  background: #fce8e6;
  border-color: #f5c6c2;
}

.ir-impact-guide {
  margin: 0 14px 12px;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.7;
  color: #3c4043;
}

.ir-impact-guide mark {
  background: #fce8e6;
  color: inherit;
  padding: 0 3px;
  border-radius: 2px;
}

/* Timeline table */
.ir-timeline {
  margin: 0 12px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}

.ir-tl-head {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 40px;
  background: transparent;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.ir-tl-col {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--tbl-header, #2A649F);
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
}

.ir-tl-col--actions {
  background: #fafafa;
  text-shadow: none;
}

.ir-tl-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 40px;
  border-bottom: 1px solid #e8eaed;
  min-height: 400px;
}

.ir-tl-row:last-child {
  border-bottom: none;
}

.ir-tl-cell {
  min-width: 0;
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
}

.ir-tl-cell--time {
  padding: 8px 10px;
  border-right: 1px solid #e8eaed;
  align-items: center;
  background: var(--tbl-body, #fff);
}

.ir-tl-cell--behavior {
  padding: 4px 6px;
  background: var(--tbl-body, #fff);
}

.ir-tl-cell--behavior :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.ir-tl-cell--actions {
  align-items: center;
  justify-content: center;
  border-left: 1px solid #f1f3f4;
}

.ir-time-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  color: #202124;
  background: transparent;
  outline: none;
}

.ir-time-input:hover {
  border-color: #dadce0;
  background: #fff;
}

.ir-time-input:focus {
  border-color: var(--cv-focus, #1c4c7c);
  background: #fff;
}

</style>
