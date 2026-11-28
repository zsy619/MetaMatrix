<script setup lang="ts">
/**
 * 分享页里的思维导图只读预览。
 *
 * 与编辑器共用数据模型与自动布局：同一份 nodes/edges，渲染结果一致，
 * 只是没有交互（不能拖拽、不能编辑、不能保存）。
 */
import { computed } from 'vue'
import { applyLayout, migrateMindmap, type MindmapDoc } from './mindmapModel'

const props = defineProps<{ data: unknown }>()

const doc = computed<MindmapDoc>(() => applyLayout(migrateMindmap(props.data), 'mindmap'))

const nodeById = computed(() => new Map(doc.value.nodes.map((n) => [n.id, n])))

/** 折叠节点的子树不画。 */
const visibleNodes = computed(() => {
  const hide = new Set<string>()
  const byId = nodeById.value
  for (const node of doc.value.nodes) {
    if (!node.collapsed) continue
    for (const edge of doc.value.edges) {
      if (edge.source !== node.id) continue
      const child = byId.get(edge.target)
      if (child) hide.add(child.id)
    }
  }
  return doc.value.nodes.filter((n) => !hide.has(n.id))
})

const visibleEdges = computed(() =>
  doc.value.edges.filter(
    (e) => visibleNodes.value.some((n) => n.id === e.source) && visibleNodes.value.some((n) => n.id === e.target),
  ),
)

/** 视图范围：按节点包围盒留出边距。 */
const viewBox = computed(() => {
  const nodes = visibleNodes.value
  if (!nodes.length) return '0 0 400 240'
  const minX = Math.min(...nodes.map((n) => n.x))
  const minY = Math.min(...nodes.map((n) => n.y))
  const maxX = Math.max(...nodes.map((n) => n.x + n.width))
  const maxY = Math.max(...nodes.map((n) => n.y + n.height))
  const pad = 24
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
})

function edgePath(sourceId: string, targetId: string): string {
  const s = nodeById.value.get(sourceId)
  const t = nodeById.value.get(targetId)
  if (!s || !t) return ''
  const x1 = s.x + s.width
  const y1 = s.y + s.height / 2
  const x2 = t.x
  const y2 = t.y + t.height / 2
  const dx = Math.max(30, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

function nodeFill(id: string): string {
  const node = nodeById.value.get(id)
  if (node?.color) return `${node.color}1f`
  return node?.id === doc.value.nodes[0]?.id ? '#e8f1ff' : '#ffffff'
}

function nodeStroke(id: string): string {
  const node = nodeById.value.get(id)
  if (node?.color) return node.color
  return node?.id === doc.value.nodes[0]?.id ? '#3370ff' : '#c9cdd4'
}

function shortText(text: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 24) / 14))
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<template>
  <div class="mm-preview">
    <svg v-if="visibleNodes.length" class="mm-preview__svg" :viewBox="viewBox">
      <path
        v-for="edge in visibleEdges"
        :key="edge.id"
        :d="edgePath(edge.source, edge.target)"
        fill="none"
        stroke="#c9cdd4"
        stroke-width="1.5"
      />
      <g v-for="node in visibleNodes" :key="node.id">
        <rect
          :x="node.x"
          :y="node.y"
          :width="node.width"
          :height="node.height"
          rx="8"
          :fill="nodeFill(node.id)"
          :stroke="nodeStroke(node.id)"
          stroke-width="1.5"
        />
        <text
          :x="node.x + 12"
          :y="node.y + node.height / 2 + 5"
          font-size="13"
          fill="#1d2129"
        >
          {{ shortText(node.title, node.width) }}
        </text>
        <title>{{ node.title }}</title>
      </g>
    </svg>
    <p v-else class="mm-preview__empty">这张导图还没有内容。</p>
  </div>
</template>

<style scoped>
.mm-preview {
  width: 100%;
}
.mm-preview__svg {
  width: 100%;
  height: auto;
  max-height: 70vh;
  display: block;
}
.mm-preview__empty {
  text-align: center;
  color: var(--mm-muted, #86909c);
  font-size: 13px;
  padding: 40px 0;
}
</style>
