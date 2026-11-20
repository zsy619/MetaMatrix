<script setup lang="ts">
/**
 * 富文本节点的最大化编辑（双击节点打开）。
 *
 * 用房屋标准的最大化浮层（.pm-overlay，src/styles/panel-maximize.css），
 * 富文本走 expanded 模式铺满整屏，与其它画布的「放大编辑」同一套手感。
 * 画布节点不走这里：双击直接打开那张画布（见 views/NodeGraphView.vue）。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import RichTextEditor from '../../RichTextEditor.vue'
import type { GraphNode } from '../../../types/nodeGraph'
import { useNodeGraphStore } from '../../../stores/nodeGraph'

const props = defineProps<{ node: GraphNode }>()
const emit = defineEmits<{ close: [] }>()
const store = useNodeGraphStore()

function onContent(value: string) {
  store.updateNode(props.node.id, { content: value })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

// 捕获阶段监听：编辑器自己会吞掉 Esc（冒泡阶段收不到），
// 最大化层要能直接用 Esc 退出。
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div
      class="pm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="node.title || '节点内容'"
      @click.self="emit('close')"
    >
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ node.title || '节点内容' }}</h3>
          <div class="pm-actions">
            <button
              type="button"
              class="pm-icon-btn pm-close"
              title="关闭"
              aria-label="关闭"
              @click="emit('close')"
            >
              ×
            </button>
          </div>
        </div>

        <div class="pm-body">
          <RichTextEditor
            class="pm-rte"
            :expanded="true"
            :compact="false"
            :show-title="false"
            :show-publish-actions="false"
            :show-markdown-hint="false"
            placeholder="在这里写正文：加粗、斜体、标题、列表、链接、图片、代码块"
            :model-value="node.content || ''"
            @update:model-value="onContent"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
