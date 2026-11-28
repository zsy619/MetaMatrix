<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeNode } from '../../api/knowledge'

const props = defineProps<{
  /** 被打开的文件夹节点。 */
  folder: KnowledgeNode
  /** 文件夹的直接子节点。 */
  children: KnowledgeNode[]
}>()

const emit = defineEmits<{
  /** 打开子节点（文档 / 表格 / 导图 / 画布）。 */
  open: [node: KnowledgeNode]
  /** 返回知识库概览。 */
  back: []
  /** 在该文件夹下新建子节点。 */
  create: [folder: KnowledgeNode]
}>()

const TYPE_LABEL: Record<string, string> = {
  folder: '文件夹',
  doc: '文档',
  canvas: '画布',
  sheet: '多维表格',
  mindmap: '思维导图',
  note: '笔记',
  attachment: '附件',
}

const TYPE_ICON: Record<string, string> = {
  folder: '📁',
  doc: '📄',
  canvas: '🎨',
  sheet: '📊',
  mindmap: '🧠',
  note: '📝',
  attachment: '📎',
}

const rows = computed(() =>
  props.children.map((node) => ({
    node,
    icon: node.icon || TYPE_ICON[node.nodeType] || '📄',
    typeLabel: TYPE_LABEL[node.nodeType] ?? node.nodeType,
    createdAt: formatTime(node.createdAt),
    updatedAt: formatTime(node.updatedAt),
  })),
)

/** 时间只到分钟：列表里要的是「什么时候建的」，秒级没有信息量。 */
function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <section class="fp">
    <header class="fp__head">
      <button type="button" class="fp__back" @click="emit('back')">← 返回知识库</button>
      <div class="fp__title">
        <span class="fp__icon">{{ folder.icon || '📁' }}</span>
        <span class="fp__name">{{ folder.title || '未命名文件夹' }}</span>
        <span class="fp__count">{{ children.length }} 个子项</span>
      </div>
      <button type="button" class="fp__create" @click="emit('create', folder)">+ 新建子文档</button>
    </header>

    <div class="fp__body">
      <div class="fp__list">
        <div class="fp__row fp__row--head">
          <span class="fp__col-name">名称</span>
          <span class="fp__col-type">类型</span>
          <span class="fp__col-time">创建时间</span>
          <span class="fp__col-time">更新时间</span>
          <span class="fp__col-ops">操作</span>
        </div>

        <p v-if="!rows.length" class="fp__empty">这个文件夹还是空的，先新建一个子文档。</p>

        <button
          v-for="row in rows"
          :key="row.node.id"
          type="button"
          class="fp__row"
          @click="emit('open', row.node)"
        >
          <span class="fp__col-name">
            <span class="fp__row-icon">{{ row.icon }}</span>
            <span class="fp__row-name">{{ row.node.title || '未命名' }}</span>
          </span>
          <span class="fp__col-type">
            <span class="fp__tag">{{ row.typeLabel }}</span>
          </span>
          <span class="fp__col-time">{{ row.createdAt }}</span>
          <span class="fp__col-time">{{ row.updatedAt }}</span>
          <span class="fp__col-ops">
            <span class="fp__open">打开</span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fp {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
}

/* 头部：与其它知识库头部同材质（玻璃条） */
.fp__head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}

.fp__back {
  border: none;
  background: transparent;
  padding: 4px 6px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--ent-text-2, #5a6472);
  cursor: pointer;
  transition: background-color 0.16s ease;
}
.fp__back:hover {
  background: rgba(255, 255, 255, 0.62);
}

.fp__title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.fp__icon {
  font-size: 22px;
  line-height: 1;
}
.fp__name {
  font-size: 17px;
  font-weight: 600;
  color: var(--ent-text, #1f2733);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp__count {
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.58);
}

.fp__create {
  margin-left: auto;
  padding: 6px 14px;
  border-radius: 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  background: rgba(255, 255, 255, 0.62);
  color: var(--ent-primary, #1a73e8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}
.fp__create:hover {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  transform: translateY(-1px);
}

.fp__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 24px;
}

/* 列表：玻璃卡片 + 固定列宽，保证图标/名称/时间对齐 */
.fp__list {
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  overflow: hidden;
}

.fp__row {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) 110px 150px 150px 72px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-top: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: transparent;
  font-size: 13px;
  color: var(--ent-text, #1f2733);
  text-align: left;
}

.fp__row--head {
  border-top: none;
  background: rgba(255, 255, 255, 0.34);
  font-size: 12px;
  font-weight: 600;
  color: var(--ent-text-2, #5a6472);
}

button.fp__row {
  cursor: pointer;
  transition: background-color 0.16s ease;
}
button.fp__row:hover {
  background: rgba(255, 255, 255, 0.58);
}

.fp__col-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fp__row-icon {
  font-size: 16px;
  line-height: 1;
}
.fp__row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp__tag {
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
}
.fp__col-time {
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
  font-variant-numeric: tabular-nums;
}
.fp__open {
  font-size: 12px;
  color: var(--ent-primary, #1a73e8);
}

.fp__empty {
  margin: 0;
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ent-text-2, #5a6472);
}
</style>

