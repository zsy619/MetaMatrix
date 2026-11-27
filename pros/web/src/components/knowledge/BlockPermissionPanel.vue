<script setup lang="ts">
import { computed } from 'vue'
import {
  BLOCK_PERMISSION_OPTIONS,
  canEditBlockContent,
  canSetBlockPermission,
  normalizeBlockPermission,
  type BlockPermission,
} from './blockPermission'

const props = defineProps<{
  blockId: string
  permission: string
  role: string
  canWrite: boolean
  saving?: boolean
  unavailable?: string
}>()

const emit = defineEmits<{
  change: [permission: BlockPermission]
}>()

const current = computed(() => normalizeBlockPermission(props.permission))
const canSet = computed(() => canSetBlockPermission(props.role, props.canWrite))
const canEdit = computed(() => canEditBlockContent(props.permission, props.role, props.canWrite))
</script>

<template>
  <section class="block-permission-panel" aria-labelledby="block-permission-title">
    <h3 id="block-permission-title">块级权限</h3>
    <p class="block-permission-panel__id">块 {{ blockId }}</p>
    <p v-if="unavailable" class="block-permission-panel__hint">{{ unavailable }}</p>
    <p v-else-if="!canEdit" class="block-permission-panel__hint">你没有权限修改这块的内容。</p>
    <div class="block-permission-panel__options" role="radiogroup" aria-label="块级权限">
      <label v-for="opt in BLOCK_PERMISSION_OPTIONS" :key="opt.value || 'inherit'">
        <input
          type="radio"
          name="block-permission"
          :value="opt.value"
          :checked="current === opt.value"
          :disabled="!canSet || saving || !!unavailable"
          @change="emit('change', opt.value)"
        />
        <span>
          {{ opt.label }}
          <small>{{ opt.hint }}</small>
        </span>
      </label>
    </div>
    <p v-if="!canSet && !unavailable" class="block-permission-panel__hint">
      只有所有者或管理员可以更改块级权限。浏览者不能绕过。
    </p>
  </section>
</template>

<style scoped>
.block-permission-panel {
  margin: 8px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 8px;
  background: var(--mm-bg, #fff);
}
.block-permission-panel h3 { margin: 0 0 4px; font-size: 14px; }
.block-permission-panel__id,
.block-permission-panel__hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--mm-text-3, #86909c);
  word-break: break-all;
}
.block-permission-panel__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.block-permission-panel__options label {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
}
.block-permission-panel__options small {
  display: block;
  color: var(--mm-text-3, #86909c);
  font-size: 12px;
}
</style>
