import { computed, onBeforeUnmount, ref, watch, type Ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { activeOutlineIndex as outlineIndexForCursor } from '../../../utils/rteBatch3'
import { docChromeDelay, snapshotDue } from '../../../utils/rteRound8'
import { shouldTakeSnapshot, type NoteRow } from '../../../utils/rteRound6'
import { jumpToPos } from '../../rteWave20'

/** 大纲、批注、本地会话快照。模板绑定名与原先一致。 */
export function useDocChrome(deps: {
  editor: ShallowRef<Editor | undefined>
  outlineOpen: { value: boolean }
  editorReady: Ref<boolean>
  charCount: { value: number }
  props: { expanded: boolean }
  viewMode: () => { value: string }
  closeAllToolbarMenus: () => void
  openRtePrompt: (opts: {
    title: string
    message?: string
    placeholder?: string
    confirmLabel?: string
    maxlength?: number
  }) => Promise<string | null>
}) {
const outlineUserClosed = ref(false)

function toggleOutlinePanel() {
  const next = !deps.outlineOpen.value
  deps.outlineOpen.value = next
  outlineUserClosed.value = !next
  deps.closeAllToolbarMenus()
}

function closeOutlinePanel() {
  deps.outlineOpen.value = false
  outlineUserClosed.value = true
}

type OutlineHeading = { id: string; level: number; text: string; pos: number }

const outlineHeadings = ref<OutlineHeading[]>([])
const noteRows = ref<NoteRow[]>([])
const notesOpen = ref(false)
const historyOpen = ref(false)
const sessionSnaps = ref<Array<{ at: number; html: string }>>([])
let docChromeTimer: ReturnType<typeof setTimeout> | null = null
let lastSnapHtml = ''
let lastSnapAt = 0
let lastSnapNodeSize = 0

function refreshDocChrome() {
  const ed = deps.editor.value
  if (!ed || ed.isDestroyed) {
    outlineHeadings.value = []
    noteRows.value = []
    return
  }
  const headings: OutlineHeading[] = []
  const notes: NoteRow[] = []
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level) || 1
      const text = node.textContent.trim() || `（空标题 ${level}）`
      headings.push({ id: `h-${pos}`, level, text, pos })
    }
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name !== 'annotation') continue
      notes.push({
        from: pos,
        to: pos + node.nodeSize,
        text: node.text || '',
        note: String(mark.attrs.note || ''),
        type: String(mark.attrs.type || '新注释'),
      })
    }
  })
  outlineHeadings.value = headings
  noteRows.value = notes
  const now = Date.now()
  const nodeSize = ed.state.doc.nodeSize
  if (snapshotDue(lastSnapNodeSize, nodeSize, now - lastSnapAt)) {
    lastSnapNodeSize = nodeSize
    const html = ed.getHTML()
    if (shouldTakeSnapshot(lastSnapHtml, html, now - lastSnapAt)) {
      lastSnapHtml = html
      lastSnapAt = now
      sessionSnaps.value = [...sessionSnaps.value, { at: now, html }].slice(-12)
    }
  }
}

/** 长文档不在每次击键时重扫标题和批注。 */
function scheduleDocChrome() {
  if (docChromeTimer != null) return
  const size = deps.editor.value?.state.doc.nodeSize ?? 0
  docChromeTimer = setTimeout(() => {
    docChromeTimer = null
    refreshDocChrome()
  }, docChromeDelay(size))
}

watch(deps.editorReady, (ready) => {
  if (ready) refreshDocChrome()
})

function jumpNote(row: NoteRow) {
  const ed = deps.editor.value
  if (!ed) return
  jumpToPos(ed, row.from)
}

function removeNote(row: NoteRow) {
  const ed = deps.editor.value
  if (!ed) return
  ed.chain().focus().setTextSelection({ from: row.from, to: row.to }).unsetAnnotation().run()
  scheduleDocChrome()
}

function restoreSessionSnap(html: string) {
  const ed = deps.editor.value
  if (!ed) return
  ed.commands.setContent(html, { emitUpdate: true })
  historyOpen.value = false
  ElMessage.success('已恢复本次会话中的一版。这与云端版本无关。')
}

async function insertDocTitleBlock() {
  const text = await deps.openRtePrompt({
    title: '文档标题',
    message: '这是正文里的标题块，不会改画布面板标题。',
    placeholder: '标题',
    confirmLabel: '插入',
    maxlength: 80,
  })
  if (!text?.trim()) return
  deps.editor.value?.chain().focus().insertDocTitle(text.trim()).run()
}

const activeOutlineIndex = computed(() => {
  void deps.editor.value?.state.selection
  const positions = outlineHeadings.value.map((item) => item.pos)
  const cursor = deps.editor.value?.state.selection.from ?? 0
  return outlineIndexForCursor(positions, cursor)
})

const showEmptyGuide = computed(
  () =>
    deps.props.expanded &&
    deps.viewMode().value === 'edit' &&
    deps.editorReady.value &&
    deps.charCount.value === 0,
)

watch(
  () => [deps.props.expanded, outlineHeadings.value.length] as const,
  () => {
    if (!deps.props.expanded || deps.viewMode().value !== 'edit') {
      if (!deps.props.expanded) deps.outlineOpen.value = false
      return
    }
    if (outlineUserClosed.value) return
    deps.outlineOpen.value = outlineHeadings.value.length > 0
  },
)

function jumpToOutlineHeading(item: OutlineHeading) {
  const ed = deps.editor.value
  if (!ed) return
  const target = Math.min(item.pos + 1, ed.state.doc.content.size)
  ed.chain()
    .focus()
    .setTextSelection(target)
    .run()
  // 滚动到可见
  try {
    const dom = ed.view.nodeDOM(item.pos) as HTMLElement | null
    dom?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  } catch {
    /* ignore */
  }
}


  onBeforeUnmount(() => {
    if (docChromeTimer != null) {
      clearTimeout(docChromeTimer)
      docChromeTimer = null
    }
  })

  return {
    toggleOutlinePanel,
    closeOutlinePanel,
    outlineHeadings,
    noteRows,
    notesOpen,
    historyOpen,
    sessionSnaps,
    refreshDocChrome,
    scheduleDocChrome,
    jumpNote,
    removeNote,
    restoreSessionSnap,
    insertDocTitleBlock,
    activeOutlineIndex,
    showEmptyGuide,
    jumpToOutlineHeading,
  }
}
