<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { BusinessModelBlockId, BusinessModelCanvasDocumentJSON } from '../../types/canvas'
import { isBusinessModelCanvasDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'

const props = defineProps<{ doc: BusinessModelCanvasDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const layout: BusinessModelBlockId[][] = [
  ['partners', 'activities', 'value', 'relationships', 'segments'],
  ['resources', 'channels'],
  ['costs', 'revenue'],
]

function block(id: BusinessModelBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}

function update(id: BusinessModelBlockId, text: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isBusinessModelCanvasDoc(doc)) return
    doc.blocks = doc.blocks.map((item) => (item.id === id ? { ...item, text } : item))
  })
}
</script>

<template>
  <div class="bmc" :style="chrome" aria-label="商业模式画布">
    <h2>{{ doc.title }}</h2>
    <div class="bmc-top">
      <section v-for="id in layout[0]" :key="id" :class="id === 'value' ? 'is-value' : ''">
        <h3>{{ block(id)?.title }}</h3>
        <p>{{ block(id)?.hint }}</p>
        <textarea :value="block(id)?.text || ''" :aria-label="block(id)?.title" @change="update(id, ($event.target as HTMLTextAreaElement).value)" />
      </section>
    </div>
    <div class="bmc-mid">
      <section v-for="id in layout[1]" :key="id">
        <h3>{{ block(id)?.title }}</h3>
        <p>{{ block(id)?.hint }}</p>
        <textarea :value="block(id)?.text || ''" :aria-label="block(id)?.title" @change="update(id, ($event.target as HTMLTextAreaElement).value)" />
      </section>
    </div>
    <div class="bmc-bottom">
      <section v-for="id in layout[2]" :key="id">
        <h3>{{ block(id)?.title }}</h3>
        <p>{{ block(id)?.hint }}</p>
        <textarea :value="block(id)?.text || ''" :aria-label="block(id)?.title" @change="update(id, ($event.target as HTMLTextAreaElement).value)" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.bmc { height: 100%; overflow: auto; padding: 16px; color: #202124; }
.bmc h2 { margin: 0 0 10px; font-size: 18px; }
.bmc-top, .bmc-mid, .bmc-bottom { display: grid; gap: 8px; margin-bottom: 8px; }
.bmc-top { grid-template-columns: 1fr 1fr 1.2fr 1fr 1fr; }
.bmc-mid, .bmc-bottom { grid-template-columns: 1fr 1fr; }
section { background: #fff; border: 1px solid #ececec; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; min-height: 120px; }
section.is-value { background: #fef7e0; }
h3 { margin: 0; font-size: 14px; }
p { margin: 2px 0 6px; color: #5f6368; font-size: 12px; }
textarea { flex: 1; width: 100%; border: 0; resize: vertical; font: inherit; min-height: 64px; background: transparent; }
</style>
