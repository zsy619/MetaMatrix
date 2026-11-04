/**
 * 块手柄留白预览页（e2e 用，不进生产入口）。
 *
 * 用途：在真实浏览器里打开富文本编辑器（A4 纸张 + 窄边距），
 * 供 scripts/rte-gutter-handle-e2e.mjs 断言「手柄不压首字」并截图。
 *
 * 页面暴露：
 * - window.__RTE_PREVIEW_READY__：编辑器是否就绪；
 * - window.__rte：编辑器实例引用（拖拽排序断言用）。
 */
import { createApp, h, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import type { CanvasDocumentJSON } from './types/canvas'

/** 夹具：段落 / 列表 / 引用 / 标题，覆盖不同缩进层级。 */
function buildInitialHtml(): string {
  return [
    '<h1>航海案主复盘</h1>',
    '<p>航海案主是一名资深船员，负责航线设计与安全演练。</p>',
    '<p>第二段用来验证悬停时手柄不会压住这一行的第一个字。</p>',
    '<ul><li>列表项第一行</li><li>列表项第二行</li></ul>',
    '<blockquote><p>引用块里的正文也要留出左侧空白。</p></blockquote>',
    '<h2>小标题</h2>',
    '<p>结尾段落。</p>',
  ].join('')
}

const App = {
  setup() {
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: '预览',
    } as unknown as CanvasDocumentJSON
    const rteRef = ref<{ editor?: unknown } | null>(null)
    onMounted(() => {
      ;(window as unknown as Record<string, unknown>).__rte = rteRef.value
    })
    return () =>
      h(RichTextEditor, {
        ref: rteRef,
        modelValue: buildInitialHtml(),
        panelId: 'gutter-preview-panel',
        expanded: true,
        showTitle: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_PREVIEW_READY__ = true
}, 100)
