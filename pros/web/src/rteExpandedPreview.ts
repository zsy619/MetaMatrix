/**
 * 最大化（Ribbon 功能区）预览页（e2e 用，不进生产入口）。
 *
 * 用途：在无登录 / 无后端环境里渲染富文本编辑器的**最大化功能区**，
 * 供 scripts/rte-ribbon-toolbar-e2e.mjs 截图与断言：
 * - Ribbon 栏目菜单（编辑 / 字体与颜色 / 段落与列表 …）；
 * - 原始 Office/知乎风格按钮（图标 + 文字，44px 高）；
 * - 分组标题胶囊 + 拖拽手柄 + ⚙ 个性化。
 *
 * 页面暴露 window.__RTE_EXPANDED_READY__（编辑器是否就绪）。
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
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: 'Ribbon 功能区预览',
    } as unknown as CanvasDocumentJSON
    return () =>
      h(RichTextEditor, {
        modelValue: '<p>最大化功能区：Office Ribbon 栏目菜单。</p>',
        panelId: 'preview-panel-expanded',
        expanded: true,
        compact: false,
        showTitle: false,
        showBottomBar: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_EXPANDED_READY__ = true
}, 100)
