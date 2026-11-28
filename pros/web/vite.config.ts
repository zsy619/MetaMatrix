import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * Element Plus 组件 → 按组件子路径。
 *
 * 官方 ElementPlusResolver 统一从 'element-plus/es' 索引导入，
 * 开发态会被 Vite 预打包成单个 ~6MB chunk（首屏全量下载）。
 * 这里改成每个组件从自己的目录导入，开发态只下载真正用到的组件。
 * 少数组件与父组件同目录（dropdown / select / table / form / tabs / avatar / radio / splitter），
 * 用下面的映射表指到父目录。
 */
const EL_COMPONENT_DIR: Record<string, string> = {
  ElAvatarGroup: 'avatar',
  ElDropdownItem: 'dropdown',
  ElDropdownMenu: 'dropdown',
  ElFormItem: 'form',
  ElOption: 'select',
  ElRadioButton: 'radio',
  ElRadioGroup: 'radio',
  ElSplitterPanel: 'splitter',
  ElTabPane: 'tabs',
  ElTableColumn: 'table',
}

function elementPlusComponentResolver(name: string) {
  if (!/^El[A-Z]/.test(name)) return null
  const partial = name
    .slice(2)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
  return {
    name,
    from: `element-plus/es/components/${EL_COMPONENT_DIR[name] ?? partial}/index`,
  }
}

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
  plugins: [
    vue(),
    // Element Plus 按需引入：只打包模板里真正用到的 el-* 组件，
    // 不再整库引入（整库会让首屏多带 ~7MB 开发依赖、生产包多带整份组件库）。
    // 组件按需自动引入；样式统一走 main.ts 的 element-plus/dist/index.css，
    // 避免按组件再打一遍样式包。
    Components({
      resolvers: [
        { type: 'component', resolve: elementPlusComponentResolver },
      ],
      dts: false,
    }),
  ],
  resolve: {
    dedupe: [...PROSEMIRROR_DEDUPE, '@tiptap/pm', '@tiptap/core'],
    alias: [
      // echarts-gl 内部 import 'echarts/lib/echarts'，必须与应用侧的 'echarts/core'
      // 指向同一个模块实例，否则会拿到两套 core（地图注册、扩展注册互不可见）。
      { find: /^echarts\/lib\/echarts(\.js)?$/, replacement: 'echarts/core' },
      // 脚本侧的 ElMessage / ElMessageBox 改走按组件子路径，避免整库进首屏。
      {
        find: /^element-plus$/,
        replacement: fileURLToPath(new URL('./src/utils/elementPlus.ts', import.meta.url)),
      },
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
