import { nextTick, ref, watch, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { applyFormShowIfVisibility } from '../../../extensions/forms'
import { normalizeHtml, toEditorContent } from '../../../utils/rteContent'

type RteProps = { modelValue: string }
type RteEmit = (event: 'update:modelValue', html: string) => void

/** 编辑 / 预览 / 源码。模板绑定名与原先一致。 */
export function useViewMode(deps: {
  editor: ShallowRef<Editor | undefined>
  props: RteProps
  emit: RteEmit
  isImageNodeSelected: () => boolean
  syncCodeChrome: () => void
  formInspectorPinned: { value: boolean }
  setLastEmitted: (norm: string) => void
}) {
/** 最大化浮层三种视图：编辑 / 预览 / 源码 */
type RteViewMode = 'edit' | 'preview' | 'source'
const VIEW_MODE_OPTIONS: { id: RteViewMode; label: string; icon: string; title: string }[] = [
  { id: 'edit', label: '编辑', icon: '✎', title: '编辑' },
  { id: 'preview', label: '预览', icon: '◎', title: '只读预览（Ctrl/⌘+Alt+\\）' },
  { id: 'source', label: '源码', icon: '</>', title: '查看 HTML 源码' },
]
const viewMode = ref<RteViewMode>('edit')

watch(
  () => deps.editor.value?.state.selection,
  () => {
    deps.syncCodeChrome()
  },
)
const sourceHtml = ref('')
const sourceDirty = ref(false)

function getLiveEditorHtml(): string {
  const ed = deps.editor.value
  if (!ed) return deps.props.modelValue || '<p></p>'
  return ed.getHTML()
}

/** 将源码写回 TipTap，并同步父级 modelValue（与 onUpdate 对齐） */
function applySourceHtmlToEditor(raw: string, opts?: { focus?: boolean }) {
  const ed = deps.editor.value
  if (!ed || ed.isDestroyed) return false
  const next = toEditorContent(raw)
  try {
    ed.commands.setContent(next, { emitUpdate: false })
  } catch (err) {
    console.warn('[RTE] applySourceHtmlToEditor setContent failed', err)
    return false
  }
  const html = ed.getHTML()
  deps.setLastEmitted(normalizeHtml(html))
  deps.emit('update:modelValue', html)
  sourceDirty.value = false
  if (opts?.focus !== false && viewMode.value === 'edit') {
    try {
      ed.commands.focus('end')
    } catch {
      /* ignore */
    }
  }
  return true
}

function syncEditorEditableForMode(mode: RteViewMode) {
  const ed = deps.editor.value
  if (!ed || ed.isDestroyed) return
  try {
    ed.setEditable(mode === 'edit')
  } catch {
    /* editor view 可能尚未就绪 */
  }
}

/** BubbleMenu 常驻挂载（仅 editor 就绪），非编辑态不展示，避免 v-if 拆装触发 Vue emitsOptions null */
function bubbleShouldShow(payload: {
  editor: {
    isDestroyed?: boolean
    isEditable?: boolean
    isActive?: (name: string) => boolean
  }
  from: number
  to: number
}): boolean {
  if (viewMode.value !== 'edit') return false
  const ed = payload?.editor
  if (!ed || ed.isDestroyed || ed.isEditable === false) return false
  // 图片节点选中时改走图片气泡
  if (deps.isImageNodeSelected()) return false
  const groupSel = deps.editor.value?.state.selection
  if (groupSel instanceof NodeSelection && groupSel.node.type.name === 'imageGroup') return false
  // 有选区，或光标落在链接内（便于编辑/取消链接）
  if (payload.from !== payload.to) return true
  return !!ed.isActive?.('link')
}

function setViewMode(next: RteViewMode) {
  if (next === viewMode.value) return
  const prev = viewMode.value

  // 离开源码：先把 textarea 写回编辑器，再切模式
  if (prev === 'source' && next !== 'source') {
    applySourceHtmlToEditor(sourceHtml.value, { focus: next === 'edit' })
  }

  if (next === 'source') {
    const raw = getLiveEditorHtml()
    // 轻量换行，便于阅读；写回时 normalizeHtml / TipTap parse 不受影响
    sourceHtml.value = raw.replace(/></g, '>\n<')
    sourceDirty.value = false
  }

  viewMode.value = next
  syncEditorEditableForMode(next)
  // 预览↔编辑切换时强制刷新表单条件显示（setEditable 不一定触发 docChanged）
  nextTick(() => {
    const ed = deps.editor.value
    if (ed && !ed.isDestroyed) applyFormShowIfVisibility(ed)
  })

  if (next !== 'edit') {
    // 预览/源码不展示表单属性面板
    deps.formInspectorPinned.value = false
  }
}

function onSourceInput(event: Event) {
  sourceHtml.value = (event.target as HTMLTextAreaElement).value
  sourceDirty.value = true
}

function applySourceNow() {
  applySourceHtmlToEditor(sourceHtml.value, { focus: false })
  sourceHtml.value = getLiveEditorHtml()
}


  return {
    VIEW_MODE_OPTIONS,
    viewMode,
    sourceHtml,
    sourceDirty,
    getLiveEditorHtml,
    applySourceHtmlToEditor,
    syncEditorEditableForMode,
    bubbleShouldShow,
    setViewMode,
    onSourceInput,
    applySourceNow,
  }
}
