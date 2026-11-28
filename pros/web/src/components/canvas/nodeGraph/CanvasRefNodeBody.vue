<script setup lang="ts">
/** 画布节点在卡片上的显示：目标画布的名字。 */
import { computed } from 'vue'
import type { DocumentSummary } from '../../../api/documents'
import type { GraphNode } from '../../../types/nodeGraph'
import { TEMPLATE_META, type TemplateId } from '../../../stores/document'

const props = defineProps<{ node: GraphNode; canvases: DocumentSummary[] }>()

/** 被引用的画布可能已经被删了：找不到就显示「已失效」，不报错。 */
const target = computed(() =>
  props.canvases.find((item) => item.id === props.node.refCanvasId),
)

const templateName = computed(() => {
  if (!props.node.refTemplateId) return ''
  return TEMPLATE_META[props.node.refTemplateId as TemplateId]?.name || ''
})

/** 三种状态：还没选 / 选中的还在 / 选中的被删了。 */
const state = computed<'unset' | 'ok' | 'invalid'>(() => {
  if (props.node.refTemplateId) return 'ok'
  if (!props.node.refCanvasId) return 'unset'
  return target.value ? 'ok' : 'invalid'
})
</script>

<template>
  <div class="ng-body">
    <p class="ng-body__title">{{ node.title || '画布引用' }}</p>
    <p v-if="node.description" class="ng-body__desc">{{ node.description }}</p>
    <p v-if="state === 'ok'" class="ng-body__text">{{ templateName || target?.title }}</p>
    <p v-else-if="state === 'unset'" class="ng-body__text">尚未选择引用画布</p>
    <p v-else class="ng-body__text ng-body__text--invalid">已失效（被引用的画布已被删除）</p>
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-body__text--invalid {
  color: #b45309;
}
</style>
