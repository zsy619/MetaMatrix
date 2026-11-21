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
import { Check, FullScreen, Minus, Plus, Share } from '@element-plus/icons-vue'
import CanvasViewport from '../canvas/CanvasViewport.vue'
import { useDocumentStore } from '../../stores/document'
import { useUiStore } from '../../stores/ui'
import { friendlyApiMessage } from '../../utils/apiMessage'
import IconPicker from '../common/IconPicker.vue'
import ShareDialog from './ShareDialog.vue'

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
const shareVisible = ref(false)

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
      <div class="kn-canvas-panel__identity">
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
      </div>
      <span
        class="kn-canvas-panel__status"
        :class="{ 'is-saving': saving, 'is-dirty': dirty && !saving, 'is-saved': !dirty && !saving }"
      >
        <i class="kn-canvas-panel__status-dot" />
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else>已保存</span>
      </span>
      <div class="kn-canvas-panel__tools">
        <div class="kn-canvas-panel__zoom" aria-label="画布缩放">
          <button type="button" title="缩小" aria-label="缩小" @click="ui.zoomOut()">
            <el-icon><Minus /></el-icon>
          </button>
          <span>{{ Math.round(ui.zoom * 100) }}%</span>
          <button type="button" title="放大" aria-label="放大" @click="ui.zoomIn()">
            <el-icon><Plus /></el-icon>
          </button>
        </div>
        <i class="kn-canvas-panel__divider" />
        <button type="button" class="kn-canvas-panel__action" @click="emit('open-full')">
          <el-icon><FullScreen /></el-icon><span>独立窗口</span>
        </button>
        <button type="button" class="kn-canvas-panel__action" @click="shareVisible = true">
          <el-icon><Share /></el-icon><span>分享</span>
        </button>
      </div>
      <el-button
        class="kn-canvas-panel__save"
        size="small"
        type="primary"
        :loading="saving"
        @click="save"
      >
        <el-icon v-if="!saving"><Check /></el-icon>
        <span>保存</span>
      </el-button>
    </header>
    <div v-if="loading" class="kn-canvas-panel__empty">加载中…</div>
    <div v-else-if="error" class="kn-canvas-panel__empty">{{ error }}</div>
    <div v-else class="kn-canvas-panel__body">
      <CanvasViewport />
    </div>
    <ShareDialog
      :document-id="props.documentId"
      kind="canvas"
      :visible="shareVisible"
      @close="shareVisible = false"
    />
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
  min-height: 52px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.kn-canvas-panel__identity {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
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
  background: rgba(255, 255, 255, 0.72);
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  white-space: nowrap;
}
.kn-canvas-panel__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a9b0bb;
}
.kn-canvas-panel__status.is-saved {
  color: var(--el-color-success);
}
.kn-canvas-panel__status.is-saved .kn-canvas-panel__status-dot {
  background: var(--el-color-success);
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.14);
}
.kn-canvas-panel__status.is-dirty {
  color: #d46b08;
}
.kn-canvas-panel__status.is-dirty .kn-canvas-panel__status-dot {
  background: #fa8c16;
  box-shadow: 0 0 0 3px rgba(250, 140, 22, 0.14);
}
.kn-canvas-panel__status.is-saving .kn-canvas-panel__status-dot {
  background: var(--el-color-primary);
  animation: kn-pulse 1s ease-in-out infinite;
}
.kn-canvas-panel__tools {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 34px;
  padding: 3px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.46);
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.kn-canvas-panel__zoom {
  display: flex;
  align-items: center;
  gap: 1px;
}
.kn-canvas-panel__zoom button,
.kn-canvas-panel__action {
  border: 0;
  background: transparent;
  color: var(--ent-text-2, #5a6472);
  cursor: pointer;
  transition: background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.kn-canvas-panel__zoom button {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  padding: 0;
}
.kn-canvas-panel__zoom > span {
  width: 40px;
  text-align: center;
  font-size: 11px;
  color: var(--ent-text-2, #5a6472);
  font-variant-numeric: tabular-nums;
}
.kn-canvas-panel__divider {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.kn-canvas-panel__action {
  height: 26px;
  padding: 0 8px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.kn-canvas-panel__zoom button:hover,
.kn-canvas-panel__action:hover {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  transform: translateY(-1px);
}
.kn-canvas-panel__save {
  height: 34px;
  padding: 0 15px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #2f8cff, #1264e8);
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.28);
  font-weight: 600;
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.kn-canvas-panel__save:hover {
  background: linear-gradient(135deg, #3d97ff, #1a6df0);
  box-shadow: 0 8px 20px rgba(22, 119, 255, 0.34);
  transform: translateY(-1px);
  filter: saturate(1.08);
}
@keyframes kn-pulse {
  50% {
    opacity: 0.35;
  }
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
