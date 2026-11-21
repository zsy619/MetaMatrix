<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { reorderDocOutline } from '../../api/knowledge_v5'

const props = defineProps<{ html: string; documentId?: string }>()
const emit = defineEmits<{ reordered: [] }>()

/** 拖拽排序（046）：拖动标题后按新顺序回写正文。 */
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

interface Heading {
  level: number
  text: string
  id: string
}

/** 从编辑器 HTML 抽 h1-h4 作为大纲。
 * TipTap heading 节点序列化为 <h1>...<h4>，id 由 ProseMirror 自动生成或空。
 * 没有 id 的用文本生成锚点。 */
const headings = computed<Heading[]>(() => {
  if (!props.html) return []
  const tmp = document.createElement('div')
  tmp.innerHTML = props.html
  const out: Heading[] = []
  tmp.querySelectorAll('h1,h2,h3,h4').forEach((el, i) => {
    const level = Number(el.tagName.slice(1))
    const text = el.textContent?.trim() || ''
    if (!text) return
    const id = el.id || `heading-${i}-${text.slice(0, 20)}`
    out.push({ level, text, id })
  })
  return out
})

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

function jump(h: Heading) {
  // 编辑器渲染在父级 .doc-view__editor .ProseMirror 里。
  const root = document.querySelector('.doc-view__editor .ProseMirror') as HTMLElement | null
  if (!root) return
  const target = root.querySelector(`#${CSS.escape(h.id)}`) as HTMLElement | null
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    // 没有匹配 id 时按文本找第一个同级 heading。
    const all = root.querySelectorAll(`h${h.level}`)
    for (const el of all) {
      if (el.textContent?.trim() === h.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }
}
</script>

<template>
  <aside class="doc-outline" v-if="headings.length">
    <div class="doc-outline__title">大纲</div>
    <ul class="doc-outline__list">
      <li
        v-for="(h, index) in headings"
        :key="h.id"
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
.doc-outline__item.is-over { outline: 1px dashed var(--mm-blue, #1677ff); }
.doc-outline__item.is-dragging { opacity: 0.5; }
</style>
