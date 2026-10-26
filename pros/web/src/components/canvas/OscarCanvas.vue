<script setup lang="ts">
import { computed } from 'vue'
import type {
  OscarBlock,
  OscarBlockId,
  OscarDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

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

const bgColor = computed(
  () => props.doc.theme.background.color || '#f5f0e8',
)
</script>

<template>
  <div class="oscar-canvas" :style="{ backgroundColor: bgColor }">
    <div class="os-grid" role="table" aria-label="OSCAR调研画布">
      <div class="os-row os-row--top">
        <section
          v-for="id in topIds"
          :key="id"
          v-show="block(id)"
          class="os-cell"
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
          v-for="id in bottomIds"
          :key="id"
          v-show="block(id)"
          class="os-cell"
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
  border: 2px solid #202124;
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
  border-bottom: 2px solid #202124;
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
  padding: 14px 14px 16px;
  box-sizing: border-box;
  background: #f5f0e8;
  border-right: 2px solid #202124;
  gap: 8px;
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
}

.os-title {
  margin: 0;
  font-size: clamp(15px, 1.6vw, 20px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.os-prompt {
  margin: 0;
  font-size: clamp(12px, 1.2vw, 14px);
  font-style: italic;
  font-weight: 400;
  color: #5f6368;
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
  color: rgba(100, 149, 237, 0.18);
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
    border-bottom: 2px solid #202124;
    min-height: 180px;
  }

  .os-row--bottom .os-cell:last-child {
    border-bottom: none;
  }
}
</style>
