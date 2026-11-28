<script setup lang="ts">
/** 新建项目对话框：项目名 + 表情。 */
import { defineAsyncComponent, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
// 图标库（1000+ 图标，~180KB 源码）按需加载：只在弹窗真正打开时下载。
const IconPicker = defineAsyncComponent(() => import('../common/IconPicker.vue'))

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [payload: { name: string; emoji: string }]
}>()

const name = ref('')
const emoji = ref('📁')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = ''
      emoji.value = '📁'
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function submit() {
  const clean = name.value.trim()
  if (!clean) {
    ElMessage.warning('请输入项目名称')
    return
  }
  emit('created', { name: clean, emoji: emoji.value })
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="新建项目"
    width="min(880px, 94vw)"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="pc-edit">
      <section class="pc-edit__side">
        <div class="pc-edit__preview">
          <span class="pc-edit__emoji">{{ emoji || '📁' }}</span>
          <div class="pc-edit__preview-text">
            <strong>{{ name.trim() || '未命名项目' }}</strong>
            <span>选择一个表情标识项目</span>
          </div>
        </div>
        <label class="field">
          <span class="field__label">项目名称</span>
          <el-input v-model="name" placeholder="例如：2026 增长实验" maxlength="120" @keydown.enter="submit" />
        </label>
        <p class="field__hint">创建后可在项目详情中补充描述、进度与画布。</p>
      </section>
      <section class="pc-edit__main">
        <span class="field__label">项目表情</span>
        <IconPicker v-model="emoji" :width="520" />
      </section>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :icon="Plus" @click="submit">创建项目</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.field {
  display: block;
  margin-bottom: 14px;
}

.field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #5f6368;
}

.field__hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--mm-muted, #5f6368);
}

/* 与「编辑项目信息」保持一致的两栏布局 */
.pc-edit {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.pc-edit__preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: var(--glass-shadow-sm, 0 2px 8px rgba(15, 23, 42, 0.06));
}

.pc-edit__emoji {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  font-size: 24px;
  line-height: 1;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
}

.pc-edit__preview-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pc-edit__preview-text strong {
  font-size: 14px;
  font-weight: 650;
  color: var(--cv-ink, #3c4043);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-edit__preview-text span {
  font-size: 12px;
  color: var(--mm-muted, #5f6368);
}

.pc-edit__main {
  min-width: 0;
}

@media (max-width: 760px) {
  .pc-edit {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  /* IconPicker 宽度是内联样式，窄屏必须强制覆盖，否则撑破弹窗 */
  .pc-edit__main :deep(.icon-picker) {
    width: 100% !important;
  }
}
</style>
