<script setup lang="ts">
/**
 * 富文本编辑器的「HTML 源码」面板：CodeMirror 6 着色 + 格式化 + 导出代码图片。
 *
 * CodeMirror 通过动态 import 懒加载，只有进入源码模式才会下载对应 chunk，
 * 不影响普通编辑 / 只读预览路径。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { EditorView } from '@codemirror/view'
import { formatHtml } from '../../utils/rteHtmlFormat'
import { exportCodeImage } from '../../utils/rteCodeImage'

type CmModule = typeof import('./codemirror/htmlEditor')

const props = withDefaults(defineProps<{ modelValue: string; title?: string }>(), {
  title: 'index.html',
})
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const host = ref<HTMLElement | null>(null)
const loading = ref(true)
const failed = ref(false)
const exporting = ref(false)
let view: EditorView | null = null
let cmModule: CmModule | null = null

function currentCode(): string {
  return view ? view.state.doc.toString() : props.modelValue
}

function setDoc(next: string) {
  if (!view) return
  const current = view.state.doc.toString()
  if (current === next) return
  view.dispatch({ changes: { from: 0, to: current.length, insert: next } })
}

async function load() {
  if (!host.value) return
  try {
    const mod = await import('./codemirror/htmlEditor')
    cmModule = mod
    view = mod.createHtmlEditor({
      doc: props.modelValue,
      parent: host.value,
      onChange: (value) => emit('update:modelValue', value),
    })
  } catch (err) {
    console.warn('[RTE] CodeMirror 源码编辑器加载失败，回退到纯文本', err)
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(
  () => props.modelValue,
  (next) => {
    if (!view) return
    setDoc(next)
  },
)

function onFormat() {
  const next = formatHtml(currentCode())
  setDoc(next)
  emit('update:modelValue', next)
  ElMessage.success('已格式化 HTML 源码')
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(currentCode())
    ElMessage.success('已复制源码')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function onExportImage() {
  if (!cmModule || exporting.value) return
  exporting.value = true
  try {
    const code = currentCode()
    const lines = cmModule.renderHighlightedLines(code)
    const fileName = await exportCodeImage({
      lines,
      title: props.title,
      fileName: `code-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`,
    })
    ElMessage.success(`已导出图片：${fileName}`)
  } catch (err) {
    console.warn('[RTE] 导出代码图片失败', err)
    ElMessage.error('导出图片失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="rte-source-code">
    <div class="rte-source-code-bar">
      <span class="rte-source-code-label" id="rte-source-code-label">HTML 源码</span>
      <span class="rte-source-code-actions">
        <button
          type="button"
          class="rte-source-code-btn"
          title="按层级缩进格式化 HTML"
          @click="onFormat"
        >
          格式化
        </button>
        <button type="button" class="rte-source-code-btn" title="复制全部源码" @click="onCopy">复制</button>
        <button
          type="button"
          class="rte-source-code-btn"
          title="导出带行号的代码美化图片（PNG）"
          :disabled="exporting"
          @click="onExportImage"
        >
          {{ exporting ? '导出中…' : '导出图片' }}
        </button>
      </span>
    </div>
    <div
      v-show="!failed"
      ref="host"
      class="rte-source-code-host"
      role="region"
      aria-labelledby="rte-source-code-label"
    />
    <div v-if="loading" class="rte-source-code-hint">正在加载代码编辑器…</div>
    <textarea
      v-if="failed"
      class="rte-source-code-fallback"
      spellcheck="false"
      :value="props.modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>

<style>
.rte-source-code {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.rte-source-code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.rte-source-code-label {
  font-size: 11px;
  color: #9cdcfe;
}

.rte-source-code-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rte-source-code-btn {
  font-size: 11px;
  line-height: 1.6;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #454545;
  background: #2d2d30;
  color: #d4d4d4;
  cursor: pointer;
}

.rte-source-code-btn:hover:not(:disabled) {
  background: #3a3d41;
}

.rte-source-code-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.rte-source-code-host {
  flex: 1;
  min-height: 180px;
  overflow: auto;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background: #1e1e1e;
}

.rte-source-code-host .cm-editor {
  height: 100%;
}

.rte-source-code-host .cm-scroller {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.rte-source-code-hint {
  font-size: 11px;
  color: #8b8b8b;
  padding: 6px 2px;
}

.rte-source-code-fallback {
  flex: 1;
  min-height: 180px;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 10px 12px;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  outline: none;
}
</style>
