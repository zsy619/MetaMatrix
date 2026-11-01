<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { trapTab } from '../../utils/focusTrap'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const card = ref<HTMLElement | null>(null)

const rows = [
  ['Ctrl/⌘ + S', '保存当前画布'],
  ['Esc', '关闭最大化面板、预览或版本对话框'],
  ['Alt + 1', '回到模板库'],
  ['Alt + 2', '打开工作面板'],
  ['?', '打开或关闭这份快捷键说明'],
]

function onKey(event: KeyboardEvent) {
  trapTab(event, card.value)
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    card.value?.focus()
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div
        ref="card"
        class="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        tabindex="-1"
        @keydown="onKey"
      >
        <header>
          <h2 id="keys-title">快捷键</h2>
          <button type="button" class="mm-btn mm-btn--ghost" @click="emit('close')">关闭</button>
        </header>
        <p>在输入框里打字时，除保存外不会抢走按键。最大化仍是全局同时只允许一个面板。</p>
        <ul>
          <li v-for="row in rows" :key="row[0]">
            <kbd>{{ row[0] }}</kbd>
            <span>{{ row[1] }}</span>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 5200;
  background: rgba(32, 33, 36, 0.42);
  display: grid;
  place-items: center;
  padding: 16px;
}
.card {
  width: min(420px, 100%);
  background: var(--mm-surface);
  border-radius: 16px;
  padding: 18px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
h2 { margin: 0; font-size: 18px; }
p { color: var(--mm-muted); font-size: 13px; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
li { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
kbd { font-family: inherit; }
</style>
