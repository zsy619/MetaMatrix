/**
 * 选区浮动工具条预览页（e2e 用，不进生产入口）。
 *
 * 用途：在真实浏览器里打开富文本编辑器，准备「多段正文 + 代码块 + 图表块」，
 * 供 scripts/rte-selection-bubble-e2e.mjs 做跨段落拖选与工具条截图。
 *
 * 页面暴露：
 * - window.__RTE_PREVIEW_READY__：编辑器是否就绪；
 * - window.__rte：编辑器实例（方便脚本读 HTML / 选区）。
 */
import { createApp, h, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'
// 与生产入口（src/main.ts）保持一致：预览页也要带 Element Plus 的样式。
import 'element-plus/dist/index.css'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import { buildTemplateOption, serializeEchartsOption } from './utils/rteEchartsOption'

/** 三段正文 + 代码块 + 图表块：用来验证跨段落选区与「代码块 / 图表块内不出现」。 */
function buildInitialHtml(): string {
  const option = serializeEchartsOption(buildTemplateOption('bar'))
  const chart = `<div data-type="echarts-block" data-chart-type="bar" data-option='${option.replace(
    /'/g,
    '&#39;',
  )}'><div class="rte-echarts-fallback">ECharts 图表</div></div>`
  return [
    '<p>第一段落：按住鼠标从这一段拖到第二段，就能一次选中两段文字。</p>',
    '<p>第二段落：选区工具条会浮在选区上方，改字号时两段会一起生效。</p>',
    '<p>第三段落：不在选区里的段落不会被改动，可以用来对照。</p>',
    '<pre><code>const answer = 42</code></pre>',
    chart,
  ].join('')
}

const App = {
  setup() {
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: '选区气泡',
    } as unknown as never
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

/** 等编辑器渲染出来。 */
const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_PREVIEW_READY__ = true
}, 100)
