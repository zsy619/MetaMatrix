<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { reorderDocOutline } from '../../api/knowledge_v5'
import { findOutlineElement, outlineFromHTML, type OutlineHeading } from '../../utils/rteOutline'

const props = defineProps<{ html: string; documentId?: string }>()
const emit = defineEmits<{ reordered: [] }>()

/** 拖拽排序（046）：拖动标题后按新顺序回写正文。 */
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

/** 从编辑器 HTML 抽 h1-h6 作为大纲，带上 data-block-id，供点击跳转。 */
const headings = computed<OutlineHeading[]>(() => outlineFromHTML(props.html))

/** 拖拽开始 / 经过 / 结束。 */
function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  e.dataTransfer?.setData('text/plain', String(index))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, e: DragEvent) {
  e.preventDefault()
  overIndex.value = index
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

async function onDrop(index: number) {
  const from = dragIndex.value
  dragIndex.value = null
  overIndex.value = null
  if (from === null || from === index || !props.documentId) return
  const order = headings.value.map((_, i) => i)
  const [moved] = order.splice(from, 1)
  order.splice(index, 0, moved)
  try {
    await reorderDocOutline(props.documentId, order)
    emit('reordered')
  } catch {
    ElMessage.error('大纲排序失败')
  }
}

function jump(h: OutlineHeading) {
  // 编辑器渲染在父级 .doc-view__editor .ProseMirror 里。
  const root = document.querySelector('.doc-view__editor .ProseMirror') as HTMLElement | null
  if (!root) return
  const target = findOutlineElement(root, h)
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <aside class="doc-outline" v-if="headings.length">
    <div class="doc-outline__title">大纲</div>
    <ul class="doc-outline__list">
      <li
        v-for="(h, index) in headings"
        :key="h.blockId || h.htmlId || (h.level + ':' + h.text + ':' + index)"
        :class="[
          `doc-outline__item is-h${h.level}`,
          { 'is-over': overIndex === index, 'is-dragging': dragIndex === index },
        ]"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @drop="onDrop(index)"
        @dragend="dragIndex = null; overIndex = null"
        @click="jump(h)"
      >
        {{ h.text }}
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.doc-outline {
  padding: 12px 8px 12px 14px;
  overflow: auto;
  font-size: 13px;
}
.doc-outline__title {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  margin-bottom: 8px;
  font-weight: 600;
}
.doc-outline__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.doc-outline__item {
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--mm-text, #1d2129);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
}
.doc-outline__item:hover {
  background: var(--mm-hover, #f2f3f5);
}
.is-h2 { padding-left: 14px; }
.is-h3 { padding-left: 22px; }
.is-h4 { padding-left: 30px; font-size: 12px; color: var(--mm-muted, #86909c); }
.is-h5 { padding-left: 38px; font-size: 12px; color: var(--mm-muted, #86909c); }
.is-h6 { padding-left: 46px; font-size: 12px; color: var(--mm-muted, #86909c); }
.doc-outline__item.is-over { outline: 1px dashed var(--mm-blue, #1677ff); }
.doc-outline__item.is-dragging { opacity: 0.5; }
</style>
