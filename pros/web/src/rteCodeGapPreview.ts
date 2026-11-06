/**
 * 代码块行号/换行与图片组间距的预览页（e2e 用，不进生产入口）。
 *
 * 打开 /rte-code-gap-preview.html。
 * window.__RTE_PREVIEW_READY__ 为 true 后，window.__rte.editor 是 TipTap 实例。
 */
import { createApp, h, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import RichTextEditor from './components/RichTextEditor.vue'
import { useDocumentStore } from './stores/document'
import type { CanvasDocumentJSON } from './types/canvas'

function svg(fill: string, label: string): string {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><rect width="360" height="200" fill="${fill}"/><text x="28" y="112" fill="#ffffff" font-size="36" font-family="sans-serif">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(xml)}`
}

function buildInitialHtml(): string {
  const left = svg('#3370ff', '左图')
  const right = svg('#14c9c9', '右图')
  const longLine =
    'const label = "这一行故意写得很长，用来看自动换行是否把超长代码折进代码块，而不是只靠横向滚动条把字甩出页面。"'
  return [
    '<h1>代码块与图片组</h1>',
    '<p>把光标放进代码块，用浮层的「行号」「换行」。悬停图片组，点间距数字在 0、8、16、24 之间切换。</p>',
    `<pre><code class="language-javascript">function demo() {\n  ${longLine}\n  return label\n}</code></pre>`,
    `<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="${left}" alt="左图"><img src="${right}" alt="右图"></div></div>`,
    '<p>下面这段用来确认 Markdown 输入规则还在：另起一段输入 # 空格应变成标题。</p>',
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
    const rteRef = ref<{ editor?: { getHTML: () => string } } | null>(null)
    onMounted(() => {
      ;(window as unknown as Record<string, unknown>).__rte = rteRef.value
    })
    return () =>
      h(RichTextEditor, {
        ref: rteRef,
        modelValue: buildInitialHtml(),
        panelId: 'code-gap-preview-panel',
        expanded: true,
        showTitle: false,
      })
  },
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

const timer = setInterval(() => {
  if (!document.querySelector('.ProseMirror pre')) return
  if (!document.querySelector('[data-type="image-group"]')) return
  clearInterval(timer)
  ;(window as unknown as Record<string, unknown>).__RTE_PREVIEW_READY__ = true
}, 100)
