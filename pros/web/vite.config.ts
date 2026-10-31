import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * TipTap / ProseMirror 必须整树共用同一份 prosemirror-view。
 * 否则 Plugin 返回的 DecorationSet 与 EditorView 内 DecorationGroup
 * 的 instanceof 对不上 → localsInner 读 undefined（RichTextEditor mount 崩）。
 * 混用 npm flat + pnpm 嵌套、或 mermaid 等大包优化后尤易复现。
 */
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
