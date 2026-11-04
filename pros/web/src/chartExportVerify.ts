/**
 * 图表导出像素级复验页（e2e 用，不进生产入口）。
 *
 * 用途：scripts/chart-export-verify.mjs 在真实浏览器里跑导出流水线
 * （md / docx / html / 打印预览 / PNG / PDF），并对导出物里的图表图片做像素统计。
 *
 * 样例文档固定包含 1 个柱状图 + 1 个折线图，
 * 便于逐张比对导出前后是否是同一张图（而不是空白 / 黑底 / 占位）。
 *
 * 页面暴露：
 * - window.__RTE_PREVIEW_READY__：编辑器是否就绪；
 * - window.__RTE_VERIFY_CHARTS__：样例图表数量。
 */
import { createApp, h, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import { serializeEchartsOption, buildTemplateOption } from './utils/rteEchartsOption'
import type { CanvasDocumentJSON } from './types/canvas'

/** 复验样例里的图表类型：柱状图 + 折线图。 */
const VERIFY_TYPES = ['bar', 'line'] as const

/** 造一个带图表块的初始 HTML。 */
function buildInitialHtml(): string {
  const blocks = VERIFY_TYPES.map((type) => {
    const option = serializeEchartsOption(buildTemplateOption(type))
    const attrs = [
      'data-type="echarts-block"',
      `data-chart-type="${type}"`,
      `data-option='${option.replace(/'/g, '&#39;')}'`,
      `data-chart-id="verify-${type}"`,
    ].join(' ')
    return `<div ${attrs}><div class="rte-echarts-fallback">ECharts 图表</div></div>`
  })
  return [
    '<h1>图表导出复验样例</h1>',
    '<p>下面两张图分别走 Markdown / Word / HTML / 打印预览 / PNG / PDF 六条导出链路。</p>',
    '<p>导出物里的图表必须是白底真图，不能是空白块、透明底或黑底。</p>',
    blocks.join(''),
    '<p>复验结束标记。</p>',
  ].join('')
}

const App = {
  setup() {
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: '图表导出复验样例',
    } as unknown as CanvasDocumentJSON
    const rteRef = ref<{ editor?: unknown } | null>(null)
    onMounted(() => {
      ;(window as unknown as Record<string, unknown>).__rte = rteRef.value
    })
    return () =>
      h(RichTextEditor, {
        ref: rteRef,
        modelValue: buildInitialHtml(),
        panelId: 'verify-panel',
        expanded: true,
        showTitle: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

;(window as unknown as Record<string, unknown>).__RTE_VERIFY_CHARTS__ = VERIFY_TYPES.length

/** 等编辑器渲染出来。 */
const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_PREVIEW_READY__ = true
}, 100)
