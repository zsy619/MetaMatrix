<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  OscarBlock,
  OscarBlockId,
  OscarDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: OscarDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<OscarBlockId, OscarBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: OscarBlockId): OscarBlock | undefined {
  return byId.value.get(id)
}

const topIds: OscarBlockId[] = ['objective', 'scope', 'checklist']
const bottomIds: OscarBlockId[] = ['acquire', 'utilize']

const chrome = computed(() => canvasChromeStyle(props.doc.theme))
</script>

<template>
  <div class="oscar-canvas" :style="chrome">
    <div class="os-grid" role="table" aria-label="OSCAR调研画布">
      <div class="os-row os-row--top">
        <section
          v-for="(id, index) in topIds"
          :key="id"
          v-show="block(id)"
          class="os-cell tbl-tone"
          :style="toneVars(index)"
        >
          <div class="os-meta">
            <h2 class="os-title">{{ block(id)!.title }}</h2>
            <p class="os-prompt">{{ block(id)!.prompt }}</p>
          </div>
          <div class="os-body">
            <YModelBlockCard :block="block(id)!" hide-title />
          </div>
          <span class="os-watermark" aria-hidden="true">{{ block(id)!.letter }}</span>
        </section>
      </div>

      <div class="os-row os-row--bottom">
        <section
          v-for="(id, index) in bottomIds"
          :key="id"
          v-show="block(id)"
          class="os-cell tbl-tone"
          :style="toneVars(index + topIds.length)"
        >
          <div class="os-meta">
            <h2 class="os-title">{{ block(id)!.title }}</h2>
            <p class="os-prompt">{{ block(id)!.prompt }}</p>
          </div>
          <div class="os-body">
            <YModelBlockCard :block="block(id)!" hide-title />
          </div>
          <span class="os-watermark" aria-hidden="true">{{ block(id)!.letter }}</span>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oscar-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.os-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 2px;
  overflow: hidden;
  background: #f5f0e8;
}

.os-row {
  display: grid;
  min-height: 0;
  min-width: 0;
}

.os-row--top {
  flex: 1 1 50%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.os-row--bottom {
  flex: 1 1 50%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.os-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
  background: var(--tbl-body, #f5f0e8);
  border-right: 1px solid var(--cv-frame, #ececec);
  gap: 0;
  overflow: hidden;
}

.os-row--top .os-cell:last-child,
.os-row--bottom .os-cell:last-child {
  border-right: none;
}

.os-meta {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px 14px 8px;
  background: var(--tbl-header, #0e8a84);
  color: #fff;
}

.os-title {
  margin: 0;
  font-size: clamp(15px, 1.6vw, 20px);
  font-weight: 800;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.os-prompt {
  margin: 0;
  font-size: clamp(12px, 1.2vw, 14px);
  font-style: italic;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.45;
}

.os-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 14px;
  background: var(--tbl-body, #f5f0e8);
}

.os-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(255, 255, 255, 0.45);
}

.os-watermark {
  position: absolute;
  left: 10px;
  bottom: 4px;
  z-index: 0;
  font-size: clamp(72px, 12vw, 120px);
  font-weight: 800;
  line-height: 0.85;
  color: color-mix(in srgb, var(--tbl-topic, #6495ed) 28%, transparent);
  pointer-events: none;
  user-select: none;
  letter-spacing: -0.04em;
}

@media (max-width: 720px) {
  .oscar-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .os-row--top,
  .os-row--bottom {
    flex: none;
    grid-template-columns: 1fr;
  }

  .os-cell {
    border-right: none;
    border-bottom: 1px solid var(--cv-frame, #ececec);
    min-height: 180px;
  }

  .os-row--bottom .os-cell:last-child {
    border-bottom: none;
  }
}
</style>
