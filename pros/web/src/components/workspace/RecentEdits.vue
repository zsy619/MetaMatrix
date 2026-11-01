<script setup lang="ts">
import type { RecentEdit } from '../../api/documents'
import { isTemplateId, type TemplateId } from '../../stores/document'
import { accentOf, templateName } from './palette'
import { formatWhen } from './statsFormat'

defineProps<{
  items: RecentEdit[]
  interactive: boolean
}>()

function templateParam(item: RecentEdit): TemplateId {
  if (item.templateId && isTemplateId(item.templateId)) return item.templateId
  const asId = (item.canvasType || '').replace(/_/g, '-')
  if (isTemplateId(asId)) return asId
  return 'dual-triangle'
}
</script>

<template>
  <ul v-if="items.length" class="rows">
    <li v-for="item in items" :key="item.id">
      <router-link
        v-if="interactive"
        class="row"
        :to="{ name: 'canvas', params: { templateId: templateParam(item) }, query: { documentId: item.id } }"
      >
        <span class="mark" :style="{ background: accentOf(item.templateId || item.canvasType) }" aria-hidden="true" />
        <span class="copy">
          <strong>{{ item.title || '未命名文档' }}</strong>
          <em>{{ templateName(item.templateId || item.canvasType) }}</em>
        </span>
        <time :datetime="item.updatedAt">{{ formatWhen(item.updatedAt) }}</time>
      </router-link>
      <div v-else class="row static">
        <span class="mark" :style="{ background: accentOf(item.templateId || item.canvasType) }" aria-hidden="true" />
        <span class="copy">
          <strong>{{ item.title || '未命名文档' }}</strong>
          <em>{{ templateName(item.templateId || item.canvasType) }}</em>
        </span>
        <time :datetime="item.updatedAt">{{ formatWhen(item.updatedAt) }}</time>
      </div>
    </li>
  </ul>
  <p v-else class="muted">还没有可打开的画布。</p>
</template>

<style scoped>
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
}

a.row:hover,
a.row:focus-visible {
  background: #f1f3f4;
}

.copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.copy strong,
.copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy strong {
  font-size: 13px;
  font-weight: 650;
}

.copy em,
time,
.muted {
  font-size: 12px;
  color: var(--mm-muted);
  font-style: normal;
}

.mark {
  width: 8px;
  height: 28px;
  border-radius: 99px;
  flex-shrink: 0;
}

.static {
  cursor: default;
}
</style>
