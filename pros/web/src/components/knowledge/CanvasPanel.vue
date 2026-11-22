<script setup lang="ts">
/**
 * 知识库右侧面板里的画布。
 *
 * 画布内容在全局 document store 里（CanvasViewport 只认 store），
 * 所以这里按 HomeView 的顺序：先切模板，再把云端文档载入 store。
 */
import { defineAsyncComponent, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Check, FullScreen, Minus, Plus, Share } from '@element-plus/icons-vue'
import CanvasViewport from '../canvas/CanvasViewport.vue'
import { getDocument } from '../../api/documents'
import { useDocumentStore } from '../../stores/document'
import { useUiStore } from '../../stores/ui'
import { friendlyApiMessage } from '../../utils/apiMessage'
// 图标库按需加载：面板首次打开时才下载图标数据。
const IconPicker = defineAsyncComponent(() => import('../common/IconPicker.vue'))
import ShareDialog from './ShareDialog.vue'
import AppLoading from '../common/AppLoading.vue'

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

/** 左侧目录树改了标题：面板用自己的 save_version 存，标题与画布内容一起落库。 */
async function applyTitle(next: string) {
  const clean = next.trim()
  if (!clean || clean === title.value) return
  title.value = clean
  await save()
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
/** 后端改过文档元信息（标题 / 图标）会推进 save_version：刷新它，下一次保存才不会误判冲突。 */
async function refreshSaveVersion() {
  if (!props.documentId) return
  try {
    const fresh = await getDocument(props.documentId)
    store.save_version = fresh.saveVersion ?? store.save_version
  } catch {
    // 刷不到就沿用旧版本号，冲突时走原有的冲突处理流程。
  }
}

defineExpose({ applyTitle, refreshSaveVersion })
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
        class="mm-bar__status"
        :class="{ 'is-saving': saving, 'is-dirty': dirty && !saving, 'is-saved': !dirty && !saving }"
      >
        <i class="mm-bar__status-dot" />
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else>已保存</span>
      </span>
      <div class="mm-bar__group">
        <div class="mm-bar__cluster" aria-label="画布缩放">
          <button
            type="button"
            class="mm-bar__btn mm-bar__btn--square"
            title="缩小"
            aria-label="缩小"
            @click="ui.zoomOut()"
          >
            <el-icon><Minus /></el-icon>
          </button>
          <span class="mm-bar__value">{{ Math.round(ui.zoom * 100) }}%</span>
          <button
            type="button"
            class="mm-bar__btn mm-bar__btn--square"
            title="放大"
            aria-label="放大"
            @click="ui.zoomIn()"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </div>
        <i class="mm-bar__divider" />
        <button type="button" class="mm-bar__btn" @click="emit('open-full')">
          <el-icon><FullScreen /></el-icon><span>独立窗口</span>
        </button>
        <button type="button" class="mm-bar__btn" @click="shareVisible = true">
          <el-icon><Share /></el-icon><span>分享</span>
        </button>
      </div>
      <el-button
        class="mm-bar__primary"
        size="small"
        type="primary"
        :loading="saving"
        @click="save"
      >
        <el-icon v-if="!saving"><Check /></el-icon>
        <span>保存</span>
      </el-button>
    </header>
    <div v-if="loading" class="kn-canvas-panel__empty"><AppLoading /></div>
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
