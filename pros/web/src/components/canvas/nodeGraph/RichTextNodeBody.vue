<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '../../../types/nodeGraph'
import { plainSnippet } from './text'

const props = defineProps<{ node: GraphNode }>()

const snippet = computed(() => plainSnippet(props.node.content, 72))
</script>

<template>
  <div class="ng-body">
    <p class="ng-body__title">{{ node.title || '未命名节点' }}</p>
    <p v-if="node.description" class="ng-body__desc">{{ node.description }}</p>
    <p class="ng-body__text">{{ snippet || '（还没有正文）' }}</p>
  </div>
</template>

<style scoped>
.ng-body {
  min-width: 0;
}

.ng-body__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--ng-ink, #1f2937);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-body__desc {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--ng-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-body__text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ng-muted, #6b7280);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
