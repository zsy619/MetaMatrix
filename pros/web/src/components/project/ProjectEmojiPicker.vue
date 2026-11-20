<script setup lang="ts">
/**
 * 项目表情选择器。
 *
 * 只给常用的一小撮：项目图标要的是「一眼认出」，不是完整 emoji 面板。
 */
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const EMOJIS = [
  '📁', '🎯', '🚀', '💡', '🔥', '⭐',
  '🧩', '📊', '🗺️', '🧭', '🛠️', '📝',
  '🧪', '🌱', '🏔️', '🎨', '📌', '🗂️',
  '📈', '🧠', '🏁', '🌟',
]
</script>

<template>
  <div class="emoji-picker" role="listbox" aria-label="项目表情">
    <button
      v-for="emoji in EMOJIS"
      :key="emoji"
      type="button"
      class="emoji-picker__item"
      :class="{ 'is-on': emoji === props.modelValue }"
      role="option"
      :aria-selected="emoji === props.modelValue"
      :aria-label="`表情 ${emoji}`"
      @click="emit('update:modelValue', emoji)"
    >
      {{ emoji }}
    </button>
  </div>
</template>

<style scoped>
.emoji-picker {
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  gap: 4px;
}

.emoji-picker__item {
  height: 30px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.emoji-picker__item:hover {
  background: #f1f3f4;
}

.emoji-picker__item.is-on {
  border-color: #1a73e8;
  background: #e8f0fe;
}
</style>
