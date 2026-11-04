/**
 * 紧凑工具栏预览页（e2e 用，不进生产入口）。
 *
 * 用途：在没有登录 / 没有后端的环境里渲染富文本编辑器的**紧凑态**（未最大化），
 * 供 scripts/rte-compact-toolbar-e2e.mjs 截图与断言：
 * - 紧凑主栏（高频键，派生自方案 A 分组）；
 * - 「更多」下拉（含图表 9 个一级分类下拉）；
 * - 窄屏（≤720px）下的主栏与「更多」。
 *
 * 页面暴露 window.__RTE_COMPACT_READY__（编辑器是否就绪）。
 */
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import type { CanvasDocumentJSON } from './types/canvas'

const App = {
  setup() {
    const store = useDocumentStore()
    // 造一份最小画布数据：工具栏分组顺序/组内配置都存这里（存不存得下都不影响截图）
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: '紧凑工具栏预览',
    } as unknown as CanvasDocumentJSON
    return () =>
      h(RichTextEditor, {
        modelValue: '<p>紧凑态主栏：高频键由方案 A 分组派生。</p>',
        panelId: 'preview-panel',
        expanded: false,
        compact: true,
        showTitle: false,
        showBottomBar: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

/** 等编辑器渲染出来。 */
const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_COMPACT_READY__ = true
}, 100)
