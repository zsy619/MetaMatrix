<script setup lang="ts">
import { computed } from 'vue'
import type {
  IncidentReviewBlock,
  IncidentReviewBlockId,
  IncidentReviewDocumentJSON,
  IncidentReviewTimelineRow,
  QuadrantItem,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: IncidentReviewDocumentJSON
}>()

const documentStore = useDocumentStore()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

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
  <div class="ir-canvas" :style="{ backgroundColor: bgColor }">
    <div class="ir-scroll">
      <header class="ir-header">
        <h1 class="ir-title">{{ doc.title || 'Case Study: 故障复盘' }}</h1>
      </header>

      <!-- 1. 详细描述 -->
      <section class="ir-section" v-show="block('description')">
        <h2 class="ir-section-title">
          <span class="ir-num">1.</span>
          详细描述
          <span v-if="block('description')!.required" class="ir-req">（必填）</span>
        </h2>
        <p class="ir-hint">{{ doc.labels.descriptionHint }}</p>
        <div class="ir-panel">
          <YModelBlockCard :block="block('description')!" hide-title />
        </div>

        <div class="ir-sub" v-show="block('evidence')">
          <h3 class="ir-sub-title">
            {{ doc.labels.evidenceTitle }}
            <span v-if="block('evidence')!.required" class="ir-req-bracket">【必填】</span>
          </h3>
          <div class="ir-panel ir-panel--sub">
            <YModelBlockCard :block="block('evidence')!" hide-title />
          </div>
        </div>

        <div class="ir-sub" v-show="block('probability')">
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
      <section class="ir-section">
        <h2 class="ir-section-title">
          <span class="ir-num">2.</span>
          发生过程
        </h2>
        <p class="ir-hint">{{ doc.labels.processHint }}</p>

        <div class="ir-timeline" role="table" aria-label="发生过程时间线">
          <div class="ir-tl-head" role="row">
            <div class="ir-tl-col ir-tl-col--time" role="columnheader">
              {{ doc.labels.timeCol }}
            </div>
            <div class="ir-tl-col ir-tl-col--behavior" role="columnheader">
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
            <div class="ir-tl-cell ir-tl-cell--time" role="cell">
              <input
                class="ir-time-input"
                type="text"
                :value="row.time"
                placeholder="例如 2022/03/01 10:05"
                maxlength="48"
                :aria-label="`时间：${row.time || '未填写'}`"
                @input="onTimeInput(row.id, $event)"
                @click.stop
              />
            </div>
            <div class="ir-tl-cell ir-tl-cell--behavior" role="cell">
              <YModelBlockCard :block="behaviorAsBlock(row)" hide-title />
            </div>
            <div class="ir-tl-cell ir-tl-cell--actions">
              <button
                type="button"
                class="ir-row-delete"
                title="删除本行"
                :disabled="doc.timelineRows.length <= 1"
                @click="onRemoveRow(row.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div class="ir-add-row">
          <button type="button" class="ir-add-btn" @click="onAddRow">
            + 添加行
          </button>
        </div>
      </section>

      <!-- 3. 原因分析 -->
      <section class="ir-section" v-show="block('root_cause')">
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
      <section class="ir-section" v-show="block('solution')">
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
      <section class="ir-section" v-show="block('impact')">
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
      <section class="ir-section" v-show="block('related_req')">
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
      <section class="ir-section" v-show="block('reflection')">
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
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
  border: 1px solid #dadce0;
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
  margin-bottom: 36px;
}

.ir-section-title {
  margin: 0 0 8px;
  font-size: clamp(16px, 1.6vw, 18px);
  font-weight: 800;
  color: #202124;
  line-height: 1.4;
}

.ir-num {
  margin-right: 2px;
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
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.55;
  color: #80868b;
  white-space: pre-wrap;
}

.ir-hint--pre {
  white-space: pre-wrap;
}

.ir-sub {
  margin-top: 18px;
}

.ir-sub-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #202124;
}

.ir-panel {
  min-height: 400px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fafafa;
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
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.55;
  color: #5f6368;
  border-radius: 4px;
  border: 1px solid transparent;
}

.ir-tip--yellow {
  background: #fff8e1;
  border-color: #ffe082;
}

.ir-tip--pink {
  background: #fce8e6;
  border-color: #f5c6c2;
}

.ir-impact-guide {
  margin: 0 0 12px;
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
  border: 1px solid #dadce0;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}

.ir-tl-head {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 40px;
  background: #f1f3f4;
  border-bottom: 1px solid #dadce0;
}

.ir-tl-col {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #202124;
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
}

.ir-tl-cell--behavior {
  padding: 4px 6px;
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
  border-color: #1a73e8;
  background: #fff;
}

.ir-row-delete {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9aa0a6;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.ir-row-delete:hover:not(:disabled) {
  background: #fce8e6;
  color: #d93025;
}

.ir-row-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ir-add-row {
  margin-top: 10px;
}

.ir-add-btn {
  border: 1px dashed #dadce0;
  border-radius: 4px;
  background: #fafafa;
  color: #1a73e8;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  font-family: inherit;
}

.ir-add-btn:hover {
  background: #e8f0fe;
  border-color: #1a73e8;
}
</style>
