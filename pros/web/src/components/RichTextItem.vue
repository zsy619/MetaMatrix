<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import type { QuadrantItemStyle } from '../types/canvas'

const props = withDefaults(
  defineProps<{
    modelValue: string
    selected?: boolean
    placeholder?: string
    legacyStyle?: QuadrantItemStyle
  }>(),
  {
    selected: false,
    placeholder: '输入内容…',
  },
)

const emit = defineEmits<{
  'update:modelValue': [htmlOrText: string]
  focus: []
  blur: []
}>()

const COLOR_PALETTE = [
  '#3c4043',
  '#202124',
  '#1a73e8',
  '#d93025',
  '#188038',
  '#e37400',
  '#9334e6',
  '#00897b',
]

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      code: false,
      listItem: false,
      bulletList: false,
      orderedList: false,
    }),
    Underline,
    TextStyle,
    Color,
    Placeholder.configure({
      placeholder: props.placeholder,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),
  ],
  editorProps: {
    attributes: {
      class: 'rich-text-prose',
      spellcheck: 'false',
    },
    handleKeyDown: (_view, event) => {
      // List-item feel: Enter / Shift+Enter → hard break (avoid tall paragraphs)
      if (event.key === 'Enter') {
        editor.value?.commands.setHardBreak()
        return true
      }
      return false
    },
  },
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML())
  },
  onFocus: () => {
    emit('focus')
  },
  onBlur: () => {
    emit('blur')
  },
})

const rootStyle = computed(() => {
  const s = props.legacyStyle ?? {}
  return {
    color: s.color ?? '#3c4043',
    fontSize: `${s.fontSize ?? 13}px`,
    fontWeight: String(s.fontWeight ?? 'normal'),
    fontFamily: s.fontFamily ?? 'inherit',
  }
})

watch(
  () => props.modelValue,
  (value) => {
    const ed = editor.value
    if (!ed) return
    const next = toEditorContent(value)
    const current = ed.getHTML()
    if (normalizeHtml(current) === normalizeHtml(next)) return
    // Plain text stored vs editor HTML: compare text content
    if (!looksLikeHtml(value ?? '') && ed.getText() === (value ?? '')) return
    ed.commands.setContent(next, { emitUpdate: false })
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function appendToBody(): HTMLElement {
  return document.body
}

function shouldShowBubble({
  editor: ed,
  state,
}: {
  editor: { isEditable: boolean }
  state: { selection: { from: number; to: number; empty: boolean } }
}): boolean {
  const { from, to, empty } = state.selection
  return ed.isEditable && !empty && from !== to
}

function toggleBold() {
  editor.value?.chain().focus().toggleBold().run()
}
function toggleItalic() {
  editor.value?.chain().focus().toggleItalic().run()
}
function toggleUnderline() {
  editor.value?.chain().focus().toggleUnderline().run()
}
function toggleStrike() {
  editor.value?.chain().focus().toggleStrike().run()
}
function setColor(color: string) {
  editor.value?.chain().focus().setColor(color).run()
}

function isActive(name: string) {
  return editor.value?.isActive(name) ?? false
}

function onRootMouseDown(event: MouseEvent) {
  // Let parent know selection intent before focus settles
  event.stopPropagation()
  emit('focus')
}
</script>

<template>
  <div
    class="rich-text-item"
    :class="{ selected, focused: editor?.isFocused }"
    :style="rootStyle"
    @mousedown="onRootMouseDown"
  >
    <EditorContent :editor="editor" class="rich-text-editor" />

    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :append-to="appendToBody"
      :options="{ placement: 'top', offset: 8, strategy: 'fixed' }"
      :should-show="shouldShowBubble"
    >
      <div class="bubble" @mousedown.prevent>
        <button
          type="button"
          class="bubble-btn"
          :class="{ active: isActive('bold') }"
          title="粗体"
          @click="toggleBold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          class="bubble-btn"
          :class="{ active: isActive('italic') }"
          title="斜体"
          @click="toggleItalic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          class="bubble-btn"
          :class="{ active: isActive('underline') }"
          title="下划线"
          @click="toggleUnderline"
        >
          <span class="u">U</span>
        </button>
        <button
          type="button"
          class="bubble-btn"
          :class="{ active: isActive('strike') }"
          title="删除线"
          @click="toggleStrike"
        >
          <s>S</s>
        </button>
        <span class="bubble-sep" />
        <button
          v-for="c in COLOR_PALETTE"
          :key="c"
          type="button"
          class="bubble-swatch"
          :style="{ background: c }"
          :title="c"
          @click="setColor(c)"
        />
      </div>
    </BubbleMenu>
  </div>
</template>

<style scoped>
.rich-text-item {
  flex: 1;
  min-width: 0;
  line-height: 1.45;
  cursor: text;
}

.rich-text-editor {
  width: 100%;
}

.rich-text-item :deep(.tiptap),
.rich-text-item :deep(.ProseMirror) {
  outline: none;
  border: none;
  background: transparent;
  padding: 2px 0;
  min-height: 1.45em;
  width: 100%;
  word-break: break-word;
  white-space: pre-wrap;
}

.rich-text-item.focused :deep(.tiptap),
.rich-text-item.focused :deep(.ProseMirror) {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
}

.rich-text-item :deep(.tiptap p),
.rich-text-item :deep(.ProseMirror p) {
  margin: 0;
  padding: 0;
}

.rich-text-item :deep(.tiptap p.is-editor-empty:first-child::before),
.rich-text-item :deep(.tiptap p.is-empty:first-child::before),
.rich-text-item :deep(.ProseMirror p.is-editor-empty:first-child::before),
.rich-text-item :deep(.ProseMirror.is-editor-empty p:first-child::before) {
  color: #b0b4b8;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.bubble {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: #202124;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
  z-index: 10000;
  max-width: min(360px, 90vw);
  flex-wrap: wrap;
}

.bubble-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #f1f3f4;
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.bubble-btn:hover,
.bubble-btn.active {
  background: rgba(255, 255, 255, 0.16);
}

.bubble-btn .u {
  text-decoration: underline;
}

.bubble-sep {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.22);
  margin: 0 4px;
}

.bubble-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  cursor: pointer;
  padding: 0;
  margin: 0 1px;
}

.bubble-swatch:hover {
  transform: scale(1.12);
}
</style>
