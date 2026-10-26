<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { ElMessage } from 'element-plus'
import { looksLikeHtml, escapeHtml } from '../utils/itemsHtml'

const props = withDefaults(
  defineProps<{
    modelValue: string
    title?: string
    showTitle?: boolean
    placeholder?: string
    compact?: boolean
    /** 最大化时为 true：展示完整工具条；false 时仅标题/粗/斜/列表/目录 + 更多 */
    expanded?: boolean
    showBottomBar?: boolean
    showPublishActions?: boolean
    showMarkdownHint?: boolean
  }>(),
  {
    title: '',
    showTitle: false,
    placeholder: '请输入正文',
    compact: false,
    expanded: false,
    showBottomBar: true,
    showPublishActions: false,
    showMarkdownHint: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [html: string]
  'update:title': [title: string]
  focus: []
  blur: []
}>()

const localTitle = ref(props.title ?? '')
watch(
  () => props.title,
  (v) => {
    if (v !== localTitle.value) localTitle.value = v ?? ''
  },
)

function onTitleInput(event: Event) {
  const v = (event.target as HTMLInputElement).value.slice(0, 100)
  localTitle.value = v
  emit('update:title', v)
}

function toEditorContent(value: string | undefined | null): string {
  const raw = value ?? ''
  if (!raw.trim()) return '<p></p>'
  if (looksLikeHtml(raw)) return raw
  return `<p>${escapeHtml(raw)}</p>`
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim()
}

const editor = useEditor({
  content: toEditorContent(props.modelValue),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: {},
      blockquote: {},
      horizontalRule: {},
      bulletList: {},
      orderedList: {},
      listItem: {},
    }),
    Underline,
    TextStyle,
    Color,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'rte-link' },
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: { class: 'rte-image' },
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: props.placeholder,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),
  ],
  editorProps: {
    attributes: {
      class: 'rte-prose',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML())
  },
  onFocus: () => emit('focus'),
  onBlur: () => emit('blur'),
})

watch(
  () => props.modelValue,
  (value) => {
    const ed = editor.value
    if (!ed) return
    const next = toEditorContent(value)
    if (normalizeHtml(ed.getHTML()) === normalizeHtml(next)) return
    if (!looksLikeHtml(value ?? '') && ed.getText() === (value ?? '')) return
    ed.commands.setContent(next, { emitUpdate: false })
  },
)

watch(
  () => props.placeholder,
  (ph) => {
    // Placeholder is extension-level; content class still shows attr
    void ph
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

/** 纯文字符数（去空白更贴近中文「字数」） */
const charCount = computed(() => {
  const text = editor.value?.getText() ?? ''
  return Array.from(text.replace(/\s/g, '')).length
})

function chain() {
  return editor.value?.chain().focus()
}

function isActive(name: string, attrs?: Record<string, unknown>) {
  return editor.value?.isActive(name, attrs) ?? false
}

function undo() {
  chain()?.undo().run()
}
function redo() {
  chain()?.redo().run()
}
function clearFormat() {
  chain()?.unsetAllMarks().clearNodes().run()
}
function setHeading(level: 1 | 2 | 3 | 4 | 0) {
  if (level === 0) {
    chain()?.setParagraph().run()
    return
  }
  chain()?.toggleHeading({ level }).run()
}
function toggleBold() {
  chain()?.toggleBold().run()
}
function toggleItalic() {
  chain()?.toggleItalic().run()
}
function toggleBulletList() {
  chain()?.toggleBulletList().run()
}
function toggleOrderedList() {
  chain()?.toggleOrderedList().run()
}
function toggleBlockquote() {
  chain()?.toggleBlockquote().run()
}
function setHorizontalRule() {
  chain()?.setHorizontalRule().run()
}
function toggleCodeBlock() {
  chain()?.toggleCodeBlock().run()
}

function insertLink() {
  const prev = editor.value?.getAttributes('link').href as string | undefined
  const url = window.prompt('输入链接 URL', prev || 'https://')
  if (url === null) return
  if (!url.trim()) {
    chain()?.extendMarkRange('link').unsetLink().run()
    return
  }
  chain()?.extendMarkRange('link').setLink({ href: url.trim() }).run()
}

function insertImage() {
  const url = window.prompt('输入图片 URL（或留空取消）', 'https://')
  if (!url || !url.trim()) return
  chain()?.setImage({ src: url.trim() }).run()
}

function insertVideo() {
  const url = window.prompt('输入视频 URL', 'https://')
  if (!url || !url.trim()) return
  const src = url.trim()
  chain()
    ?.insertContent(
      `<p><a href="${src}" target="_blank" rel="noopener">🎬 视频：${src}</a></p>`,
    )
    .run()
  ElMessage.info('已插入视频链接占位')
}

function insertFormula() {
  const tex = window.prompt('输入公式（纯文本占位）', 'E = mc^2')
  if (tex === null) return
  chain()
    ?.insertContent(`<p><code>∑ ${escapeHtml(tex.trim() || 'formula')}</code></p>`)
    .run()
  ElMessage.info('已插入公式占位（完整公式渲染即将支持）')
}

function insertTable() {
  chain()
    ?.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run()
}

function insertNote() {
  const n = window.prompt('注释编号', '1')
  if (n === null) return
  chain()
    ?.insertContent(`<sup>[${escapeHtml(n.trim() || '1')}]</sup>`)
    .run()
}

function onToc() {
  ElMessage.info('目录：可根据标题自动生成，即将支持')
}
function onAttachment() {
  ElMessage.info('附件请使用面板下方「相关资料」上传')
}
function onImport() {
  ElMessage.info('导入功能即将支持')
}
function onDraftBackup() {
  ElMessage.success('草稿已保存在本地编辑状态')
}
function onPublishSettings() {
  ElMessage.info('发布设置即将支持')
}
function onPreview() {
  ElMessage.info('预览即将支持')
}
function onPublish() {
  ElMessage.success('内容已写入文档（面板内无需单独发布）')
}

const headingOpen = ref(false)
const listOpen = ref(false)
const moreOpen = ref(false)

const PRIMARY_KEYS = new Set(['heading', 'bold', 'italic', 'list', 'toc'])

type ToolItem = {
  key: string
  label: string
  icon: string
  kind?: 'heading' | 'list' | 'more' | 'btn'
  active?: () => boolean
  run?: () => void
}

const allTools = computed((): ToolItem[] => {
  void editor.value?.state // reactive tick
  return [
    { key: 'undo', label: '撤销', icon: '↶', run: undo },
    { key: 'redo', label: '重做', icon: '↷', run: redo },
    { key: 'clear', label: '清除格式', icon: '⌫', run: clearFormat },
    { key: 'heading', label: '标题', icon: 'H▾', kind: 'heading' },
    {
      key: 'bold',
      label: '加粗',
      icon: 'B',
      active: () => isActive('bold'),
      run: toggleBold,
    },
    {
      key: 'italic',
      label: '斜体',
      icon: 'I',
      active: () => isActive('italic'),
      run: toggleItalic,
    },
    { key: 'list', label: '列表', icon: '☰▾', kind: 'list' },
    { key: 'toc', label: '目录', icon: '▤', run: onToc },
    {
      key: 'quote',
      label: '引用',
      icon: '❝',
      active: () => isActive('blockquote'),
      run: toggleBlockquote,
    },
    { key: 'hr', label: '分割线', icon: '┄', run: setHorizontalRule },
    {
      key: 'code',
      label: '代码块',
      icon: '</>',
      active: () => isActive('codeBlock'),
      run: toggleCodeBlock,
    },
    { key: 'note', label: '注释', icon: '[1]', run: insertNote },
    { key: 'image', label: '图片', icon: '🖼', run: insertImage },
    { key: 'video', label: '视频', icon: '▶', run: insertVideo },
    {
      key: 'link',
      label: '链接',
      icon: '🔗',
      active: () => isActive('link'),
      run: insertLink,
    },
    { key: 'formula', label: '公式', icon: 'Σ', run: insertFormula },
    { key: 'table', label: '表格', icon: '▦', run: insertTable },
    { key: 'attach', label: '附件', icon: '☁▾', run: onAttachment },
    { key: 'import', label: '导入', icon: '⇪▾', run: onImport },
    { key: 'draft', label: '草稿备份', icon: '⏱', run: onDraftBackup },
  ]
})

/** 顶栏直接展示的工具 */
const visibleTools = computed(() => {
  const all = allTools.value
  if (props.expanded) return all
  return all.filter((t) => PRIMARY_KEYS.has(t.key))
})

/** 收起模式下「更多」下拉内容 */
const moreTools = computed(() => {
  if (props.expanded) return [] as ToolItem[]
  return allTools.value.filter((t) => !PRIMARY_KEYS.has(t.key))
})

function runMoreTool(t: ToolItem) {
  moreOpen.value = false
  t.run?.()
}

function closeMore() {
  moreOpen.value = false
}

function onRootMouseDown(event: MouseEvent) {
  event.stopPropagation()
}

function focusEditor() {
  editor.value?.commands.focus('end')
}

defineExpose({ focusEditor, editor })
</script>

<template>
  <div
    class="rte-root"
    :class="{ compact, expanded, 'has-title': showTitle }"
    @mousedown="onRootMouseDown"
  >
    <div class="rte-toolbar" role="toolbar" aria-label="编辑工具栏">
      <template v-for="t in visibleTools" :key="t.key">
        <div
          v-if="t.kind === 'heading'"
          class="rte-tool-wrap"
          @mouseleave="headingOpen = false"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{ active: isActive('heading') }"
            title="标题"
            @click.stop="headingOpen = !headingOpen"
          >
            <span class="rte-tool-icon">H▾</span>
            <span class="rte-tool-label">标题</span>
          </button>
          <div v-if="headingOpen" class="rte-menu" @mousedown.prevent>
            <button type="button" @click="setHeading(0); headingOpen = false">
              正文
            </button>
            <button type="button" @click="setHeading(1); headingOpen = false">
              标题 1
            </button>
            <button type="button" @click="setHeading(2); headingOpen = false">
              标题 2
            </button>
            <button type="button" @click="setHeading(3); headingOpen = false">
              标题 3
            </button>
          </div>
        </div>
        <div
          v-else-if="t.kind === 'list'"
          class="rte-tool-wrap"
          @mouseleave="listOpen = false"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{
              active: isActive('bulletList') || isActive('orderedList'),
            }"
            title="列表"
            @click.stop="listOpen = !listOpen"
          >
            <span class="rte-tool-icon">☰▾</span>
            <span class="rte-tool-label">列表</span>
          </button>
          <div v-if="listOpen" class="rte-menu" @mousedown.prevent>
            <button
              type="button"
              @click="toggleBulletList(); listOpen = false"
            >
              无序列表
            </button>
            <button
              type="button"
              @click="toggleOrderedList(); listOpen = false"
            >
              有序列表
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="rte-tool"
          :class="{ active: t.active?.() }"
          :title="t.label"
          @click="t.run?.()"
        >
          <span class="rte-tool-icon">{{ t.icon }}</span>
          <span class="rte-tool-label">{{ t.label }}</span>
        </button>
      </template>

      <!-- 未最大化：其余工具收进「更多」 -->
      <div
        v-if="!expanded && moreTools.length"
        class="rte-tool-wrap rte-more-wrap"
        @mouseleave="closeMore"
      >
        <button
          type="button"
          class="rte-tool"
          :class="{ active: moreOpen }"
          title="更多"
          @click.stop="moreOpen = !moreOpen"
        >
          <span class="rte-tool-icon">⋯</span>
          <span class="rte-tool-label">更多</span>
        </button>
        <div
          v-if="moreOpen"
          class="rte-more-menu"
          @mousedown.prevent
        >
          <button
            v-for="mt in moreTools"
            :key="mt.key"
            type="button"
            class="rte-more-item"
            :class="{ active: mt.active?.() }"
            @click="runMoreTool(mt)"
          >
            <span class="rte-more-icon">{{ mt.icon }}</span>
            <span>{{ mt.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="rte-canvas" @click="focusEditor">
      <input
        v-if="showTitle"
        class="rte-title"
        type="text"
        maxlength="100"
        :value="localTitle"
        placeholder="请输入标题（最多 100 个字）"
        @input="onTitleInput"
        @click.stop
      />
      <div v-if="showTitle" class="rte-title-sep" />
      <EditorContent :editor="editor" class="rte-body" />
    </div>

    <div v-if="showBottomBar" class="rte-bottom">
      <div class="rte-bottom-left">
        <button
          v-if="showPublishActions"
          type="button"
          class="rte-bottom-link"
          @click="onPublishSettings"
        >
          发布设置 ▾
        </button>
        <span class="rte-wordcount">字数: {{ charCount }}</span>
        <span v-if="showMarkdownHint" class="rte-md-hint">
          Markdown 语法输入中
          <span class="rte-md-q" title="编辑器支持常见富文本与部分 Markdown 快捷输入">?</span>
        </span>
      </div>
      <div class="rte-bottom-right">
        <span class="rte-draft">
          刚刚 · 草稿
          <span class="rte-check" aria-hidden="true">✓</span>
        </span>
        <template v-if="showPublishActions">
          <button type="button" class="rte-preview" @click="onPreview">
            预览
          </button>
          <button type="button" class="rte-publish" @click="onPublish">
            发布
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rte-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
  box-sizing: border-box;
  cursor: text;
}

.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 2px 4px;
  padding: 6px 8px 4px;
  border-bottom: 1px solid #eef0f3;
  background: #fff;
  flex-shrink: 0;
  z-index: 2;
}

.rte-tool-wrap {
  position: relative;
}

.rte-tool {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 40px;
  padding: 4px 6px 3px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #4e5969;
  cursor: pointer;
  line-height: 1.1;
}

.rte-tool:hover,
.rte-tool.active {
  background: #f2f3f5;
  color: #1d2129;
}

.rte-tool-icon {
  font-size: 14px;
  font-weight: 600;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.rte-tool-label {
  font-size: 10px;
  color: #86909c;
  white-space: nowrap;
  transform: scale(0.95);
}

.rte-tool.active .rte-tool-label {
  color: #1a73e8;
}

.rte-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  min-width: 108px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
}

.rte-menu button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 10px;
  font-size: 12px;
  color: #1d2129;
  border-radius: 4px;
  cursor: pointer;
}

.rte-menu button:hover {
  background: #f2f3f5;
}

.rte-canvas {
  flex: 1;
  min-height: 72px;
  overflow: auto;
  padding: 10px 14px 12px;
  background: #fff;
}

.rte-title {
  width: 100%;
  border: none;
  outline: none;
  font-size: 22px;
  font-weight: 700;
  color: #1d2129;
  padding: 4px 0 8px;
  background: transparent;
}

.rte-title::placeholder {
  color: #c0c4cc;
  font-weight: 600;
}

.rte-title-sep {
  height: 1px;
  background: #eef0f3;
  margin-bottom: 10px;
}

.rte-body {
  min-height: 48px;
}

.rte-root :deep(.tiptap),
.rte-root :deep(.ProseMirror) {
  outline: none;
  min-height: 48px;
  color: #1d2129;
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}

.rte-root :deep(.tiptap p),
.rte-root :deep(.ProseMirror p) {
  margin: 0 0 0.55em;
}

.rte-root :deep(.tiptap h1),
.rte-root :deep(.ProseMirror h1) {
  font-size: 1.55em;
  margin: 0.4em 0 0.35em;
}
.rte-root :deep(.tiptap h2),
.rte-root :deep(.ProseMirror h2) {
  font-size: 1.3em;
  margin: 0.4em 0 0.3em;
}
.rte-root :deep(.tiptap h3),
.rte-root :deep(.ProseMirror h3) {
  font-size: 1.12em;
  margin: 0.35em 0 0.25em;
}

.rte-root :deep(.tiptap ul),
.rte-root :deep(.ProseMirror ul),
.rte-root :deep(.tiptap ol),
.rte-root :deep(.ProseMirror ol) {
  padding-left: 1.4em;
  margin: 0.3em 0 0.55em;
}

.rte-root :deep(.tiptap blockquote),
.rte-root :deep(.ProseMirror blockquote) {
  margin: 0.4em 0;
  padding: 0.2em 0.8em;
  border-left: 3px solid #c9cdd4;
  color: #4e5969;
  background: #fafbfc;
}

.rte-root :deep(.tiptap pre),
.rte-root :deep(.ProseMirror pre) {
  background: #f7f8fa;
  border-radius: 6px;
  padding: 10px 12px;
  overflow: auto;
  font-size: 12px;
  margin: 0.4em 0;
}

.rte-root :deep(.tiptap hr),
.rte-root :deep(.ProseMirror hr) {
  border: none;
  border-top: 1px dashed #c9cdd4;
  margin: 0.8em 0;
}

.rte-root :deep(.tiptap img.rte-image),
.rte-root :deep(.ProseMirror img.rte-image) {
  max-width: 100%;
  border-radius: 4px;
}

.rte-root :deep(.tiptap table),
.rte-root :deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  font-size: 12px;
}

.rte-root :deep(.tiptap td),
.rte-root :deep(.ProseMirror td),
.rte-root :deep(.tiptap th),
.rte-root :deep(.ProseMirror th) {
  border: 1px solid #d0d3d9;
  padding: 4px 8px;
  min-width: 48px;
}

.rte-root :deep(.tiptap th),
.rte-root :deep(.ProseMirror th) {
  background: #f5f6f8;
}

.rte-root :deep(.tiptap a.rte-link),
.rte-root :deep(.ProseMirror a.rte-link) {
  color: #1a73e8;
  text-decoration: underline;
}

.rte-root :deep(.tiptap p.is-editor-empty:first-child::before),
.rte-root :deep(.tiptap p.is-empty:first-child::before),
.rte-root :deep(.ProseMirror p.is-editor-empty:first-child::before),
.rte-root :deep(.ProseMirror.is-editor-empty p:first-child::before) {
  color: #c0c4cc;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.rte-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-top: 1px solid #eef0f3;
  background: #fafbfc;
  flex-shrink: 0;
  font-size: 12px;
  color: #86909c;
}

.rte-bottom-left,
.rte-bottom-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rte-bottom-link {
  border: none;
  background: transparent;
  color: #4e5969;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.rte-md-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rte-md-q {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid #c9cdd4;
  font-size: 10px;
  color: #86909c;
}

.rte-draft {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #4e5969;
}

.rte-check {
  color: #00b42a;
  font-weight: 700;
}

.rte-preview {
  border: 1px solid #e5e6eb;
  background: #f2f3f5;
  color: #86909c;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.rte-publish {
  border: none;
  background: #94bfff;
  color: #fff;
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 12px;
  cursor: pointer;
}

.rte-publish:hover {
  background: #6aa1ff;
}

/* compact：面板窄时仍可见标签，工具条可换行缩小 */
.rte-root.compact .rte-tool {
  min-width: 34px;
  padding: 3px 4px 2px;
}

.rte-root.compact .rte-tool-icon {
  font-size: 12px;
  height: 16px;
}

.rte-root.compact .rte-tool-label {
  font-size: 9px;
}

.rte-root.compact .rte-canvas {
  padding: 8px 10px;
}

.rte-root.compact .rte-bottom {
  padding: 4px 8px;
  font-size: 11px;
}

.rte-root.compact :deep(.tiptap),
.rte-root.compact :deep(.ProseMirror) {
  font-size: 12px;
  line-height: 1.55;
  min-height: 36px;
}

.rte-more-wrap {
  margin-left: 2px;
}

.rte-more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  left: auto;
  z-index: 30;
  min-width: 148px;
  max-height: min(320px, 50vh);
  overflow: auto;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
}

.rte-more-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 10px;
  font-size: 12px;
  color: #1d2129;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.rte-more-item:hover,
.rte-more-item.active {
  background: #f2f3f5;
}

.rte-more-icon {
  width: 18px;
  text-align: center;
  font-weight: 600;
  color: #4e5969;
  flex-shrink: 0;
}

</style>
