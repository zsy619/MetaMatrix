<script setup lang="ts">
/**
 * 知识库右侧面板里的画布。
 *
 * 画布内容在全局 document store 里（CanvasViewport 只认 store），
 * 所以这里按 HomeView 的顺序：先切模板，再把云端文档载入 store。
 */
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import CanvasViewport from '../canvas/CanvasViewport.vue'
import { useDocumentStore } from '../../stores/document'
import { useUiStore } from '../../stores/ui'
import { friendlyApiMessage } from '../../utils/apiMessage'
import IconPicker from '../common/IconPicker.vue'

const props = defineProps<{ documentId: string; templateId: string; icon?: string }>()
const emit = defineEmits<{
  saved: [title: string]
  'open-full': []
  'icon-change': [icon: string]
}>()

const store = useDocumentStore()
const ui = useUiStore()
const { dirty, saving } = storeToRefs(store)

const title = ref('')
const loading = ref(false)
const error = ref('')

async function loadDoc() {
  if (!props.documentId) return
  loading.value = true
  error.value = ''
  try {
    // 先切模板：store 的 load() 会按当前模板做结构归一化，模板不对会渲染错画布。
    if (props.templateId) store.loadFromTemplate(props.templateId)
    await store.load(props.documentId)
    title.value = store.doc_title
  } catch (err) {
    error.value = friendlyApiMessage(err, '加载画布失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.documentId, loadDoc, { immediate: true })

function onTitleInput(event: Event) {
  title.value = (event.target as HTMLInputElement).value
  store.dirty = true
}

async function save() {
  try {
    await store.save({ title: title.value.trim() || undefined })
    ElMessage.success('已保存')
    emit('saved', title.value.trim())
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '保存失败'))
  }
}
</script>

<template>
  <section class="kn-canvas-panel">
    <header class="kn-canvas-panel__head">
      <el-popover trigger="click" placement="bottom-start" :width="340">
        <template #reference>
          <button type="button" class="kn-canvas-panel__icon" title="更换图标" aria-label="更换图标">
            {{ props.icon || '🎨' }}
          </button>
        </template>
        <IconPicker
          :model-value="props.icon || '🎨'"
          :width="320"
          @update:model-value="(icon: string) => emit('icon-change', icon)"
        />
      </el-popover>
      <input
        class="kn-canvas-panel__title"
        :value="title"
        placeholder="无标题画布"
        maxlength="200"
        @input="onTitleInput"
      />
      <span class="kn-canvas-panel__status">
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else class="is-saved">已保存</span>
      </span>
      <el-button size="small" text @click="ui.zoomOut()">－</el-button>
      <el-button size="small" text @click="ui.zoomIn()">＋</el-button>
      <el-button size="small" text @click="emit('open-full')">独立窗口</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
    </header>
    <div v-if="loading" class="kn-canvas-panel__empty">加载中…</div>
    <div v-else-if="error" class="kn-canvas-panel__empty">{{ error }}</div>
    <div v-else class="kn-canvas-panel__body">
      <CanvasViewport />
    </div>
  </section>
</template>

<style scoped>
.kn-canvas-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.kn-canvas-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
  background: var(--mm-surface, #fff);
}
.kn-canvas-panel__icon {
  border: 0;
  background: none;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.kn-canvas-panel__icon:hover {
  background: var(--el-fill-color-light, #f2f3f5);
}
.kn-canvas-panel__title {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 17px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
  background: transparent;
}
.kn-canvas-panel__title:focus {
  border-bottom: 2px solid var(--mm-blue, #1677ff);
}
.kn-canvas-panel__status {
  flex: none;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.kn-canvas-panel__status .is-saved {
  color: var(--el-color-success);
}
.kn-canvas-panel__body {
  flex: 1;
  min-height: 0;
}
.kn-canvas-panel__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
  font-size: 14px;
}
</style>
