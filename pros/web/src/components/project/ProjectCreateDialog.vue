<script setup lang="ts">
/** 新建项目对话框：项目名 + 表情。 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import IconPicker from '../common/IconPicker.vue'

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
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <label class="field">
      <span class="field__label">项目名称</span>
      <el-input v-model="name" placeholder="例如：2026 增长实验" maxlength="120" @keydown.enter="submit" />
    </label>
    <div class="field">
      <span class="field__label">项目表情</span>
      <IconPicker v-model="emoji" />
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
</style>
