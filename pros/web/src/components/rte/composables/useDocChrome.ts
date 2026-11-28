import { computed, onBeforeUnmount, ref, watch, type Ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { activeOutlineIndex as outlineIndexForCursor } from '../../../utils/rteBatch3'
import { docChromeDelay, snapshotDue } from '../../../utils/rteRound8'
import { shouldTakeSnapshot, type NoteRow } from '../../../utils/rteRound6'
import {
  formatRevisionTime,
  rememberRevision,
  normalizeRevisions,
  type PanelRevision,
} from '../../../utils/rteRevisions'
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
  openRteConfirm: (opts: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }) => Promise<boolean>
  panelId: () => string
  readRevisions: () => unknown
  setRevisions: (panelId: string, revisions: PanelRevision[]) => void
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

type OutlineHeading = { id: string; level: number; text: string; pos: number; empty?: boolean }

const outlineHeadings = ref<OutlineHeading[]>([])
const noteRows = ref<NoteRow[]>([])
const notesOpen = ref(false)
const historyOpen = ref(false)
const revisions = ref<PanelRevision[]>([])
const revisionNote = ref('')
let docChromeTimer: ReturnType<typeof setTimeout> | null = null
let lastSnapHtml = ''
let lastSnapAt = 0
let lastSnapNodeSize = 0
let loadedPanelId = ''

function loadRevisions() {
  const panelId = deps.panelId()
  if (panelId !== loadedPanelId) {
    loadedPanelId = panelId
    lastSnapHtml = ''
    lastSnapAt = 0
    lastSnapNodeSize = 0
    revisionNote.value = ''
  }
  revisions.value = normalizeRevisions(deps.readRevisions())
}

watch(() => [deps.panelId(), deps.readRevisions()] as const, loadRevisions, { immediate: true })

function persistRevisions(list: PanelRevision[]) {
  revisions.value = list
  const panelId = deps.panelId()
  if (panelId) deps.setRevisions(panelId, list)
}

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
      const raw = node.textContent.trim()
      headings.push({
        id: String(node.attrs.id || `h-${pos}`),
        level,
        text: raw || `（空标题 ${level}）`,
        pos,
        empty: !raw,
      })
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
      const remembered = rememberRevision(revisions.value, html, now)
      lastSnapHtml = html
      lastSnapAt = now
      if (remembered.stored) {
        revisionNote.value = ''
        persistRevisions(remembered.list)
      } else if (remembered.reason === 'too-large') {
        revisionNote.value = '这一版正文太长，没有写入版本记录。编辑不受影响。'
      }
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

async function nameCurrentRevision() {
  const ed = deps.editor.value
  if (!ed) return
  const label = await deps.openRtePrompt({
    title: '命名当前版本',
    message: '给现在的正文起个名字，例如「送审前」。命名版本会优先保留。',
    placeholder: '版本名称',
    confirmLabel: '保存',
    maxlength: 40,
  })
  if (!label?.trim()) return
  const html = ed.getHTML()
  const remembered = rememberRevision(revisions.value, html, Date.now(), { label: label.trim() })
  if (remembered.reason === 'too-large') {
    ElMessage.warning('正文太长，这一版没有写入版本记录。')
    return
  }
  if (remembered.reason === 'empty') {
    ElMessage.info('正文还是空的，没有可命名的版本。')
    return
  }
  if (!remembered.stored && remembered.reason === 'same') {
    ElMessage.info('当前正文已经是这个名称。')
    return
  }
  persistRevisions(remembered.list)
  lastSnapHtml = html
  lastSnapAt = Date.now()
  revisionNote.value = ''
  ElMessage.success('已记下这一版')
}

async function restoreRevision(id: string) {
  const ed = deps.editor.value
  const target = revisions.value.find((item) => item.id === id)
  if (!ed || !target) return
  const ok = await deps.openRteConfirm({
    title: '恢复这一版',
    message: '当前正文会先记成一版，再换成所选版本。',
    confirmLabel: '恢复',
  })
  if (!ok) return
  const current = ed.getHTML()
  const saved = rememberRevision(revisions.value, current, Date.now())
  if (saved.reason === 'too-large') {
    ElMessage.warning('当前正文太长，没法先留下一版，因此没有恢复。')
    return
  }
  if (saved.stored) persistRevisions(saved.list)
  ed.commands.setContent(target.html, { emitUpdate: true })
  lastSnapHtml = target.html
  lastSnapAt = Date.now()
  historyOpen.value = false
  ElMessage.success('已恢复所选版本')
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
    dom?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    if (dom) {
      dom.classList.add('rte-outline-flash')
      window.setTimeout(() => dom.classList.remove('rte-outline-flash'), 800)
    }
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
    revisions,
    revisionNote,
    formatRevisionTime,
    refreshDocChrome,
    scheduleDocChrome,
    jumpNote,
    removeNote,
    nameCurrentRevision,
    restoreRevision,
    insertDocTitleBlock,
    activeOutlineIndex,
    showEmptyGuide,
    jumpToOutlineHeading,
  }
}
