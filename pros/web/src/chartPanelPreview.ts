/**
 * 图表属性面板预览页（e2e 用，不进生产入口）。
 *
 * 用途：在真实浏览器里打开富文本编辑器 + 图表属性面板，
 * 供 scripts/rte-chart-panel-e2e.mjs 截图（分组工具栏 / 各类图表属性面板 /
 * 数据表格 / 数据源配置 / 删除确认）。
 *
 * 页面暴露：
 * - window.__RTE_PREVIEW_READY__：编辑器是否就绪；
 * - window.__selectChart(index)：选中第 index 个图表块（属性面板随之弹出）。
 */
import { createApp, h, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'
// 与生产入口（src/main.ts）保持一致：预览页也要带 Element Plus 的样式，
// 否则 ElMessageBox / ElMessage 退化成无样式的普通 DOM，e2e 截不到弹窗。
import 'element-plus/dist/index.css'
import { NodeSelection } from '@tiptap/pm/state'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import { serializeEchartsOption, buildTemplateOption } from './utils/rteEchartsOption'
import type { CanvasDocumentJSON } from './types/canvas'

/** 预览页里的图表类型（覆盖基础 / 统计 / 关系三类，面板形态各不相同）。 */
const PREVIEW_TYPES = ['bar', 'pie', 'graph'] as const

/** 造一个带图表块的初始 HTML。 */
function buildInitialHtml(): string {
  const blocks = PREVIEW_TYPES.map((type) => {
    const option = serializeEchartsOption(buildTemplateOption(type))
    const attrs = [
      'data-type="echarts-block"',
      `data-chart-type="${type}"`,
      `data-option='${option.replace(/'/g, '&#39;')}'`,
      `data-chart-id="preview-${type}"`,
    ].join(' ')
    return `<div ${attrs}><div class="rte-echarts-fallback">ECharts 图表</div></div>`
  })
  return `<p>图表属性面板预览。</p>${blocks.join('')}`
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
        panelId: 'preview-panel',
        expanded: true,
        showTitle: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

/** 选中第 index 个图表块（属性面板随之弹出）。 */
function selectChart(index: number): boolean {
  const holder = (window as unknown as { __rte?: { editor?: unknown } }).__rte
  const ed = holder?.editor as
    | {
        state: any
        view: { dispatch: (tr: unknown) => void }
      }
    | undefined
  if (!ed) return false
  const found: number[] = []
  ed.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name === 'echartsBlock') found.push(pos)
    return true
  })
  const pos = found[index]
  if (pos == null) return false
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)))
  return true
}

;(window as unknown as Record<string, unknown>).__selectChart = selectChart

/** 等编辑器渲染出来。 */
const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_PREVIEW_READY__ = true
}, 100)
