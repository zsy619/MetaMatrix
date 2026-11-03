<script setup lang="ts">
/**
 * 属性面板里的一行字段。
 *
 * 按 schema 里声明的 kind 渲染对应控件；值统一以字符串 / 布尔传出，
 * 类型转换由 useChartPanel 负责。
 */
import type { PanelField } from '../../../utils/echarts/panelSchemas'

const props = defineProps<{
  field: PanelField
  value: unknown
}>()

const emit = defineEmits<{ (e: 'update', value: unknown): void }>()

function onText(event: Event) {
  emit('update', (event.target as HTMLInputElement).value)
}

function onNumber(event: Event) {
  emit('update', (event.target as HTMLInputElement).value)
}

function onBoolean(event: Event) {
  emit('update', (event.target as HTMLInputElement).checked)
}

function onSelect(event: Event) {
  emit('update', (event.target as HTMLSelectElement).value)
}

function onColor(event: Event) {
  emit('update', (event.target as HTMLInputElement).value)
}

function onJson(event: Event) {
  emit('update', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <label class="rte-cp-field">
    <span class="rte-cp-field-label">{{ props.field.label }}</span>
    <select
      v-if="props.field.kind === 'select'"
      class="rte-cp-input"
      :value="props.value === null || props.value === undefined ? '' : String(props.value)"
      @change="onSelect"
    >
      <option value="">未设置</option>
      <option v-for="opt in props.field.options || []" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <input
      v-else-if="props.field.kind === 'boolean'"
      type="checkbox"
      :checked="props.value === true"
      @change="onBoolean"
    />
    <input
      v-else-if="props.field.kind === 'number'"
      class="rte-cp-input"
      type="number"
      :min="props.field.min"
      :max="props.field.max"
      :step="props.field.step"
      :value="props.value === null || props.value === undefined ? '' : String(props.value)"
      @change="onNumber"
    />
    <input
      v-else-if="props.field.kind === 'color'"
      class="rte-cp-color"
      type="color"
      :value="String(props.value || '#ffffff')"
      @change="onColor"
    />
    <textarea
      v-else-if="props.field.kind === 'json' || props.field.kind === 'textarea'"
      class="rte-cp-textarea"
      rows="3"
      :placeholder="props.field.placeholder"
      :value="String(props.value ?? '')"
      @change="onJson"
    ></textarea>
    <input
      v-else
      class="rte-cp-input"
      type="text"
      :placeholder="props.field.placeholder"
      :value="String(props.value ?? '')"
      @change="onText"
    />
    <span v-if="props.field.hint" class="rte-cp-field-hint">{{ props.field.hint }}</span>
  </label>
</template>
