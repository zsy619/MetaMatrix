<script setup lang="ts">
/**
 * 高级 JSON 区块：编辑整份 ECharts option。
 *
 * - CodeMirror 懒加载（components/rte/codemirror/jsonEditor.ts）；
 * - 「应用」时过一遍净化器，非法 JSON / 超限直接报错，不写回文档。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EditorView } from '@codemirror/view'
import type { useChartPanel } from './useChartPanel'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const host = ref<HTMLElement | null>(null)
const loading = ref(true)
const failed = ref(false)
const text = ref('')
const dirty = ref(false)
let view: EditorView | null = null

async function load() {
  // 宿主 div 一直在模板里（不随 loading 切换），所以这里拿得到
  if (!host.value) {
    loading.value = false
    failed.value = true
    return
  }
  try {
    const mod = await import('../codemirror/jsonEditor')
    view = mod.createJsonEditor({
      doc: text.value,
      parent: host.value,
      onChange: (value) => {
        text.value = value
        dirty.value = true
      },
    })
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  text.value = JSON.stringify(props.panel.draft, null, 2)
  void load()
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(
  () => props.panel.target?.chartId,
  () => {
    text.value = JSON.stringify(props.panel.draft, null, 2)
    dirty.value = false
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text.value },
    })
  },
)

function apply() {
  const ok = props.panel.applyFullJson(text.value)
  if (ok) {
    dirty.value = false
    props.panel.hint = '已应用高级 JSON'
  }
}
</script>

<template>
  <div class="rte-cp-section">
    <h4 class="rte-cp-section-title">高级 JSON</h4>
    <p class="rte-cp-field-hint">schema 未覆盖的字段在这里改；保存前会按白名单校验。</p>
    <div v-if="loading" class="rte-cp-field-hint">加载编辑器…</div>
    <textarea
      v-else-if="failed"
      class="rte-cp-textarea rte-cp-textarea-code"
      rows="12"
      spellcheck="false"
      :value="text"
      @input="(e) => { text = (e.target as HTMLTextAreaElement).value; dirty = true }"
    ></textarea>
    <!-- 宿主容器始终存在，CodeMirror 挂载后才有内容 -->
    <div ref="host" class="rte-cp-cm" :class="{ 'is-hidden': loading || failed }"></div>
    <div class="rte-cp-row-actions">
      <button type="button" class="rte-cp-mini rte-cp-mini-primary" @click="apply">
        应用 JSON
      </button>
      <span v-if="dirty" class="rte-cp-field-hint">有未应用的改动</span>
    </div>
  </div>
</template>
