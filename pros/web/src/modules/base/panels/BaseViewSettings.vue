<script setup lang="ts">
/**
 * 视图配置：名称、字段显隐、列宽。
 *
 * 配置写回视图记录（base_view.config），
 * 切换视图时自动生效，换设备也保持一致。
 */
import { ref, watch } from 'vue'
import type { BaseView, FieldMeta } from '../types'

const props = defineProps<{
  view: BaseView
  fields: FieldMeta[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: { name: string; config: Record<string, unknown> }): void
}>()

const name = ref(props.view.name)
const visibility = ref<Record<string, boolean>>({})
const widths = ref<Record<string, number>>({})

watch(
  () => props.view,
  (view) => {
    name.value = view.name
    const vis = view.config?.fieldVisibility ?? {}
    const w = view.config?.fieldWidths ?? {}
    visibility.value = {}
    widths.value = {}
    for (const field of props.fields) {
      visibility.value[field.id] = vis[field.id] !== false
      widths.value[field.id] = w[field.id] ?? (field.isPrimary ? 200 : 140)
    }
  },
  { immediate: true, deep: true },
)

function save() {
  emit('save', {
    name: name.value.trim() || props.view.name,
    config: {
      ...props.view.config,
      fieldVisibility: visibility.value,
      fieldWidths: widths.value,
    },
  })
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="视图配置"
    width="620px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <el-input v-model="name" placeholder="视图名称" maxlength="40" show-word-limit />

      <div class="be-panel__hint">字段显隐与列宽会保存到当前视图，切换视图时自动生效。</div>

      <div class="be-view-settings__list">
        <div v-for="field in fields" :key="field.id" class="be-view-settings__row">
          <el-checkbox v-model="visibility[field.id]">{{ field.name }}</el-checkbox>
          <el-input-number
            v-model="widths[field.id]"
            :min="80"
            :max="600"
            :step="20"
            size="small"
            controls-position="right"
            :disabled="visibility[field.id] === false"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-view-settings__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}

.be-view-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-sm);
}
</style>
