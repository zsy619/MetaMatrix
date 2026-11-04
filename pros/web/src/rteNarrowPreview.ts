/**
 * 窄屏（375 / 768）溢出预览页（e2e 用，不进生产入口）。
 *
 * 用途：在真实浏览器里打开富文本编辑器 + 极端内容（宽表格 / 图表 / 代码块 / 长链接），
 * 供 scripts/rte-narrow-e2e.mjs 断言 `document.documentElement.scrollWidth <= innerWidth`
 * 并定位「右边界超出视口」的元素。
 *
 * 页面暴露：
 * - window.__RTE_PREVIEW_READY__：编辑器是否就绪；
 * - window.__rte：编辑器实例引用。
 */
import { createApp, h, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import { serializeEchartsOption, buildTemplateOption } from './utils/rteEchartsOption'
import type { CanvasDocumentJSON } from './types/canvas'

/** 宽表格：10 列，列宽固定 140px —— 桌面正常，窄屏必然超宽。 */
function buildWideTable(): string {
  const cols = 10
  const head = Array.from({ length: cols }, (_, i) => `<th><p>列${i + 1}列宽固定</p></th>`).join('')
  const rows = Array.from({ length: 3 }, (_, r) => {
    const cells = Array.from(
      { length: cols },
      (_, c) => `<td><p>第${r + 1}行第${c + 1}列内容不换行也不截断</p></td>`,
    ).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<table><tbody><tr>${head}</tr>${rows}</tbody></table>`
}

/** 代码块：一行很长的代码，验证 pre 的横向滚动容器。 */
const LONG_CODE =
  'const veryLongVariableName = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 这一行故意写得很长很长很长很长很长很长很长'

/** 长链接 + 长单词 + 段落文本。 */
const LONG_URL =
  'https://metamatrix.example.com/dashboard/very/long/path/segment?queryParam=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&another=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function buildInitialHtml(): string {
  const option = serializeEchartsOption(buildTemplateOption('bar'))
  const chartAttrs = [
    'data-type="echarts-block"',
    'data-chart-type="bar"',
    `data-option='${option.replace(/'/g, '&#39;')}'`,
    'data-chart-id="preview-bar"',
  ].join(' ')

  return [
    '<h2>窄屏溢出测试</h2>',
    '<p>普通段落文字，用于验证基础排版在窄屏下不产生横向滚动。</p>',
    `<p><a href="${LONG_URL}" class="rte-link">${LONG_URL}</a></p>`,
    '<p>SupercalifragilisticexpialidociousWithoutAnyBreakPointInTheMiddleOfTheWord</p>',
    buildWideTable(),
    `<pre><code class="language-javascript">${LONG_CODE}</code></pre>`,
    `<div ${chartAttrs}><div class="rte-echarts-fallback">ECharts 图表</div></div>`,
    '<p>结尾段落。</p>',
  ].join('')
}

const App = {
  setup() {
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: '窄屏预览',
    } as unknown as CanvasDocumentJSON
    const rteRef = ref<{ editor?: unknown } | null>(null)
    onMounted(() => {
      ;(window as unknown as Record<string, unknown>).__rte = rteRef.value
    })
    return () =>
      h(RichTextEditor, {
        ref: rteRef,
        modelValue: buildInitialHtml(),
        panelId: 'narrow-preview-panel',
        expanded: true,
        showTitle: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
