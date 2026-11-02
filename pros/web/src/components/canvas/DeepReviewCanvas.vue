<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  DeepReviewBlock,
  DeepReviewBlockId,
  DeepReviewDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: DeepReviewDocumentJSON
}>()

const documentStore = useDocumentStore()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const byId = computed(() => {
  const map = new Map<DeepReviewBlockId, DeepReviewBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: DeepReviewBlockId): DeepReviewBlock | undefined {
  return byId.value.get(id)
}

function onProjectName(event: Event) {
  documentStore.updateDeepReviewMeta({
    projectName: (event.target as HTMLInputElement).value,
  })
}

function onReviewTime(event: Event) {
  documentStore.updateDeepReviewMeta({
    reviewTime: (event.target as HTMLInputElement).value,
  })
}
</script>

<template>
  <div class="dr-canvas" :style="chrome">
    <header class="dr-meta">
      <label class="dr-meta-field">
        <span class="dr-meta-label">项目名称：</span>
        <input
          id="dr-project-name"
          class="dr-meta-input"
          type="text"
          name="drProjectName"
          :value="doc.projectName"
          placeholder="填写项目名称"
          maxlength="80"
          autocomplete="off"
          @input="onProjectName"
          @click.stop
        />
      </label>
      <label class="dr-meta-field">
        <span class="dr-meta-label">复盘时间：</span>
        <input
          id="dr-review-time"
          class="dr-meta-input"
          type="text"
          name="drReviewTime"
          :value="doc.reviewTime"
          placeholder="例如 2026-10"
          maxlength="40"
          autocomplete="off"
          @input="onReviewTime"
          @click.stop
        />
      </label>
    </header>

    <div class="dr-grid" role="grid" aria-label="深度复盘关键成果">
      <!-- Row 1 · 整体评价 -->
      <section class="dr-cell dr-cell--full tbl-tone" :style="toneVars(0)" v-show="block('overall')">
        <h2 class="dr-title">{{ block('overall')!.title }}</h2>
        <p class="dr-hint">{{ block('overall')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('overall')!" hide-title />
        </div>
      </section>

      <!-- Row 2 · 亮点 | 问题 -->
      <section class="dr-cell tbl-tone" :style="toneVars(1)" v-show="block('highlights')">
        <h2 class="dr-title">{{ block('highlights')!.title }}</h2>
        <p class="dr-hint">{{ block('highlights')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('highlights')!" hide-title />
        </div>
      </section>
      <section class="dr-cell tbl-tone" :style="toneVars(2)" v-show="block('problems')">
        <h2 class="dr-title">{{ block('problems')!.title }}</h2>
        <p class="dr-hint">{{ block('problems')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('problems')!" hide-title />
        </div>
      </section>

      <!-- Row 3 · 坚持 | 放弃 | 新任务 -->
      <section class="dr-cell tbl-tone" :style="toneVars(3)" v-show="block('keep')">
        <h2 class="dr-title">{{ block('keep')!.title }}</h2>
        <p class="dr-hint">{{ block('keep')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('keep')!" hide-title />
        </div>
      </section>
      <section class="dr-cell tbl-tone" :style="toneVars(4)" v-show="block('stop')">
        <h2 class="dr-title">{{ block('stop')!.title }}</h2>
        <p class="dr-hint">{{ block('stop')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('stop')!" hide-title />
        </div>
      </section>
      <section class="dr-cell tbl-tone" :style="toneVars(5)" v-show="block('new_tasks')">
        <h2 class="dr-title">{{ block('new_tasks')!.title }}</h2>
        <p class="dr-hint">{{ block('new_tasks')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('new_tasks')!" hide-title />
        </div>
      </section>

      <!-- Row 4 · 过程资产 -->
      <section class="dr-cell dr-cell--full tbl-tone" :style="toneVars(6)" v-show="block('assets')">
        <h2 class="dr-title">{{ block('assets')!.title }}</h2>
        <p class="dr-hint">{{ block('assets')!.prompt }}</p>
        <div class="dr-panel">
          <YModelBlockCard :block="block('assets')!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dr-canvas {
  position: absolute;
  inset: 14px 16px 12px;
  z-index: 10;
  /* Page scrolls when stacked panels (each ≥400px) exceed the viewport */
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 2px;
  scrollbar-gutter: stable;
}

.dr-canvas::-webkit-scrollbar {
  width: 8px;
}

.dr-canvas::-webkit-scrollbar-thumb {
  background: rgba(32, 33, 36, 0.28);
  border-radius: 999px;
}

.dr-meta {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #FBF6E4;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.dr-meta-field {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  min-width: 0;
  box-sizing: border-box;
}

.dr-meta-field + .dr-meta-field {
  border-left: 1px solid var(--cv-frame, #ececec);
}

.dr-meta-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: #202124;
}

.dr-meta-input {
  flex: 1;
  min-width: 0;
  border: none;
  border-bottom: 1px solid transparent;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: #202124;
  outline: none;
  padding: 2px 4px;
}

.dr-meta-input:hover,
.dr-meta-input:focus {
  border-bottom-color: #c9a227;
  background: rgba(255, 255, 255, 0.45);
}

.dr-grid {
  /* Never shrink content rows below panel min-heights */
  flex: 1 0 auto;
  width: 100%;
  min-height: min-content;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(400px, auto));
  overflow: visible;
}

.dr-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 400px;
  padding: 0 0 8px;
  box-sizing: border-box;
  border-right: 1px solid var(--cv-frame, #ececec);
  border-bottom: 1px solid var(--cv-frame, #ececec);
  gap: 4px;
  background: var(--tbl-body, #fff);
  /* default: 2 cols of 6 = half width for row 2 */
  grid-column: span 3;
}

/* Row 3: three columns → span 2 each. Order in DOM:
   overall(full), highlights(3), problems(3), keep(2), stop(2), new_tasks(2), assets(full)
*/
.dr-cell:nth-child(4),
.dr-cell:nth-child(5),
.dr-cell:nth-child(6) {
  grid-column: span 2;
}

.dr-cell--full {
  grid-column: 1 / -1;
}

.dr-cell:nth-child(3),
.dr-cell:nth-child(6),
.dr-cell--full {
  border-right: none;
}

.dr-title {
  margin: 0;
  flex-shrink: 0;
  padding: 10px 12px;
  font-size: clamp(14px, 1.4vw, 16px);
  font-weight: 800;
  color: #fff;
  line-height: 1.3;
  background: var(--tbl-header, #0e8a84);
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
}

.dr-hint {
  margin: 0;
  flex-shrink: 0;
  padding: 0 12px;
  font-size: clamp(11px, 1.05vw, 12.5px);
  font-style: italic;
  line-height: 1.45;
  color: var(--tbl-topic, #5f6368);
  white-space: pre-wrap;
}

.dr-panel {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
  border-radius: 4px;
  background: transparent;
  margin: 0 8px;
  padding: 2px;
  box-sizing: border-box;
}

.dr-panel :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}
</style>
