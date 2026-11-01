<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  PmRetroValueBlock,
  PmRetroValueBlockId,
  PmRetroValueDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: PmRetroValueDocumentJSON
}>()

const documentStore = useDocumentStore()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const byId = computed(() => {
  const map = new Map<PmRetroValueBlockId, PmRetroValueBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: PmRetroValueBlockId): PmRetroValueBlock | undefined {
  return byId.value.get(id)
}

function onTitleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  props.doc.title = value
  documentStore.markDirty()
}
</script>

<template>
  <div class="prv-canvas" :style="chrome">
    <header class="prv-top">
      <input
        class="prv-top-title"
        type="text"
        :value="doc.title || '复盘挖掘价值4：过程资产'"
        maxlength="80"
        aria-label="画布标题"
        @input="onTitleInput"
        @click.stop
      />
    </header>

    <div class="prv-grid" role="grid" aria-label="项目管理复盘挖掘价值">
      <section class="prv-col tbl-tone" :style="toneVars(0)" v-show="block('before')">
        <header class="prv-col-head">
          <h2 class="prv-col-title">{{ block('before')!.title }}</h2>
        </header>
        <div class="prv-panel prv-panel--center">
          <YModelBlockCard :block="block('before')!" hide-title />
        </div>
      </section>

      <section class="prv-col tbl-tone" :style="toneVars(1)" v-show="block('after')">
        <header class="prv-col-head">
          <h2 class="prv-col-title">{{ block('after')!.title }}</h2>
        </header>
        <div class="prv-panel prv-panel--left">
          <YModelBlockCard :block="block('after')!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.prv-canvas {
  position: absolute;
  inset: 14px 16px 12px;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--tbl-body, #fff);
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 2px;
}

.prv-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 16px;
  box-sizing: border-box;
  background: #3c3424;
}

.prv-top-title {
  width: 100%;
  max-width: 720px;
  border: none;
  background: transparent;
  color: #ffffff;
  text-align: center;
  font-size: clamp(15px, 1.6vw, 18px);
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.02em;
  outline: none;
  padding: 4px 8px;
  border-radius: 4px;
}

.prv-top-title:hover,
.prv-top-title:focus {
  background: rgba(255, 255, 255, 0.08);
}

.prv-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
}

.prv-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--tbl-body, #f7f1cc);
  border-right: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.prv-col:last-child {
  border-right: none;
}

.prv-col-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 10px 14px;
  box-sizing: border-box;
  background: var(--tbl-header, #0e8a84);
  border-bottom: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
  color: #fff;
}

.prv-col-title {
  margin: 0;
  font-size: clamp(16px, 1.7vw, 20px);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  letter-spacing: 0.01em;
  line-height: 1.3;
  text-align: center;
}

.prv-panel {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  background: transparent;
  padding: 10px 12px 8px;
  box-sizing: border-box;
  overflow: auto;
}

.prv-panel :deep(.ym-block) {
  flex: 1;
  min-height: 400px;
  background: transparent;
  border: none;
  box-shadow: none;
}

/* Left column: vertically + horizontally center the quote */
.prv-panel--center :deep(.ym-block-body),
.prv-panel--center :deep(.rte-root),
.prv-panel--center :deep(.ProseMirror) {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 360px;
}

.prv-panel--center :deep(.ProseMirror) {
  text-align: center;
  font-size: 16px;
  line-height: 1.7;
  color: #202124;
}

.prv-panel--left :deep(.ProseMirror) {
  text-align: left;
  font-size: 14px;
  line-height: 1.65;
  color: #202124;
}

.prv-panel--left :deep(.ProseMirror p) {
  margin: 0.35em 0;
}
</style>
