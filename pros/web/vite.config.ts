import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const require = createRequire(import.meta.url)

/** pnpm 不会把 mammoth 的深层文件暴露成可导入路径，改用绝对路径指向浏览器包。 */
function mammothBrowserEntry(): string | null {
  try {
    return require.resolve('mammoth/mammoth.browser.js')
  } catch {
    return null
  }
}

/**
 * TipTap / ProseMirror 必须整树共用同一份 prosemirror-view。
 * 否则 Plugin 返回的 DecorationSet 与 EditorView 内 DecorationGroup
 * 的 instanceof 对不上 → localsInner 读 undefined（RichTextEditor mount 崩）。
 * 混用 npm flat + pnpm 嵌套、或 mermaid 等大包优化后尤易复现。
 */
const mammothBrowser = mammothBrowserEntry()

const PROSEMIRROR_DEDUPE = [
  'prosemirror-view',
  'prosemirror-state',
  'prosemirror-model',
  'prosemirror-transform',
  'prosemirror-keymap',
  'prosemirror-commands',
  'prosemirror-schema-list',
  'prosemirror-history',
  'prosemirror-dropcursor',
  'prosemirror-gapcursor',
  'prosemirror-tables',
]

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: [...PROSEMIRROR_DEDUPE, '@tiptap/pm', '@tiptap/core'],
    alias: [
      // echarts-gl 内部 import 'echarts/lib/echarts'，必须与应用侧的 'echarts/core'
      // 指向同一个模块实例，否则会拿到两套 core（地图注册、扩展注册互不可见）。
      { find: /^echarts\/lib\/echarts(\.js)?$/, replacement: 'echarts/core' },
      ...(mammothBrowser ? [{ find: /^mammoth$/, replacement: mammothBrowser }] : []),
    ],
  },
  optimizeDeps: {
    include: [
      '@tiptap/pm/view',
      '@tiptap/pm/state',
      '@tiptap/pm/model',
      '@tiptap/pm/transform',
      '@tiptap/core',
      '@tiptap/vue-3',
      'prosemirror-view',
      'prosemirror-state',
      'prosemirror-model',
    ],
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
