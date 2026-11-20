<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getKnowledgeGraph } from '../../api/knowledge'
import type { KnowledgeGraph } from '../../api/knowledge'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ 'open-node': [documentId: string] }>()

const graph = ref<KnowledgeGraph>({ nodes: [], edges: [] })
const loading = ref(false)

interface Placed {
  id: string
  title: string
  x: number
  y: number
  nodeType: string
  documentId: string
}

const placed = computed<Placed[]>(() => {
  const nodes = graph.value.nodes
  const cx = 320
  const cy = 240
  const radius = Math.min(220, 60 + nodes.length * 8)
  return nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2
    return {
      id: node.id,
      title: node.title,
      nodeType: node.nodeType,
      documentId: node.documentId,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    }
  })
})

const position = computed(() => {
  const map = new Map<string, Placed>()
  for (const node of placed.value) map.set(node.id, node)
  return map
})

const edges = computed(() =>
  graph.value.edges
    .map((edge) => {
      const from = position.value.get(edge.source)
      const to = position.value.get(edge.target)
      if (!from || !to) return null
      return { ...edge, from, to }
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null),
)

async function load() {
  loading.value = true
  try {
    graph.value = await getKnowledgeGraph(props.projectId)
  } catch {
    ElMessage.error('加载知识图谱失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.projectId, load)
onMounted(load)
</script>

<template>
  <section class="kg">
    <header class="kg__head">
      <span class="kg__title">知识图谱</span>
      <span class="kg__hint">{{ graph.nodes.length }} 个节点 · {{ graph.edges.length }} 条关系</span>
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </header>
    <div v-if="loading" class="kg__empty">加载中…</div>
    <div v-else-if="!graph.nodes.length" class="kg__empty">还没有节点，先在目录里创建文档。</div>
    <div v-else class="kg__canvas">
      <svg viewBox="0 0 640 480" class="kg__svg">
        <g v-for="(edge, index) in edges" :key="index">
          <line
            :x1="edge.from.x"
            :y1="edge.from.y"
            :x2="edge.to.x"
            :y2="edge.to.y"
            :stroke="edge.type === 'reference' ? '#ff8800' : '#c9cdd4'"
            :stroke-dasharray="edge.type === 'reference' ? '4 3' : ''"
            stroke-width="1.5"
          />
        </g>
        <g
          v-for="node in placed"
          :key="node.id"
          class="kg__node"
          @click="node.documentId && emit('open-node', node.documentId)"
        >
          <circle :cx="node.x" :cy="node.y" r="7" fill="#1677ff" />
          <text :x="node.x + 12" :y="node.y + 4" font-size="12" fill="#1d2129">
            {{ node.title.length > 12 ? node.title.slice(0, 12) + '…' : node.title }}
          </text>
        </g>
      </svg>
      <p class="kg__legend">
        <span><i class="kg__dot kg__dot--tree" />目录关系</span>
        <span><i class="kg__dot kg__dot--ref" />文档引用</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.kg {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--mm-surface, #fff);
}
.kg__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.kg__title {
  font-size: 16px;
  font-weight: 600;
}
.kg__hint {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.kg__head .el-button {
  margin-left: auto;
}
.kg__canvas {
  flex: 1;
  overflow: auto;
  padding: 12px;
}
.kg__svg {
  width: 100%;
  max-width: 860px;
  height: auto;
}
.kg__node {
  cursor: pointer;
}
.kg__legend {
  display: flex;
  gap: 16px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.kg__legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.kg__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.kg__dot--tree {
  background: #c9cdd4;
}
.kg__dot--ref {
  background: #ff8800;
}
.kg__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
  font-size: 14px;
}
</style>
