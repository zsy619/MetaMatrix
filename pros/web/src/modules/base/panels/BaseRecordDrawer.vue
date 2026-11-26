<script setup lang="ts">
/**
 * 记录详情抽屉：逐字段查看与编辑。
 *
 * 编辑结果通过事件抛给上层统一处理（乐观更新 + 乐观锁），
 * 组件本身不直接调接口，保证写入路径只有一条。
 */
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import BaseFieldCell from '../fields/BaseFieldCell.vue'
import { fieldTypeColor, fieldTypeIcon } from '../fields/icons'
import type { FieldMeta, RecordRow } from '../types'

const props = defineProps<{
  row?: RecordRow
  fields: FieldMeta[]
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', payload: { fieldId: string; value: unknown }): void
  (e: 'delete', recordId: string): void
}>()

const orderedFields = computed(() => {
  const primary = props.fields.filter((item) => item.isPrimary)
  const rest = props.fields.filter((item) => !item.isPrimary)
  return [...primary, ...rest]
})
</script>

<template>
  <el-drawer
    :model-value="true"
    :title="row ? '记录详情' : '记录'"
    size="440px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <div v-if="row" class="be-record">
      <div v-for="field in orderedFields" :key="field.id" class="be-record__field">
        <div class="be-record__label">
          <el-icon
            class="be-record__type-icon"
            :style="{ color: fieldTypeColor(field.type) }"
          >
            <component :is="fieldTypeIcon(field.type)" />
          </el-icon>
          <span>{{ field.name }}</span>
          <el-tag v-if="field.type === 'formula'" size="small" effect="plain">公式</el-tag>
        </div>
        <BaseFieldCell
          :field="field"
          :model-value="row.fields?.[field.id]"
          :editable="editable && field.type !== 'formula'"
          @update:model-value="(value) => emit('update', { fieldId: field.id, value })"
        />
      </div>
      <div class="be-panel__hint">版本 {{ row.version }} · 更新于 {{ row.updatedAt }}</div>
    </div>
    <el-empty v-else description="记录不存在" />

    <template #footer>
      <el-button
        v-if="row"
        :icon="Delete"
        type="danger"
        plain
        @click="emit('delete', row.id)"
      >
        删除记录
      </el-button>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-drawer>
</template>
