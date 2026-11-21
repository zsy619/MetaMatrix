<script setup lang="ts">
/**
 * 分享页里的画布只读预览。
 *
 * 画布渲染器只认全局 document store（current_data），
 * 所以这里先切到对应模板，再把分享到的画布数据塞进 store 渲染。
 * 分享页不提供保存入口，改动不会回写到服务端。
 */
import { watch } from 'vue'
import CanvasViewport from '../canvas/CanvasViewport.vue'
import { useDocumentStore } from '../../stores/document'

const props = defineProps<{ templateId: string; data: unknown }>()

const store = useDocumentStore()

function apply() {
  if (!props.templateId) return
  // 先切模板：模板不对会渲染成别的画布组件。
  store.loadFromTemplate(props.templateId)
  store.current_data = props.data as never
}

watch(() => [props.templateId, props.data], apply, { immediate: true })
</script>

<template>
  <div class="shared-canvas">
    <CanvasViewport />
  </div>
</template>

<style scoped>
.shared-canvas {
  height: 70vh;
  min-height: 420px;
  overflow: auto;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 10px;
  background: var(--mm-surface, #fff);
}
</style>
