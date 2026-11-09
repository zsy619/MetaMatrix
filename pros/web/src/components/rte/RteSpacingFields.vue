<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * 段距面板里的五个选项。
 * 不用原生 select：外层 mousedown.prevent 会拦住系统下拉，移到系统列表上还会把面板关掉。
 */
const props = defineProps<{
  marginTop: string
  marginBottom: string
  letterSpacing: string
  textIndent: string
  textDir: string
}>()

const emit = defineEmits<{
  marginTop: [value: string]
  marginBottom: [value: string]
  letterSpacing: [value: string]
  textIndent: [value: string]
  textDir: [value: '' | 'ltr' | 'rtl']
}>()

const GROUPS = [
  {
    key: 'marginTop',
    label: '段前',
    options: [
      { value: '', label: '默认' },
      { value: '0', label: '0' },
      { value: '0.5em', label: '0.5em' },
      { value: '1em', label: '1em' },
      { value: '1.5em', label: '1.5em' },
      { value: '2em', label: '2em' },
      { value: '3em', label: '3em' },
    ],
  },
  {
    key: 'marginBottom',
    label: '段后',
    options: [
      { value: '', label: '默认' },
      { value: '0', label: '0' },
      { value: '0.5em', label: '0.5em' },
      { value: '1em', label: '1em' },
      { value: '1.5em', label: '1.5em' },
      { value: '2em', label: '2em' },
      { value: '3em', label: '3em' },
    ],
  },
  {
    key: 'letterSpacing',
    label: '字间距',
    options: [
      { value: '', label: '默认' },
      { value: '0', label: '0' },
      { value: '0.05em', label: '0.05em' },
      { value: '0.1em', label: '0.1em' },
      { value: '0.15em', label: '0.15em' },
      { value: '0.2em', label: '0.2em' },
      { value: '0.3em', label: '0.3em' },
    ],
  },
  {
    key: 'textIndent',
    label: '首行缩进',
    options: [
      { value: '', label: '无' },
      { value: '2em', label: '2 字符' },
      { value: '3em', label: '3 字符' },
      { value: '4em', label: '4 字符' },
    ],
  },
  {
    key: 'textDir',
    label: '文字方向',
    options: [
      { value: '', label: '默认' },
      { value: 'ltr', label: '从左到右' },
      { value: 'rtl', label: '从右到左' },
    ],
  },
] as const

type GroupKey = (typeof GROUPS)[number]['key']

const openKey = ref<GroupKey | ''>('')
const picked = ref<Record<GroupKey, string>>({
  marginTop: '',
  marginBottom: '',
  letterSpacing: '',
  textIndent: '',
  textDir: '',
})

watch(
  () => [props.marginTop, props.marginBottom, props.letterSpacing, props.textIndent, props.textDir] as const,
  ([marginTop, marginBottom, letterSpacing, textIndent, textDir]) => {
    picked.value = { marginTop, marginBottom, letterSpacing, textIndent, textDir }
  },
  { immediate: true },
)

function shown(group: (typeof GROUPS)[number]) {
  const value = picked.value[group.key]
  return group.options.find((opt) => opt.value === value)?.label || group.options[0].label
}

function toggle(key: GroupKey) {
  openKey.value = openKey.value === key ? '' : key
}

function choose(key: GroupKey, value: string) {
  picked.value = { ...picked.value, [key]: value }
  openKey.value = ''
  if (key === 'marginTop') emit('marginTop', value)
  else if (key === 'marginBottom') emit('marginBottom', value)
  else if (key === 'letterSpacing') emit('letterSpacing', value)
  else if (key === 'textIndent') emit('textIndent', value)
  else emit('textDir', value as '' | 'ltr' | 'rtl')
}
</script>

<template>
  <div data-rte-own class="rte-spacing-fields">
    <div data-rte-own v-for="group in GROUPS" :key="group.key" class="rte-spacing-row">
      <span data-rte-own class="rte-spacing-label">{{ group.label }}</span>
      <div data-rte-own class="rte-spacing-pick">
        <button
          data-rte-own
          type="button"
          class="rte-spacing-trigger"
          :class="{ 'is-open': openKey === group.key }"
          :aria-expanded="openKey === group.key"
          :aria-label="group.label"
          @click="toggle(group.key)"
        >
          <span data-rte-own>{{ shown(group) }}</span>
          <span data-rte-own class="rte-spacing-caret" aria-hidden="true" />
        </button>
        <div
          data-rte-own
          v-if="openKey === group.key"
          class="rte-spacing-options"
          role="listbox"
          :aria-label="group.label"
        >
          <button
            data-rte-own
            v-for="opt in group.options"
            :key="group.key + '-' + (opt.value || 'default')"
            type="button"
            class="rte-spacing-option"
            role="option"
            :aria-selected="picked[group.key] === opt.value"
            :class="{ 'is-on': picked[group.key] === opt.value }"
            @click="choose(group.key, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
