<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Directive,
} from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useDocumentStore } from '../stores/document'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { TextStyle, FontSize, FontFamily, LineHeight } from '@tiptap/extension-text-style'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteImage } from '../extensions/rteImage'
import { RteTableCell, RteTableHeader, TABLE_CELL_BG_PRESETS, TABLE_BORDER_STYLE_PRESETS } from '../extensions/rteTableCells'
import { RteHorizontalRule, HR_VARIANT_OPTIONS, type RteHrVariant } from '../extensions/rteHorizontalRule'
import { ElMessage } from 'element-plus'
import { looksLikeHtml, escapeHtml } from '../utils/itemsHtml'
import { Annotation } from '../extensions/annotation'
import { MathInline, MathDisplay, renderKatex } from '../extensions/math'
import { Video } from '../extensions/video'
import {
  FormTextInput,
  FormRadioGroup,
  FormCheckboxGroup,
  FormSelect,
  FormTextarea,
  FormNumberInput,
  FormDateInput,
  FormSwitch,
  FormShowIf,
  applyFormShowIfVisibility,
  isFormNodeName,
  type FormNodeName,
} from '../extensions/forms'
import {
  createRteMention,
  mentionPluginKey,
  type RteMentionRenderProps,
  type RteMentionUiHandlers,
} from '../extensions/mentionSuggestion'
import { type RteMentionItem } from './rteMentionItems'
import FormPropertyInspector from './FormPropertyInspector.vue'
import { toolbarIconMap, IconTableRows, IconTableCols } from './rteToolbarIcons'
import { RteCodeBlockLowlight, RTE_CODE_LANGUAGES } from '../extensions/codeHighlight'
import {
  collectFindMatches,
  pickNextMatchIndex,
  selectFindMatch,
  replaceFindMatch,
  replaceAllFindMatches,
  type RteFindMatch,
} from '../utils/rteFindReplace'
import 'highlight.js/styles/github.css'
import {
  RTE_DOC_TEMPLATES,
  RTE_DOC_TEMPLATE_GROUPS,
  getRteDocTemplate,
  sanitizeRteJsonNodes,
} from './rteDocTemplates'
import type { Component } from 'vue'
import JSZip from 'jszip'
import html2canvas from 'html2canvas'
import { SlashCommands, slashPluginKey, type RteSlashRenderProps, type RteSlashUiHandlers } from '../extensions/slashCommands'
import { exitSuggestion } from '@tiptap/suggestion'
import {
  rteSlashSectionLabel,
  type RteSlashItem,
} from './rteSlashItems'
import { LetterSpacing } from '../extensions/letterSpacing'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'
import { PageBreak } from '../extensions/pageBreak'
import { Columns, Column } from '../extensions/columns'
import { Callout, type CalloutVariant } from '../extensions/callout'
import { Bookmark } from '../extensions/bookmark'
import { RteBlockquote, QUOTE_STYLE_OPTIONS, type QuoteStyle } from '../extensions/rteBlockquote'
import { EmphasisDot } from '../extensions/emphasisDot'
import { ToggleBlock } from '../extensions/toggleBlock'
import { Audio } from '../extensions/audio'
import { LinkCard } from '../extensions/linkCard'
import { Footnote } from '../extensions/footnote'
import { SensitiveHighlight } from '../extensions/sensitiveHighlight'
import { RevisionHighlight } from '../extensions/revisionHighlight'
import { Ruby } from '../extensions/ruby'
import { StatusChip } from '../extensions/statusChip'
import { ProgressBar } from '../extensions/progressBar'
import { Timeline, TimelineItem } from '../extensions/timeline'
import { TabsBlock, TabPane } from '../extensions/tabsBlock'
import { MermaidBlock } from '../extensions/mermaidBlock'
import { CrossRef, collectCrossRefTargets } from '../extensions/crossRef'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
import { buildDocxBlob } from '../utils/rteExportDocx'
import { buildPdfFromElement } from '../utils/rteExportPdf'
import { htmlToMarkdown } from '../utils/rteExportMd'
import {
  applyParagraphStyle,
  PARA_STYLE_OPTIONS,
  ORDERED_LIST_STYLE_OPTIONS,
  checkHeadingHierarchy,
  checkDocumentLinks,
  estimateReadingMinutes,
  copyTableAs,
  applyTableRowFilter,
  compressImageFile,
  loadSnippets,
  saveSnippets,
  DEFAULT_SNIPPETS,
  STATUS_CHIP_TONES,
  IMAGE_RADIUS_PRESETS,
  IMAGE_SHADOW_PRESETS,
  IMAGE_BORDER_PRESETS,
  type RteSnippet,
  type ParaStyleId as WaveParaStyleId,
} from '../utils/rteWave21'
import {
  applyCaseToSelection,
  copySelectionOrDocAsMarkdown,
  makeQrDataUrl,
  speakText,
  stopSpeak,
  collectFootnotes,
  renumberFootnotes,
  jumpToPos,
  setCellVerticalAlign,
  renumberCaptions,
  sortTableByColumn,
  upsertTableSumRow,
  currentTableColIndex,
  RTE_ZOOM_PRESETS,
  type CaseMode,
} from './rteWave20'
import { RTE_EMOJI_CATEGORIES } from '../utils/rteEmojiList'
import { RTE_SPECIAL_CHAR_CATEGORIES } from '../utils/rteSpecialChars'

const props = withDefaults(
  defineProps<{
    modelValue: string
    title?: string
    showTitle?: boolean
    placeholder?: string
    compact?: boolean
    /**
     * 最大化时为 true：主栏 + 高级工具第二行。
     * false：飞书式主栏（可横向滚动）+「更多」，避免撑高画布面板。
     */
    expanded?: boolean
    showBottomBar?: boolean
    showPublishActions?: boolean
    showMarkdownHint?: boolean
  }>(),
  {
    title: '',
    showTitle: false,
    placeholder: '输入正文，或按 / 快速插入',
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
const rteRootEl = ref<HTMLElement | null>(null)
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
  // 去掉标签间空白，避免 itemsToHtml 往返与 getHTML 仅差换行时误触发 setContent
  return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

/** 表格菜单状态（须在 useEditor 之前声明，供 contextmenu 回调闭包使用） */
const tableMenuOpen = ref(false)
const tableOpsSheetOpen = ref(false)
const tableCtx = ref<{ open: boolean; x: number; y: number }>({
  open: false,
  x: 0,
  y: 0,
})

function closeTableCtx() {
  if (!tableCtx.value.open) return
  tableCtx.value = { ...tableCtx.value, open: false }
}

function openTableContextMenu(event: MouseEvent) {
  tableCtx.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
  }
  tableMenuOpen.value = false
  tableOpsSheetOpen.value = false
}

/** —— Slash「/」命令菜单状态（须在 useEditor 前声明，供 Suggestion 闭包） —— */
const slashOpen = ref(false)
const slashItems = ref<RteSlashItem[]>([])
const slashIndex = ref(0)
const slashQuery = ref('')
const slashMenuStyle = ref<Record<string, string>>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  visibility: 'hidden',
  zIndex: '5300',
})
let slashSelectItem: ((item: RteSlashItem) => void) | null = null
let slashClientRectFn: (() => DOMRect | null) | null = null
const slashMenuEl = ref<HTMLElement | null>(null)

/** —— @提及建议菜单（与 Slash 同定位模式；候选见 rteMentionItems） —— */
const mentionOpen = ref(false)
const mentionItems = ref<RteMentionItem[]>([])
const mentionIndex = ref(0)
const mentionQuery = ref('')
const mentionMenuStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
  zIndex: '10050',
})
let mentionCommand: ((item: RteMentionItem) => void) | null = null
let mentionClientRectFn: (() => DOMRect | null) | null = null
const mentionMenuEl = ref<HTMLElement | null>(null)

/** 粘贴为纯文本（工具栏开关；影响后续粘贴） */
const pastePlainTextMode = ref(false)
/** 浏览器拼写检查（默认关；可工具栏开启） */
const spellcheckEnabled = ref(false)
/** 打印预览浮层 */
const printPreviewOpen = ref(false)
const printPreviewHtml = ref('')

/** 统一自定义询问弹层（替代 window.prompt / confirm） */
type RteAskKind = 'prompt' | 'confirm'
const askOpen = ref(false)
const askKind = ref<RteAskKind>('prompt')
const askTitle = ref('')
const askMessage = ref('')
const askPlaceholder = ref('')
const askValue = ref('')
const askConfirmLabel = ref('确认')
const askCancelLabel = ref('取消')
const askMaxlength = ref(500)
const askInputRef = ref<HTMLInputElement | null>(null)
let askResolvePrompt: ((v: string | null) => void) | null = null
let askResolveConfirm: ((v: boolean) => void) | null = null

function closeAskDialog(result: 'cancel' | 'ok' = 'cancel') {
  if (askKind.value === 'prompt') {
    const r = askResolvePrompt
    askResolvePrompt = null
    askOpen.value = false
    if (r) r(result === 'ok' ? askValue.value : null)
  } else {
    const r = askResolveConfirm
    askResolveConfirm = null
    askOpen.value = false
    if (r) r(result === 'ok')
  }
}

function settleAskPendingAsCancel() {
  if (askResolvePrompt) {
    const r = askResolvePrompt
    askResolvePrompt = null
    r(null)
  }
  if (askResolveConfirm) {
    const r = askResolveConfirm
    askResolveConfirm = null
    r(false)
  }
}

function openRtePrompt(opts: {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  maxlength?: number
}): Promise<string | null> {
  settleAskPendingAsCancel()
  askKind.value = 'prompt'
  askTitle.value = opts.title
  askMessage.value = opts.message || ''
  askPlaceholder.value = opts.placeholder || ''
  askValue.value = opts.defaultValue ?? ''
  askConfirmLabel.value = opts.confirmLabel || '确认'
  askCancelLabel.value = opts.cancelLabel || '取消'
  askMaxlength.value = opts.maxlength ?? 500
  askOpen.value = true
  moreOpen.value = false
  nextTick(() => {
    askInputRef.value?.focus()
    askInputRef.value?.select()
  })
  return new Promise((resolve) => {
    askResolvePrompt = resolve
  })
}

function openRteConfirm(opts: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}): Promise<boolean> {
  settleAskPendingAsCancel()
  askKind.value = 'confirm'
  askTitle.value = opts.title
  askMessage.value = opts.message
  askPlaceholder.value = ''
  askValue.value = ''
  askConfirmLabel.value = opts.confirmLabel || '确定'
  askCancelLabel.value = opts.cancelLabel || '取消'
  askOpen.value = true
  moreOpen.value = false
  return new Promise((resolve) => {
    askResolveConfirm = resolve
  })
}

/** 链接卡片专用弹层 */
const linkCardDialogOpen = ref(false)
const linkCardHref = ref('https://')
const linkCardMode = ref<'card' | 'iframe'>('card')

function openLinkCardDialog() {
  linkCardHref.value = 'https://'
  linkCardMode.value = 'card'
  linkCardDialogOpen.value = true
  moreOpen.value = false
}

function closeLinkCardDialog() {
  linkCardDialogOpen.value = false
}

function confirmLinkCardDialog() {
  const href = linkCardHref.value.trim()
  if (!href) {
    ElMessage.warning('请输入网页链接')
    return
  }
  const mode = linkCardMode.value
  const ok = editor.value?.chain().focus().insertLinkCard({ href, mode }).run()
  if (!ok) ElMessage.warning('链接无效（仅支持 http/https）')
  else ElMessage.success(mode === 'iframe' ? '已插入嵌入卡片' : '已插入链接卡片')
  closeLinkCardDialog()
}
/** 视图：缩放 / 专注 / 暗色 / 纸张参考线 */
const editorZoom = ref(1)
const focusMode = ref(false)
const darkEditor = ref(false)
const paperGuide = ref(false)
const tableHeaderSticky = ref(false)
const sensitiveOn = ref(false)
const revisionOn = ref(false)
const footnotePanelOpen = ref(false)
const caseMenuOpen = ref(false)
const zoomMenuOpen = ref(false)
const viewExtrasOpen = ref(false)
/** Wave21 */
const headingAutoNumber = ref(false)
const immersiveFullscreen = ref(false)
const paraStyleOpen = ref(false)
const listStyleOpen = ref(false)
const wave21ReportOpen = ref(false)
const wave21ReportTitle = ref('')
const wave21ReportLines = ref<Array<{ text: string; pos?: number }>>([])
const snippetDialogOpen = ref(false)
const snippetList = ref<RteSnippet[]>(loadSnippets())
const snippetEditing = ref<RteSnippet | null>(null)
const snippetTitle = ref('')
const snippetBody = ref('')
const xrefDialogOpen = ref(false)
const xrefTargets = ref<ReturnType<typeof collectCrossRefTargets>>([])
const readTimeDialogOpen = ref(false)
const tableFilterQuery = ref('')
const imageCompressOnInsert = ref(true)
/** 本会话是否已提示过 Word 粘贴清理 */
let wordPasteHinted = false
/** 格式刷：复制选区 marks + 块级缩进/段距；sticky 可连续刷 */
type FormatPainterBlock = {
  indent?: number
  marginTop?: string | null
  marginBottom?: string | null
  textIndent?: string | null
  dir?: 'ltr' | 'rtl' | null
  textAlign?: string | null
  lineHeight?: string | null
  headingLevel?: number | null
  nodeType?: 'paragraph' | 'heading' | null
}
const formatPainter = ref<{
  marks: Array<{ type: string; attrs: Record<string, unknown> }>
  block: FormatPainterBlock | null
  sticky: boolean
} | null>(null)
const formatPainterArmed = computed(() => !!formatPainter.value)
let formatPainterSkipSelection = false

const emojiOpen = ref(false)
const emojiTabId = ref(RTE_EMOJI_CATEGORIES[0]?.id ?? 'frequent')
const specialCharsOpen = ref(false)
const specialCharTabId = ref(RTE_SPECIAL_CHAR_CATEGORIES[0]?.id ?? 'punct')
const columnsOpen = ref(false)
const spacingOpen = ref(false)
const wordStatsOpen = ref(false)
const shortcutsOpen = ref(false)
const calloutOpen = ref(false)
const moreCalloutOpen = ref(false)
const outlineOpen = ref(false)

const activeEmojiCategory = computed(() => {
  return RTE_EMOJI_CATEGORIES.find((c) => c.id === emojiTabId.value) ?? RTE_EMOJI_CATEGORIES[0]
})
const activeEmojiList = computed(() => {
  return activeEmojiCategory.value?.emojis ?? []
})
const isLargeEmojiTab = computed(() => !!activeEmojiCategory.value?.large)
const isKaomojiTab = computed(() => !!activeEmojiCategory.value?.kaomoji)
const activeSpecialCharList = computed(() => {
  const cat = RTE_SPECIAL_CHAR_CATEGORIES.find((c) => c.id === specialCharTabId.value)
  return cat?.chars ?? RTE_SPECIAL_CHAR_CATEGORIES[0]?.chars ?? []
})

function placeSlashMenuFromRect(rect: DOMRect | null) {
  const el = slashMenuEl.value
  if (!el || !rect) {
    slashMenuStyle.value = {
      ...slashMenuStyle.value,
      visibility: 'hidden',
    }
    return
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  const gap = 4
  // 先显隐测量
  el.style.visibility = 'hidden'
  el.style.left = '0px'
  el.style.top = '0px'
  el.style.maxHeight = 'none'
  const mw = Math.max(el.offsetWidth, 280)
  const mh = Math.max(el.offsetHeight, 1)
  const spaceBelow = vh - rect.bottom - pad
  const spaceAbove = rect.top - pad
  const preferBelow = spaceBelow >= Math.min(mh, 240) || spaceBelow >= spaceAbove
  let maxH: number
  let top: number
  if (preferBelow) {
    maxH = Math.max(140, spaceBelow - gap)
    top = rect.bottom + gap
  } else {
    maxH = Math.max(140, spaceAbove - gap)
    const usedH = Math.min(mh, maxH)
    top = rect.top - gap - usedH
  }
  let left = rect.left
  if (left + mw > vw - pad) left = vw - pad - mw
  if (left < pad) left = pad
  if (top < pad) top = pad
  if (top + Math.min(mh, maxH) > vh - pad) {
    top = Math.max(pad, vh - pad - Math.min(mh, maxH))
  }
  slashMenuStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    maxHeight: `${Math.round(maxH)}px`,
    visibility: 'visible',
    zIndex: '5300',
  }
}

function syncSlashFromProps(props: RteSlashRenderProps) {
  slashItems.value = props.items
  slashQuery.value = props.query
  slashSelectItem = props.command
  slashClientRectFn = props.clientRect ?? null
  if (slashIndex.value >= props.items.length) {
    slashIndex.value = Math.max(0, props.items.length - 1)
  }
  const rect = props.clientRect?.() ?? null
  nextTick(() => {
    placeSlashMenuFromRect(rect)
    // 选中项滚入视野
    const active = slashMenuEl.value?.querySelector?.('.rte-slash-item.is-active') as HTMLElement | null
    active?.scrollIntoView?.({ block: 'nearest' })
  })
}

function closeSlashMenu() {
  slashOpen.value = false
  slashItems.value = []
  slashIndex.value = 0
  slashQuery.value = ''
  slashSelectItem = null
  slashClientRectFn = null
  slashMenuStyle.value = {
    ...slashMenuStyle.value,
    visibility: 'hidden',
  }
}

const slashUi: RteSlashUiHandlers = {
  onStart(props) {
    slashOpen.value = true
    slashIndex.value = 0
    syncSlashFromProps(props)
  },
  onUpdate(props) {
    if (!slashOpen.value) slashOpen.value = true
    syncSlashFromProps(props)
  },
  onExit() {
    closeSlashMenu()
  },
  onKeyDown({ event }) {
    if (!slashOpen.value) return false
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!slashItems.value.length) return true
      slashIndex.value = (slashIndex.value + 1) % slashItems.value.length
      nextTick(() => {
        const active = slashMenuEl.value?.querySelector?.('.rte-slash-item.is-active') as HTMLElement | null
        active?.scrollIntoView?.({ block: 'nearest' })
      })
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!slashItems.value.length) return true
      slashIndex.value =
        (slashIndex.value - 1 + slashItems.value.length) % slashItems.value.length
      nextTick(() => {
        const active = slashMenuEl.value?.querySelector?.('.rte-slash-item.is-active') as HTMLElement | null
        active?.scrollIntoView?.({ block: 'nearest' })
      })
      return true
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = slashItems.value[slashIndex.value]
      if (item && slashSelectItem) slashSelectItem(item)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      const ed = editor.value
      if (ed && !ed.isDestroyed) {
        try {
          exitSuggestion(ed.view, slashPluginKey)
        } catch {
          closeSlashMenu()
        }
      } else {
        closeSlashMenu()
      }
      return true
    }
    return false
  },
  onCommand(item) {
    applySlashCommandItem(item)
  },
}

function pickSlashItem(item: RteSlashItem) {
  if (slashSelectItem) slashSelectItem(item)
  else applySlashCommandItem(item)
}

function placeMentionMenuFromRect(rect: DOMRect | null) {
  const el = mentionMenuEl.value
  if (!el || !rect) {
    mentionMenuStyle.value = {
      ...mentionMenuStyle.value,
      visibility: 'hidden',
    }
    return
  }
  const gap = 4
  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuW = el.offsetWidth || 280
  const menuH = el.offsetHeight || 200
  let left = rect.left
  if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8)
  if (left < 8) left = 8
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top
  let top: number
  let maxH: number
  if (spaceBelow >= Math.min(menuH, 180) || spaceBelow >= spaceAbove) {
    maxH = Math.max(140, spaceBelow - gap)
    top = rect.bottom + gap
  } else {
    maxH = Math.max(140, spaceAbove - gap)
    const usedH = Math.min(menuH, maxH)
    top = rect.top - gap - usedH
  }
  mentionMenuStyle.value = {
    position: 'fixed',
    top: `${Math.max(8, top)}px`,
    left: `${left}px`,
    maxHeight: `${maxH}px`,
    visibility: 'visible',
    zIndex: '10050',
  }
}

function syncMentionFromProps(props: RteMentionRenderProps) {
  mentionItems.value = props.items
  mentionQuery.value = props.query
  mentionCommand = props.command
  mentionClientRectFn = props.clientRect ?? null
  if (mentionIndex.value >= props.items.length) {
    mentionIndex.value = Math.max(0, props.items.length - 1)
  }
}

function closeMentionMenu() {
  mentionOpen.value = false
  mentionItems.value = []
  mentionIndex.value = 0
  mentionQuery.value = ''
  mentionCommand = null
  mentionClientRectFn = null
  mentionMenuStyle.value = {
    ...mentionMenuStyle.value,
    visibility: 'hidden',
  }
}

const mentionUi: RteMentionUiHandlers = {
  onStart(props) {
    mentionOpen.value = true
    mentionIndex.value = 0
    syncMentionFromProps(props)
    nextTick(() => placeMentionMenuFromRect(mentionClientRectFn?.() ?? null))
  },
  onUpdate(props) {
    if (!mentionOpen.value) mentionOpen.value = true
    syncMentionFromProps(props)
    nextTick(() => placeMentionMenuFromRect(mentionClientRectFn?.() ?? null))
  },
  onExit() {
    closeMentionMenu()
  },
  onKeyDown({ event }) {
    if (!mentionOpen.value) return false
    if (event.key === 'ArrowDown') {
      if (!mentionItems.value.length) return true
      mentionIndex.value = (mentionIndex.value + 1) % mentionItems.value.length
      nextTick(() => {
        const active = mentionMenuEl.value?.querySelector?.('.rte-mention-item.is-active') as HTMLElement | null
        active?.scrollIntoView?.({ block: 'nearest' })
      })
      return true
    }
    if (event.key === 'ArrowUp') {
      if (!mentionItems.value.length) return true
      mentionIndex.value =
        (mentionIndex.value - 1 + mentionItems.value.length) % mentionItems.value.length
      nextTick(() => {
        const active = mentionMenuEl.value?.querySelector?.('.rte-mention-item.is-active') as HTMLElement | null
        active?.scrollIntoView?.({ block: 'nearest' })
      })
      return true
    }
    if (event.key === 'Enter') {
      const item = mentionItems.value[mentionIndex.value]
      if (item && mentionCommand) mentionCommand(item)
      return true
    }
    if (event.key === 'Escape') {
      const ed = editor.value
      if (ed) {
        try {
          exitSuggestion(ed.view, mentionPluginKey)
        } catch {
          closeMentionMenu()
        }
      } else {
        closeMentionMenu()
      }
      return true
    }
    return false
  },
}

function pickMentionItem(item: RteMentionItem) {
  if (mentionCommand) mentionCommand(item)
}

function repositionMentionMenu() {
  if (!mentionOpen.value) return
  placeMentionMenuFromRect(mentionClientRectFn?.() ?? null)
}


const editorReady = ref(false)
const editorBootError = ref('')

/** 粘贴清洗：去掉脚本、Office 垃圾和危险协议，保留段落/列表/标题/链接/表格等结构。 */
function sanitizePastedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|o:p)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|xml|o:p|w:[^>\s]+)[^>]*\/?>/gi, '')
    .replace(/<\/(xml|o:p|w:[^>\s]+)>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"')
    .replace(/<\/?span[^>]*>/gi, '')
    .replace(/<\/?font[^>]*>/gi, '')
    .replace(/class\s*=\s*("Mso[^"]*"|'Mso[^']*'|"[^"]*Mso[^"]*"|'[^']*Mso[^']*')/gi, '')
    .replace(/style\s*=\s*"[^"]*mso-[^"]*"/gi, '')
    .replace(/style\s*=\s*'[^']*mso-[^']*'/gi, '')
    .replace(/\s(lang|face|size)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<p([^>]*)>\s*&nbsp;\s*<\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
}

function rtePlaceholderText(args: {
  editor: { isEmpty: boolean; state: { doc: { resolve: (pos: number) => { parent: { type: { name: string } } } } } }
  node: { type: { name: string }; textContent: string }
  pos: number
}): string {
  const custom = props.placeholder ?? ''
  if (!custom.trim()) return ''
  const feishu =
    custom === '请输入正文' || custom === '输入正文，或按 / 快速插入'
  const nodeEmpty = !args.node.textContent
  if (args.node.type.name === 'heading' && nodeEmpty) return '标题'
  if (args.editor.isEmpty) {
    return feishu ? '输入正文，或按 / 快速插入' : custom
  }
  if (!feishu || !nodeEmpty || args.node.type.name !== 'paragraph') return ''
  try {
    const parent = args.editor.state.doc.resolve(args.pos).parent
    if (parent.type.name === 'listItem' || parent.type.name === 'taskItem') return ''
  } catch {
    /* 位置失效时不展示 */
  }
  return '按 / 插入'
}
const auth = useAuthStore()
const documentStore = useDocumentStore()
const { saving, dirty, conflict, document_id } = storeToRefs(documentStore)

function initialEditorContent(): string {
  try {
    return toEditorContent(props.modelValue)
  } catch {
    editorBootError.value = '正文无法解析，已从空白文档继续。'
    return '<p></p>'
  }
}

/** 最近一次已交给父级的 HTML。大文档节流期间用它挡住回声 setContent。 */
let lastEmittedHtmlNorm = ''
let htmlEmitTimer: ReturnType<typeof setTimeout> | null = null

function scheduleHtmlEmit(
  ed: { isDestroyed?: boolean; getHTML: () => string } | null | undefined,
  immediate = false,
) {
  const flush = () => {
    htmlEmitTimer = null
    if (!ed || ed.isDestroyed) return
    let html = ''
    try {
      html = ed.getHTML()
    } catch {
      return
    }
    const norm = normalizeHtml(html)
    if (norm === lastEmittedHtmlNorm) return
    lastEmittedHtmlNorm = norm
    emit('update:modelValue', html)
  }
  if (immediate) {
    if (htmlEmitTimer != null) {
      clearTimeout(htmlEmitTimer)
      htmlEmitTimer = null
    }
    flush()
    return
  }
  if (htmlEmitTimer != null) return
  htmlEmitTimer = setTimeout(flush, 160)
}

const editor = useEditor({

  content: initialEditorContent(),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // 使用 RteCodeBlockLowlight，避免与 StarterKit 自带 codeBlock 重复注册
      codeBlock: false,
      blockquote: false,
      // 使用 RteHorizontalRule（样式变体），关闭内置
      horizontalRule: false,
      bulletList: {},
      orderedList: {},
      listItem: {},
      // TipTap 3 StarterKit 自带 Link；关掉以免与下方 Link.configure 重复，
      // 否则 data:/blob: 附件链接会被默认协议校验剥掉 href
      link: false,
      // TipTap 3 StarterKit 也自带 Underline；关掉以免与下方 Underline 重复注册
      underline: false,
      // 拖拽图片到同行时更明显的落点指示（飞书式并排）
      dropcursor: { color: '#5b8cff', width: 2 },
    }),
    Underline,
    Subscript,
    Superscript,
    RteCodeBlockLowlight,
    TextStyle,
    FontSize,
    FontFamily,
    LineHeight,
    LetterSpacing,
    ParagraphAttrs,
    PageBreak,
    Columns,
    Column,
    Callout,
    Bookmark,
    RteBlockquote,
    EmphasisDot,
    ToggleBlock,
    Audio,
    LinkCard,
    Footnote,
    SensitiveHighlight,
    RevisionHighlight,
    Ruby,
    StatusChip,
    ProgressBar,
    Timeline,
    TimelineItem,
    TabsBlock,
    TabPane,
    MermaidBlock,
    CrossRef,
    ListStyleAttrs,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    Link.configure({
      openOnClick: false,
      // data/blob：本地附件 DataURL / ObjectURL 可作为链接芯片插入
      protocols: ['http', 'https', 'data', 'blob'],
      HTMLAttributes: { class: 'rte-link' },
      isAllowedUri: (url, ctx) => {
        if (!url) return false
        if (/^(data|blob):/i.test(url)) return true
        return ctx.defaultValidate(url)
      },
    }),
    RteImage.configure({
      // inline：多张可落在同一段落内并排（飞书式同行）；仍可拖拽重排
      inline: true,
      allowBase64: true,
      HTMLAttributes: { class: 'rte-image' },
      // TipTap 内置 ResizableNodeView：悬停/选中显示锚点，拖拽缩放并写入 width/height
      resize: {
        enabled: true,
        // 8 锚点：四角 + 四边中点
        directions: [
          'top-left',
          'top',
          'top-right',
          'left',
          'right',
          'bottom-left',
          'bottom',
          'bottom-right',
        ],
        minWidth: 48,
        minHeight: 48,
        alwaysPreserveAspectRatio: true,
      },
    }),
    Video.configure({
      inline: true,
      HTMLAttributes: { class: 'rte-video' },
      resize: {
        enabled: true,
        directions: [
          'top-left',
          'top',
          'top-right',
          'left',
          'right',
          'bottom-left',
          'bottom',
          'bottom-right',
        ],
        minWidth: 48,
        minHeight: 48,
        alwaysPreserveAspectRatio: true,
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    RteTableHeader,
    RteTableCell,
    RteHorizontalRule,
    Placeholder.configure({
      placeholder: (args) => rtePlaceholderText(args),
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
      includeChildren: true,
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
    }),
    Annotation,
    MathInline,
    MathDisplay,
    FormTextInput,
    FormRadioGroup,
    FormCheckboxGroup,
    FormSelect,
    FormTextarea,
    FormNumberInput,
    FormDateInput,
    FormSwitch,
    FormShowIf,
    createRteMention({ ui: mentionUi }),
    SlashCommands.configure({
      ui: slashUi,
    }),
  ].filter((ext): ext is NonNullable<typeof ext> => ext != null),
  editorProps: {
    attributes: {
      class: 'rte-prose',
      spellcheck: 'false', // 运行时由 syncSpellcheckToDom 同步
    },
    transformPastedHTML(html) {
      if (pastePlainTextMode.value) {
        const tmp = document.createElement('div')
        tmp.innerHTML = html
        const plain = tmp.textContent || tmp.innerText || ''
        return escapeHtml(plain).replace(/\n/g, '<br>')
      }
      // Paste cleanup: scripts/styles/handlers + Word/Office 深度清理
      const looksWord =
        /class=("|'|)Mso/i.test(html) ||
        /mso-/i.test(html) ||
        /xmlns:w=/i.test(html) ||
        /<!--\[if/i.test(html)
      if (looksWord && !wordPasteHinted) {
        wordPasteHinted = true
        try {
          ElMessage.info('已自动清理 Word 粘贴中的多余格式')
        } catch {
          /* ignore */
        }
      }
      return sanitizePastedHtml(html)
    },
    handlePaste(_view, event) {
      const plain = event.clipboardData?.getData('text/plain')
      const html = event.clipboardData?.getData('text/html') || ''
      // Markdown 强制模式：纯文本一律走 MD→HTML
      if (pasteFormatMode.value === 'markdown' && plain) {
        event.preventDefault()
        const ed = editor.value
        if (!ed) return true
        const normalized = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const mdHtml = markdownToHtml(normalized)
        ed.chain().focus().insertContent(mdHtml).run()
        return true
      }
      // 纯文本模式：始终按纯文本插入
      if (pastePlainTextMode.value || pasteFormatMode.value === 'plain') {
        if (plain == null) return false
        event.preventDefault()
        const ed = editor.value
        if (!ed) return true
        const normalized = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const chainCmd = ed.chain().focus()
        if (!ed.state.selection.empty) {
          chainCmd.deleteSelection()
        }
        if (!normalized.includes('\n')) {
          chainCmd.insertContent(normalized).run()
          return true
        }
        const lines = normalized.split('\n')
        const nodes = lines.map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        }))
        chainCmd.insertContent(nodes).run()
        return true
      }
      // Markdown 智能粘贴：剪贴板无富文本 HTML（或仅碎片）且纯文本像 Markdown 时转 HTML
      if (plain && looksLikeMarkdown(plain) && !looksLikeRichHtml(html)) {
        event.preventDefault()
        const ed = editor.value
        if (!ed) return true
        const normalized = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const mdHtml = markdownToHtml(normalized)
        ed.chain().focus().insertContent(mdHtml).run()
        return true
      }
      return false
    },
    handleClick(_view, _pos, event) {
      const target = event.target as HTMLElement | null
      const ann = target?.closest?.('[data-annotation]') as HTMLElement | null
      if (!ann) return false
      const href = ann.getAttribute('data-href')?.trim()
      if (!href) return false
      event.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
      return true
    },
    handleDOMEvents: {
      contextmenu: (_view, event) => {
        const target = event.target as HTMLElement | null
        if (!target?.closest?.('td, th, table, .tableWrapper')) return false
        event.preventDefault()
        openTableContextMenu(event)
        return true
      },
      mousedown: (_view, event) => {
        // 左键点编辑区时收起表格菜单；右键留给 contextmenu
        if (event.button === 2) return false
        if (tableMenuOpen.value) tableMenuOpen.value = false
        if (tableOpsSheetOpen.value) tableOpsSheetOpen.value = false
        if (tableCtx.value.open) closeTableCtx()
        return false
      },
    },
    handleKeyDown(_view, event) {
      // Extra shortcuts (StarterKit already covers Mod-b/i etc.)
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return false
      const ed = editor.value
      if (!ed) return false
      const key = event.key.toLowerCase()
      if (key === 'u') {
        event.preventDefault()
        ed.chain().focus().toggleUnderline().run()
        return true
      }
      if (key === 'k') {
        event.preventDefault()
        openLinkDialog()
        return true
      }
      if (key === 'e' && event.shiftKey) {
        event.preventDefault()
        ed.chain().focus().toggleCodeBlock().run()
        return true
      }
      if (key === 'f') {
        event.preventDefault()
        openFindDialog()
        return true
      }
      // 段落样式：Ctrl/⌘+Alt+1…6 → 标题；Ctrl/⌘+Alt+0 → 正文
      if (event.altKey && !event.shiftKey) {
        if (key === '0') {
          event.preventDefault()
          setHeading(0)
          return true
        }
        if (key >= '1' && key <= '6') {
          event.preventDefault()
          setHeading(Number(key) as 1 | 2 | 3 | 4 | 5 | 6)
          return true
        }
      }
      // 表格快捷：Ctrl/⌘+Alt+方向 — 在旁插入行/列
      if (event.altKey && isInTable()) {
        if (key === 'arrowup') {
          event.preventDefault()
          tableAddRowBefore()
          return true
        }
        if (key === 'arrowdown') {
          event.preventDefault()
          tableAddRowAfter()
          return true
        }
        if (key === 'arrowleft') {
          event.preventDefault()
          tableAddColBefore()
          return true
        }
        if (key === 'arrowright') {
          event.preventDefault()
          tableAddColAfter()
          return true
        }
      }
      if (event.shiftKey && !event.altKey) {
        // 与飞书文档接近：Shift+X 删除线，Shift+9 引用（Shift+S 仍由 StarterKit 处理）
        if (key === 'x') {
          event.preventDefault()
          ed.chain().focus().toggleStrike().run()
          return true
        }
        if (key === '9') {
          event.preventDefault()
          ed.chain().focus().toggleBlockquote().run()
          return true
        }
      }
      if (event.altKey && !event.shiftKey && key === '9') {
        event.preventDefault()
        ed.chain().focus().toggleTaskList().run()
        return true
      }
      if (event.shiftKey) {
        if (key === 'd') {
          event.preventDefault()
          duplicateCurrentBlock()
          return true
        }
        if (key === 'arrowup') {
          event.preventDefault()
          moveCurrentBlock(-1)
          return true
        }
        if (key === 'arrowdown') {
          event.preventDefault()
          moveCurrentBlock(1)
          return true
        }
        if (key === '\\' || key === '|') {
          event.preventDefault()
          selectCurrentBlock()
          return true
        }
      }
      return false
    },
  },
  onCreate: () => {
    editorReady.value = true
  },
  onUpdate: ({ editor: ed }) => {
    scheduleHtmlEmit(ed)
  },
  onFocus: () => emit('focus'),
  onBlur: ({ editor: ed }) => {
    scheduleHtmlEmit(ed, true)
    emit('blur')
  },
  onSelectionUpdate: ({ editor: ed }) => {
    syncSelectedFormFromEditor(ed)
    applyFormatPainterIfNeeded(ed)
    syncImageBubbleCaption()
  },
  onTransaction: ({ editor: ed }) => {
    if (selectedFormPos.value != null) formSelectionTick.value += 1
    syncSelectedFormFromEditor(ed)
  },
})


type CapturedFormSel = {
  type: FormNodeName
  name: string
  pos: number
}

function captureSelectedFormTarget(ed: {
  state: {
    selection: unknown
    doc: {
      nodeAt: (pos: number) => { type: { name: string }; attrs: Record<string, unknown> } | null
    }
  }
}): CapturedFormSel | null {
  const sel = ed.state.selection
  if (sel instanceof NodeSelection && isFormNodeName(sel.node.type.name)) {
    return {
      type: sel.node.type.name,
      name: String(sel.node.attrs.name ?? ''),
      pos: sel.from,
    }
  }
  const pos = selectedFormPos.value
  const typ = selectedFormType.value
  if (pos == null || !typ) return null
  const node = ed.state.doc.nodeAt(pos)
  if (!node || node.type.name !== typ) return null
  return {
    type: typ,
    name: String(node.attrs.name ?? ''),
    pos,
  }
}

function findFormNodePos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ed: { state: { doc: { nodeAt: (pos: number) => any; descendants: (f: (node: any, pos: number) => boolean | void) => void; content: { size: number } } } },
  target: CapturedFormSel,
): number | null {
  try {
    const size = ed.state.doc.content.size
    if (target.pos >= 0 && target.pos <= size) {
      const at = ed.state.doc.nodeAt(target.pos)
      if (at && at.type.name === target.type) {
        if (!target.name || String(at.attrs.name ?? '') === target.name) {
          return target.pos
        }
      }
    }
  } catch {
    /* pos 越界时走扫描 */
  }
  let found: number | null = null
  try {
    ed.state.doc.descendants((node, pos) => {
      if (found != null) return false
      if (node.type.name !== target.type) return
      if (target.name && String(node.attrs.name ?? '') !== target.name) return
      found = pos
      return false
    })
  } catch {
    return null
  }
  return found
}

function restoreFormNodeSelection(
  // TipTap Editor；用宽松类型避免 Transaction 链式与 Selection 泛型摩擦
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ed: any,
  target: CapturedFormSel | null,
): boolean {
  if (!ed || !target || ed.isDestroyed) return false
  const pos = findFormNodePos(ed, target)
  if (pos == null) return false
  try {
    const tr = ed.state.tr
      .setSelection(NodeSelection.create(ed.state.doc, pos))
      .setMeta('addToHistory', false)
    ed.view.dispatch(tr)
    selectedFormPos.value = pos
    selectedFormType.value = target.type
    if (formInspectorDismissedPos.value !== pos) {
      formInspectorPinned.value = true
    }
    formSelectionTick.value += 1
    return true
  } catch {
    return false
  }
}

/** 文末若不是段落（常见 form* 原子），补空段落；不改选区（供外部 HTML 回写后调用）。 */
function ensureTrailingParagraphIfNeeded(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ed: any,
): boolean {
  if (!ed || ed.isDestroyed) return false
  const last = ed.state.doc.lastChild
  if (!last || last.type.name === 'paragraph') return false
  const paraType = ed.schema.nodes.paragraph
  if (!paraType) return false
  try {
    const para = paraType.create()
    const tr = ed.state.tr
      .insert(ed.state.doc.content.size, para)
      .setMeta('addToHistory', false)
    ed.view.dispatch(tr)
    return true
  } catch {
    return false
  }
}

/** 保证文末可编辑段落，并把选区落到文末文本光标（避免 NodeSelection 卡在 form*）。 */
function focusTextCaretAtEnd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ed: any,
): boolean {
  if (!ed || ed.isDestroyed) return false
  try {
    ensureTrailingParagraphIfNeeded(ed)
    const doc = ed.state.doc
    const last = doc.lastChild
    // 文末已是段落时，显式 TextSelection（勿用 Selection.atEnd：文末原子时会落成 NodeSelection）
    if (last?.type.name === 'paragraph') {
      const sel = TextSelection.create(doc, doc.content.size - 1)
      if (!ed.state.selection.eq(sel)) {
        ed.view.dispatch(ed.state.tr.setSelection(sel).scrollIntoView())
      }
      ed.view.focus()
      return true
    }
    return Boolean(ed.chain().focus('end').run())
  } catch {
    try {
      return Boolean(ed.chain().focus('end').run())
    } catch {
      return false
    }
  }
}


watch(
  () => props.modelValue,
  (value) => {
    const ed = editor.value
    if (!ed) return
    const next = toEditorContent(value)
    const nextNorm = normalizeHtml(next)
    const curNorm = normalizeHtml(ed.getHTML())
    if (curNorm === nextNorm) return
    // 父级 itemsToHtml/syncItemsFromHtml 回声：内容等价于刚 emit 的，勿整篇 setContent
    if (lastEmittedHtmlNorm && lastEmittedHtmlNorm === nextNorm) return
    if (!looksLikeHtml(value ?? '') && ed.getText() === (value ?? '')) return

    const captured = captureSelectedFormTarget(ed)
    // 属性面板改表单期间：即使外部 HTML 有微小序列化差异，也优先原地保留选区，避免跳到文末
    if (
      captured &&
      (inspectorInteracting.value || formInspectorPinned.value)
    ) {
      // 仍应用内容（真正外部变更），但随后立刻恢复 NodeSelection
      ed.commands.setContent(next, { emitUpdate: false })
      if (ensureTrailingParagraphIfNeeded(ed)) {
        /* 补尾段后 HTML 变了，下面重读 */
      }
      lastEmittedHtmlNorm = normalizeHtml(ed.getHTML())
      restoreFormNodeSelection(ed, captured)
      void nextTick(() => restoreFormNodeSelection(editor.value, captured))
      return
    }

    ed.commands.setContent(next, { emitUpdate: false })
    if (ensureTrailingParagraphIfNeeded(ed)) {
      /* 补尾段：避免回写丢掉空 <p> 后文末卡在 form* */
    }
    lastEmittedHtmlNorm = normalizeHtml(ed.getHTML())
    if (captured) {
      restoreFormNodeSelection(ed, captured)
    } else if (
      ed.state.selection instanceof NodeSelection &&
      isFormNodeName(ed.state.selection.node.type.name)
    ) {
      // 无显式表单选中意图时，不要把光标留在 form NodeSelection
      focusTextCaretAtEnd(ed)
      lastEmittedHtmlNorm = normalizeHtml(ed.getHTML())
    }
  },
)

watch(
  () => props.placeholder,
  (ph) => {
    // Placeholder is extension-level; content class still shows attr
    void ph
  },
)


const syncLabel = computed(() => {
  if (editorBootError.value) return editorBootError.value
  if (!editorReady.value) return '编辑器加载中…'
  if (conflict.value) return '云端已更新，请选择保留或恢复'
  if (saving.value) return '正在同步…'
  if (dirty.value) return '已写入画布，等待同步'
  if (!auth.isAuthenticated) return '仅保存在本机'
  if (document_id.value) return '已与云端一致'
  return '尚未建档'
})

const syncTone = computed(() => {
  if (editorBootError.value || conflict.value) return 'is-alert'
  if (saving.value || dirty.value) return 'is-pending'
  return 'is-ok'
})

const syncHint = computed(() => {
  if (conflict.value) {
    return '保存返回 409：云端有更新。请在文档冲突条选择保留本机或恢复云端，编辑器内容不会被静默覆盖。'
  }
  if (saving.value) return '正在把画布写入云端'
  if (dirty.value) return '改动已写入画布，自动保存会继续同步'
  if (!auth.isAuthenticated) return '未登录，内容只留在本机'
  if (document_id.value) return '与云端一致'
  return '尚未建档'
})

/** 纯文字符数（去空白更贴近中文「字数」） */
const charCount = computed(() => {
  const text = editor.value?.getText() ?? ''
  return Array.from(text.replace(/\s/g, '')).length
})

function countWords(raw: string): number {
  const t = raw.trim()
  if (!t) return 0
  const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length
  const en = t
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return cn + en
}

const wordCount = computed(() => countWords(editor.value?.getText() ?? ''))

const selectionStats = computed(() => {
  void editor.value?.state.selection
  const ed = editor.value
  if (!ed) return { chars: 0, words: 0, hasSelection: false }
  const { from, to, empty } = ed.state.selection
  if (empty) return { chars: 0, words: 0, hasSelection: false }
  const raw = ed.state.doc.textBetween(from, to, '\n', '\n')
  const chars = Array.from(raw.replace(/\s/g, '')).length
  return { chars, words: countWords(raw), hasSelection: true }
})

/** 中文阅读约 400 字/分钟 */
const readingMinutes = computed(() => {
  const n = charCount.value
  if (n <= 0) return 0
  return Math.max(1, Math.ceil(n / 400))
})

/** 段落 / 行 / 中英分计（企业级字数面板扩展） */
const docExtraStats = computed(() => {
  void editor.value?.state
  const ed = editor.value
  if (!ed) {
    return { paragraphs: 0, lines: 0, cjk: 0, asciiWords: 0, headings: 0 }
  }
  const raw = ed.getText()
  const lines = raw ? raw.split('\n').length : 0
  let paragraphs = 0
  let headings = 0
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph' && node.textContent.trim()) paragraphs += 1
    if (node.type.name === 'heading') headings += 1
  })
  const cjk = (raw.match(/[\u4e00-\u9fff]/g) || []).length
  const asciiWords = raw
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return { paragraphs, lines, cjk, asciiWords, headings }
})

function chain() {
  return editor.value?.chain().focus()
}

function isActive(
  nameOrAttrs: string | Record<string, unknown>,
  attrs?: Record<string, unknown>,
) {
  return editor.value?.isActive(nameOrAttrs as never, attrs) ?? false
}

function undo() {
  chain()?.undo().run()
}
function redo() {
  chain()?.redo().run()
}
function clearFormat() {
  const ed = editor.value
  if (!ed) return
  // 强化：marks + 块类型回正文倾向 + 对齐 / 段距 / 字距 / 缩进
  ed.chain()
    .focus()
    .unsetAllMarks()
    .clearNodes()
    .unsetTextAlign()
    .unsetLetterSpacing()
    .run()
  try {
    if (ed.isActive('paragraph') || ed.isActive('heading')) {
      ed.chain()
        .focus()
        .updateAttributes(ed.isActive('heading') ? 'heading' : 'paragraph', {
          indent: 0,
          marginTop: null,
          marginBottom: null,
        })
        .run()
    }
  } catch {
    /* attrs 可能未注册 */
  }
  if (ed.isActive('highlight')) {
    ed.chain().focus().unsetHighlight().run()
  }
  announceRte('已清除格式')
  ElMessage.success('已清除所选格式')
}

function activateFormatPainter(sticky = false) {
  const ed = editor.value
  if (!ed) return
  const { from, to, empty } = ed.state.selection
  if (empty) {
    ElMessage.warning('请先选中要复制格式的文字')
    return
  }
  const marks: Array<{ type: string; attrs: Record<string, unknown> }> = []
  ed.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    for (const m of node.marks) {
      const key = m.type.name
      if (!marks.some((x) => x.type === key && JSON.stringify(x.attrs) === JSON.stringify(m.attrs))) {
        marks.push({ type: key, attrs: { ...m.attrs } })
      }
    }
  })
  // 也抓 textStyle 属性
  const ts = ed.getAttributes('textStyle') || {}
  if (Object.values(ts).some((v) => v != null && v !== '')) {
    const idx = marks.findIndex((x) => x.type === 'textStyle')
    if (idx >= 0) marks[idx] = { type: 'textStyle', attrs: { ...ts } }
    else marks.push({ type: 'textStyle', attrs: { ...ts } })
  }
  // 块级：缩进 / 段距 / 首行缩进 / 方向 / 对齐 / 行高 / 标题级别（跨块刷）
  let block: FormatPainterBlock | null = null
  for (const type of ['paragraph', 'heading'] as const) {
    if (!ed.isActive(type)) continue
    const attrs = ed.getAttributes(type) || {}
    const indent = Number(attrs.indent || 0)
    const marginTop = (attrs.marginTop as string | null | undefined) ?? null
    const marginBottom = (attrs.marginBottom as string | null | undefined) ?? null
    const textIndent = (attrs.textIndent as string | null | undefined) ?? null
    const dirRaw = attrs.dir
    const dir =
      dirRaw === 'rtl' || dirRaw === 'ltr' ? (dirRaw as 'ltr' | 'rtl') : null
    const textAlign = (ed.getAttributes('paragraph')?.textAlign ||
      ed.getAttributes('heading')?.textAlign ||
      null) as string | null
    // TextAlign 存在节点 attrs
    const alignAttr =
      (attrs.textAlign as string | null | undefined) ||
      (ed.isActive({ textAlign: 'left' })
        ? 'left'
        : ed.isActive({ textAlign: 'center' })
          ? 'center'
          : ed.isActive({ textAlign: 'right' })
            ? 'right'
            : ed.isActive({ textAlign: 'justify' })
              ? 'justify'
              : null)
    const lineHeight =
      (typeof ed.getAttributes('textStyle')?.lineHeight === 'string'
        ? (ed.getAttributes('textStyle').lineHeight as string)
        : null) || null
    const headingLevel =
      type === 'heading' ? Number(attrs.level || 0) || null : null
    if (
      indent ||
      marginTop ||
      marginBottom ||
      textIndent ||
      dir ||
      alignAttr ||
      lineHeight ||
      headingLevel
    ) {
      block = {
        indent: indent || 0,
        marginTop: marginTop || null,
        marginBottom: marginBottom || null,
        textIndent: textIndent || null,
        dir,
        textAlign: alignAttr || textAlign || null,
        lineHeight,
        headingLevel,
        nodeType: type,
      }
    }
    break
  }
  if (!marks.length && !block) {
    ElMessage.warning('选区无明显格式可复制')
    return
  }
  formatPainter.value = { marks, block, sticky }
  formatPainterSkipSelection = true
  ElMessage.success(sticky ? '格式刷已锁定（再点取消）' : '格式刷已启用：请选择目标文字')
}

let formatPainterClickTimer: ReturnType<typeof setTimeout> | null = null

function toggleFormatPainter() {
  if (formatPainter.value) {
    if (formatPainterClickTimer) {
      clearTimeout(formatPainterClickTimer)
      formatPainterClickTimer = null
    }
    formatPainter.value = null
    ElMessage.info('已取消格式刷')
    return
  }
  if (formatPainterClickTimer) {
    clearTimeout(formatPainterClickTimer)
    formatPainterClickTimer = null
    activateFormatPainter(true)
    return
  }
  formatPainterClickTimer = setTimeout(() => {
    formatPainterClickTimer = null
    activateFormatPainter(false)
  }, 280)
}

function onFormatPainterDblClick() {
  if (formatPainterClickTimer) {
    clearTimeout(formatPainterClickTimer)
    formatPainterClickTimer = null
  }
  if (formatPainter.value?.sticky) {
    formatPainter.value = null
    ElMessage.info('已取消格式刷')
    return
  }
  activateFormatPainter(true)
}

function applyFormatPainterIfNeeded(ed: {
  state: { selection: { empty: boolean; from: number; to: number } }
  chain: () => any
  isActive: (name: string | Record<string, unknown>) => boolean
  getAttributes: (name: string) => Record<string, unknown>
}) {
  if (!formatPainter.value) return
  if (formatPainterSkipSelection) {
    formatPainterSkipSelection = false
    return
  }
  if (ed.state.selection.empty) return
  const marks = formatPainter.value.marks
  const block = formatPainter.value.block
  let c = ed.chain().focus()
  for (const m of marks) {
    c = c.setMark(m.type, m.attrs)
  }
  if (block?.lineHeight) {
    c = c.setMark('textStyle', { lineHeight: block.lineHeight })
  }
  if (block?.textAlign) {
    c = c.setTextAlign(block.textAlign)
  }
  // 跨块：对选区内每个 paragraph/heading 写入块属性
  if (block) {
    const patch: Record<string, unknown> = {}
    if (typeof block.indent === 'number') patch.indent = block.indent
    if ('marginTop' in block) patch.marginTop = block.marginTop
    if ('marginBottom' in block) patch.marginBottom = block.marginBottom
    if ('textIndent' in block) patch.textIndent = block.textIndent
    if ('dir' in block) patch.dir = block.dir
    if (Object.keys(patch).length) {
      // updateAttributes 作用于选区内该类型全部节点 → 跨块刷段属性
      c = c.updateAttributes('paragraph', patch)
      c = c.updateAttributes('heading', patch)
    }
    if (block.nodeType === 'heading' && block.headingLevel && ed.isActive('heading')) {
      c = c.setHeading({ level: block.headingLevel })
    }
  }
  c.run()
  if (!formatPainter.value.sticky) {
    formatPainter.value = null
  }
}

function indentBlock() {
  chain()?.indent().run()
}
function outdentBlock() {
  chain()?.outdent().run()
}

function insertEmoji(emoji: string) {
  chain()?.insertContent(emoji).run()
  emojiOpen.value = false
  moreOpen.value = false
}

function insertSpecialChar(ch: string) {
  chain()?.insertContent(ch).run()
  specialCharsOpen.value = false
  moreOpen.value = false
}

function insertPageBreak() {
  chain()?.setPageBreak().run()
}

const CALLOUT_MENU_ITEMS: { variant: CalloutVariant; label: string; hint: string }[] = [
  { variant: 'info', label: '提示', hint: '蓝色信息' },
  { variant: 'warn', label: '警告', hint: '橙色注意' },
  { variant: 'success', label: '成功', hint: '绿色确认' },
  { variant: 'error', label: '错误', hint: '红色危险' },
]

function insertCallout(variant: CalloutVariant = 'info') {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().toggleCallout(variant).run()
  calloutOpen.value = false
  moreCalloutOpen.value = false
  moreOpen.value = false
}

function toggleOutlinePanel() {
  outlineOpen.value = !outlineOpen.value
  closeAllToolbarMenus()
}

type OutlineHeading = { id: string; level: number; text: string; pos: number }

const outlineHeadings = computed((): OutlineHeading[] => {
  void editor.value?.state
  const ed = editor.value
  if (!ed) return []
  const out: OutlineHeading[] = []
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level) || 1
    const text = node.textContent.trim() || `（空标题 ${level}）`
    out.push({ id: `h-${pos}`, level, text, pos })
  })
  return out
})

function jumpToOutlineHeading(item: OutlineHeading) {
  const ed = editor.value
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

const SHORTCUT_GROUPS: { title: string; items: { keys: string; desc: string }[] }[] = [
  {
    title: '与飞书文档接近',
    items: [
      { keys: 'Ctrl/⌘ + B / I / U', desc: '加粗 / 斜体 / 下划线' },
      { keys: 'Ctrl/⌘ + Shift + X', desc: '删除线（Shift + S 同样有效）' },
      { keys: 'Ctrl/⌘ + K', desc: '插入或编辑链接' },
      { keys: 'Ctrl/⌘ + Alt + 1 / 2 / 3', desc: '标题 1–3（4–6 同样可用）' },
      { keys: 'Ctrl/⌘ + Alt + 0', desc: '回到正文' },
      { keys: 'Ctrl/⌘ + Shift + 8', desc: '无序列表' },
      { keys: 'Ctrl/⌘ + Shift + 7', desc: '有序列表' },
      { keys: 'Ctrl/⌘ + Alt + 9', desc: '任务列表' },
      { keys: 'Ctrl/⌘ + Shift + 9', desc: '引用' },
      { keys: 'Ctrl/⌘ + E', desc: '行内代码' },
      { keys: 'Ctrl/⌘ + Shift + E', desc: '代码块' },
      { keys: '/', desc: '斜杠命令，快速插入段落类型' },
      { keys: 'Tab / Shift + Tab', desc: '列表增加 / 减少缩进' },
    ],
  },
  {
    title: '编辑',
    items: [
      { keys: 'Ctrl/⌘ + Z', desc: '撤销' },
      { keys: 'Ctrl/⌘ + Shift + Z', desc: '重做' },
      { keys: 'Ctrl/⌘ + F', desc: '查找替换' },
      { keys: 'Ctrl/⌘ + A', desc: '全选' },
      { keys: 'Ctrl/⌘ + Shift + ↑/↓', desc: '块上移 / 下移' },
      { keys: 'Ctrl/⌘ + Shift + D', desc: '复制当前块' },
      { keys: "Ctrl/⌘ + Shift + \\（反斜杠）", desc: '全选当前块' },
    ],
  },
  {
    title: '格式',
    items: [
      { keys: 'Ctrl/⌘ + B', desc: '加粗' },
      { keys: 'Ctrl/⌘ + I', desc: '斜体' },
      { keys: 'Ctrl/⌘ + U', desc: '下划线' },
      { keys: 'Ctrl/⌘ + Shift + S', desc: '删除线' },
      { keys: 'Ctrl/⌘ + E', desc: '行内代码' },
      { keys: 'Ctrl/⌘ + Shift + E', desc: '代码块' },
      { keys: 'Ctrl/⌘ + K', desc: '插入/编辑链接' },
    ],
  },
  {
    title: '段落',
    items: [
      { keys: 'Ctrl/⌘ + Alt + 1…6', desc: '标题 1–6' },
      { keys: 'Ctrl/⌘ + Alt + ↑↓←→', desc: '表格旁插入行/列' },
      { keys: 'Ctrl/⌘ + Shift + 8', desc: '无序列表' },
      { keys: 'Ctrl/⌘ + Shift + 7', desc: '有序列表' },
      { keys: 'Ctrl/⌘ + Shift + 9', desc: '引用' },
      { keys: '/', desc: '斜杠命令菜单' },
      { keys: '@', desc: '提及' },
      { keys: '::: info + 空格', desc: '插入告示框' },
    ],
  },
]

function toggleShortcutsPanel() {
  markToolbarMenuOpening()
  const next = !shortcutsOpen.value
  closeAllToolbarMenus()
  shortcutsOpen.value = next
}

type ColumnCount = 2 | 3 | 4 | 5 | 6

/** 分栏菜单：等宽 + 常用比例预设 */
const COLUMN_MENU_ITEMS: Array<
  | { type: 'label'; text: string }
  | { type: 'sep' }
  | { type: 'item'; label: string; cols: ColumnCount; ratios?: number[] }
> = [
  { type: 'label', text: '两栏' },
  { type: 'item', label: '均分（1:1）', cols: 2 },
  { type: 'item', label: '左窄右宽（1:2）', cols: 2, ratios: [1, 2] },
  { type: 'item', label: '左宽右窄（2:1）', cols: 2, ratios: [2, 1] },
  { type: 'sep' },
  { type: 'label', text: '三栏' },
  { type: 'item', label: '均分（1:1:1）', cols: 3 },
  { type: 'item', label: '中宽（1:2:1）', cols: 3, ratios: [1, 2, 1] },
  { type: 'sep' },
  { type: 'label', text: '更多分栏' },
  { type: 'item', label: '四栏', cols: 4 },
  { type: 'item', label: '五栏', cols: 5 },
  { type: 'item', label: '六栏', cols: 6 },
]

function insertColumns(cols: ColumnCount, ratios?: number[]) {
  const ed = editor.value
  if (!ed) return
  // 工具栏菜单用了 @mousedown.prevent，需显式 focus 后再插
  const ok = ed.chain().focus().setColumns(cols, ratios).run()
  if (!ok) {
    console.warn('[RTE] setColumns failed', { cols, ratios })
  }
  columnsOpen.value = false
  moreOpen.value = false
}

function togglePastePlain() {
  pastePlainTextMode.value = !pastePlainTextMode.value
  pasteFormatMode.value = pastePlainTextMode.value ? 'plain' : 'keep'
  ElMessage.success(
    pastePlainTextMode.value ? '已开启：粘贴为纯文本' : '已关闭：粘贴为纯文本',
  )
}

/** 粘贴后格式：保留 / 纯文本 / Markdown 智能（下一轮粘贴生效） */
type PasteFormatMode = 'keep' | 'plain' | 'markdown'
const pasteFormatMode = ref<PasteFormatMode>('keep')
const pasteFormatOpen = ref(false)
function setPasteFormatMode(mode: PasteFormatMode) {
  pasteFormatMode.value = mode
  pastePlainTextMode.value = mode === 'plain'
  const labels: Record<PasteFormatMode, string> = {
    keep: '保留原格式',
    plain: '粘贴为纯文本',
    markdown: 'Markdown 智能转换',
  }
  ElMessage.success(`粘贴格式：${labels[mode]}`)
  moreOpen.value = false
}

function cyclePasteFormatMode() {
  const order: PasteFormatMode[] = ['keep', 'plain', 'markdown']
  const i = order.indexOf(pasteFormatMode.value)
  setPasteFormatMode(order[(i + 1) % order.length]!)
}

function syncSpellcheckToDom() {
  const ed = editor.value
  if (!ed?.view?.dom) return
  ed.view.dom.setAttribute('spellcheck', spellcheckEnabled.value ? 'true' : 'false')
  ;(ed.view.dom as HTMLElement).spellcheck = spellcheckEnabled.value
}

function toggleSpellcheck() {
  spellcheckEnabled.value = !spellcheckEnabled.value
  syncSpellcheckToDom()
  ElMessage.success(
    spellcheckEnabled.value
      ? '已开启拼写检查（依赖浏览器词典，中文支持因浏览器而异）'
      : '已关闭拼写检查',
  )
  moreOpen.value = false
}

async function insertBookmark() {
  const ed = editor.value
  if (!ed) return
  const { from, to, empty } = ed.state.selection
  let label = ''
  if (!empty) {
    label = ed.state.doc.textBetween(from, to, ' ').trim().slice(0, 40)
  }
  if (!label) {
    const raw = await openRtePrompt({
      title: '插入书签',
      message: '书签名称将作为跳转锚点显示',
      placeholder: '书签名称',
      defaultValue: '书签',
      maxlength: 40,
    })
    if (raw == null) return
    label = raw.trim().slice(0, 40) || '书签'
  }
  if (empty) {
    const id = `bm-${Date.now().toString(36)}`
    ed.chain()
      .focus()
      .insertContent({
        type: 'text',
        text: label,
        marks: [{ type: 'bookmark', attrs: { id, label } }],
      })
      .run()
  } else {
    ed.chain().focus().setBookmark({ label }).run()
  }
  ElMessage.success(`已插入书签「${label}」`)
  moreOpen.value = false
}

function listBookmarks(): Array<{ id: string; label: string; from: number }> {
  const ed = editor.value
  if (!ed) return []
  const out: Array<{ id: string; label: string; from: number }> = []
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const m of node.marks) {
      if (m.type.name !== 'bookmark') continue
      const id = String(m.attrs.id || '')
      if (!id) continue
      out.push({
        id,
        label: String(m.attrs.label || id),
        from: pos,
      })
    }
  })
  return out
}

function jumpToBookmark(id: string) {
  const ed = editor.value
  if (!ed || !id) return
  const found = listBookmarks().find((b) => b.id === id)
  if (!found) {
    ElMessage.warning('未找到该书签')
    return
  }
  const $pos = ed.state.doc.resolve(found.from)
  const tr = ed.state.tr.setSelection(TextSelection.near($pos)).scrollIntoView()
  ed.view.dispatch(tr)
  ed.view.focus()
  // 高亮目标 DOM
  nextTick(() => {
    const el = ed.view.dom.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
    el?.classList.add('rte-bookmark-flash')
    setTimeout(() => el?.classList.remove('rte-bookmark-flash'), 1200)
  })
}

const bookmarkPanelOpen = ref(false)
function toggleBookmarkPanel() {
  bookmarkPanelOpen.value = !bookmarkPanelOpen.value
  moreOpen.value = false
}

function applyTextIndent(v: string) {
  const ed = editor.value
  if (!ed) return
  ed.chain()
    .focus()
    .setTextIndent(v || null)
    .run()
}

function applyTextDir(dir: 'ltr' | 'rtl' | '') {
  const ed = editor.value
  if (!ed) return
  ed.chain()
    .focus()
    .setTextDir(dir || null)
    .run()
}

function currentTextIndent(): string {
  const ed = editor.value
  if (!ed) return ''
  for (const type of ['paragraph', 'heading'] as const) {
    if (ed.isActive(type)) {
      const v = ed.getAttributes(type).textIndent
      return typeof v === 'string' ? v : ''
    }
  }
  return ''
}

function currentTextDir(): string {
  const ed = editor.value
  if (!ed) return ''
  for (const type of ['paragraph', 'heading'] as const) {
    if (ed.isActive(type)) {
      const v = ed.getAttributes(type).dir
      return v === 'rtl' || v === 'ltr' ? v : ''
    }
  }
  return ''
}

function currentQuoteStyle(): QuoteStyle {
  const ed = editor.value
  if (!ed || !ed.isActive('blockquote')) return 'default'
  const v = ed.getAttributes('blockquote').quoteStyle
  return v === 'emphasis' || v === 'verse' || v === 'default' ? v : 'default'
}

function applyQuoteStyle(style: QuoteStyle) {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().setQuoteStyle(style).run()
  moreOpen.value = false
  calloutOpen.value = false
}

const IMAGE_WIDTH_PRESETS: Array<{ label: string; value: string }> = [
  { label: '原始', value: '' },
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '100%', value: '100%' },
]

function setImageDisplayWidth(w: string) {
  const ed = editor.value
  if (!ed || !isImageNodeSelected()) return
  ed.chain()
    .focus()
    .updateAttributes('image', { displayWidth: w || null })
    .run()
}

/* ========== Wave20 企业能力 ========== */
function runCaseTransform(mode: CaseMode) {
  const ed = editor.value
  if (!ed) return
  if (!applyCaseToSelection(ed, mode)) {
    ElMessage.info('请先选中要转换的文字')
    return
  }
  const labels = { upper: '全大写', lower: '全小写', title: '词首大写' }
  ElMessage.success(`已转换：${labels[mode]}`)
  caseMenuOpen.value = false
  moreOpen.value = false
}

function toggleEmphasisDot() {
  chain()?.toggleEmphasisDot().run()
}

async function copyAsMarkdown() {
  const ed = editor.value
  if (!ed) return
  try {
    const md = await copySelectionOrDocAsMarkdown(ed)
    await navigator.clipboard.writeText(md)
    ElMessage.success('已复制为 Markdown')
  } catch (e) {
    console.error(e)
    ElMessage.error('复制失败（需剪贴板权限）')
  }
  moreOpen.value = false
}

async function insertToggleBlock() {
  const summary = await openRtePrompt({
    title: '插入折叠块',
    message: '点击标题可展开 / 收起内容',
    placeholder: '折叠标题',
    defaultValue: '折叠标题',
    maxlength: 80,
  })
  if (summary == null) return
  chain()?.insertToggleBlock({ summary: summary.trim() || '折叠标题' }).run()
  moreOpen.value = false
}

function insertAudioBlock() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      if (!src) return
      editor.value?.chain().focus().setAudio({ src, title: file.name }).run()
      ElMessage.success('已插入音频')
    }
    reader.readAsDataURL(file)
  }
  input.click()
  moreOpen.value = false
}

function insertLinkCardBlock() {
  openLinkCardDialog()
}

async function insertFootnoteAtCursor() {
  const ed = editor.value
  if (!ed) return
  const text = await openRtePrompt({
    title: '插入脚注',
    message: '脚注将显示为上标，并可在脚注区汇总',
    placeholder: '脚注内容',
    defaultValue: '',
    maxlength: 500,
  })
  if (text == null || !text.trim()) return
  const id = `fn-${Date.now().toString(36)}`
  const n = collectFootnotes(ed).length + 1
  if (ed.state.selection.empty) {
    ed.chain()
      .focus()
      .insertContent({
        type: 'text',
        text: `[${n}]`,
        marks: [{ type: 'footnote', attrs: { id, text: text.trim(), n } }],
      })
      .run()
  } else {
    ed.chain().focus().setFootnote({ id, text: text.trim() }).run()
  }
  renumberFootnotes(ed)
  footnotePanelOpen.value = true
  ElMessage.success('已插入脚注')
  moreOpen.value = false
}

function openFootnotePanel() {
  const ed = editor.value
  if (ed) renumberFootnotes(ed)
  footnotePanelOpen.value = !footnotePanelOpen.value
  moreOpen.value = false
}

function doRenumberCaptions() {
  const ed = editor.value
  if (!ed) return
  const r = renumberCaptions(ed)
  ElMessage.success(`题注已编号：图 ${r.images} · 表 ${r.tables}`)
  moreOpen.value = false
}

async function insertQrCode() {
  const raw = await openRtePrompt({
    title: '插入二维码',
    message: '输入链接或任意文本，将生成二维码图片',
    placeholder: 'https:// 或文本',
    defaultValue: 'https://',
    maxlength: 1000,
  })
  if (raw == null || !raw.trim()) return
  try {
    const dataUrl = await makeQrDataUrl(raw.trim())
    editor.value
      ?.chain()
      .focus()
      .setImage({ src: dataUrl, alt: 'QR' })
      .updateAttributes('image', { caption: raw.trim().slice(0, 80) })
      .run()
    ElMessage.success('已插入二维码')
  } catch (e) {
    console.error(e)
    ElMessage.error('二维码生成失败')
  }
  moreOpen.value = false
}

function applyCellValign(v: string) {
  const ed = editor.value
  if (!ed || !isInTable()) {
    ElMessage.info('请在表格单元格内操作')
    return
  }
  setCellVerticalAlign(ed, v || null)
  moreOpen.value = false
}

function doSortTable(asc: boolean) {
  const ed = editor.value
  if (!ed || !isInTable()) {
    ElMessage.info('请将光标放在表格中')
    return
  }
  const col = currentTableColIndex(ed)
  if (sortTableByColumn(ed, col, asc)) {
    ElMessage.success(`已按第 ${col + 1} 列${asc ? '升序' : '降序'}排序`)
  } else {
    ElMessage.warning('排序失败（需至少 2 行）')
  }
  moreOpen.value = false
}

function doTableSumRow() {
  const ed = editor.value
  if (!ed || !isInTable()) {
    ElMessage.info('请将光标放在表格中')
    return
  }
  if (upsertTableSumRow(ed)) ElMessage.success('已更新合计行')
  else ElMessage.warning('无法生成合计行')
  moreOpen.value = false
}

function toggleTableStickyHeader() {
  tableHeaderSticky.value = !tableHeaderSticky.value
  ElMessage.success(tableHeaderSticky.value ? '已开启表头冻结' : '已关闭表头冻结')
  moreOpen.value = false
}

function speakSelection() {
  const ed = editor.value
  if (!ed) return
  const { from, to, empty } = ed.state.selection
  const text = empty
    ? ed.getText({ blockSeparator: '。' }).slice(0, 2000)
    : ed.state.doc.textBetween(from, to, ' ')
  if (!speakText(text)) ElMessage.warning('当前环境不支持朗读')
  else ElMessage.success('开始朗读（再次可点停止）')
  moreOpen.value = false
}

function stopSpeaking() {
  stopSpeak()
  ElMessage.info('已停止朗读')
}

function toggleSensitiveCheck() {
  sensitiveOn.value = !sensitiveOn.value
  editor.value?.commands.setSensitiveHighlight(sensitiveOn.value)
  ElMessage.success(sensitiveOn.value ? '已开启敏感词/错别字提示' : '已关闭敏感词提示')
  moreOpen.value = false
}

function toggleRevisionHighlight() {
  const ed = editor.value
  if (!ed) return
  if (!revisionOn.value) {
    ed.commands.captureRevisionBaseline()
    ed.commands.setRevisionHighlight(true)
    revisionOn.value = true
    ElMessage.success('已开启单机修订高亮（相对当前基线）')
  } else {
    ed.commands.setRevisionHighlight(false)
    revisionOn.value = false
    ElMessage.info('已关闭修订高亮')
  }
  moreOpen.value = false
}

function resetRevisionBaseline() {
  editor.value?.commands.captureRevisionBaseline()
  ElMessage.success('已重新标记修订基线')
}

function setEditorZoom(z: number) {
  editorZoom.value = z
  zoomMenuOpen.value = false
  moreOpen.value = false
}

function toggleFocusMode() {
  focusMode.value = !focusMode.value
  ElMessage.success(focusMode.value ? '专注模式' : '已退出专注模式')
  moreOpen.value = false
}

function toggleDarkEditor() {
  darkEditor.value = !darkEditor.value
  moreOpen.value = false
}

function togglePaperGuide() {
  paperGuide.value = !paperGuide.value
  moreOpen.value = false
}


/** —— Wave21：标题自动编号 / 样式集 / 列表样式 / 注音 / 结构块 / 检查 / 全屏 / 片段 —— */
function toggleHeadingAutoNumber() {
  headingAutoNumber.value = !headingAutoNumber.value
  moreOpen.value = false
  ElMessage.success(headingAutoNumber.value ? '已开启标题自动编号' : '已关闭标题自动编号')
}

function applyParaStyleId(id: WaveParaStyleId) {
  const ed = editor.value
  if (!ed) return
  applyParagraphStyle(ed, id)
  paraStyleOpen.value = false
  moreOpen.value = false
  ElMessage.success('已应用段落样式')
}

function applyListStyle(style: string) {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().setOrderedListStyle(style as any).run()
  listStyleOpen.value = false
  moreOpen.value = false
}

async function applyListStart() {
  const raw = await openRtePrompt({
    title: '列表起始序号',
    message: '有序列表从几开始？',
    defaultValue: '1',
    placeholder: '1',
    maxlength: 4,
  })
  if (raw == null) return
  const n = parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n < 1) {
    ElMessage.warning('请输入正整数')
    return
  }
  editor.value?.chain().focus().setOrderedListStart(n).run()
  listStyleOpen.value = false
}

async function insertRubyAnnotation() {
  const ed = editor.value
  if (!ed) return
  const sel = ed.state.selection
  if (sel.empty) {
    ElMessage.info('请先选中要注音的文字')
    return
  }
  const ann = await openRtePrompt({
    title: '注音 / 拼音',
    message: '为选中文字添加注音（显示在字上方）',
    placeholder: '如：pin yin',
    maxlength: 80,
  })
  if (ann == null) return
  if (!ann.trim()) {
    ed.chain().focus().unsetRuby().run()
    ElMessage.success('已清除注音')
    return
  }
  ed.chain().focus().setRuby(ann.trim()).run()
  ElMessage.success('已添加注音')
}

function insertTimelineBlock() {
  editor.value?.chain().focus().insertTimeline().run()
  moreOpen.value = false
  ElMessage.success('已插入时间线')
}

async function insertStatusChipBlock() {
  const label = await openRtePrompt({
    title: '状态徽章',
    message: '输入徽章文字（如：进行中）',
    defaultValue: '进行中',
    maxlength: 20,
  })
  if (label == null) return
  const toneRaw = await openRtePrompt({
    title: '徽章颜色',
    message: 'gray / blue / green / orange / red / purple',
    defaultValue: 'blue',
    maxlength: 12,
  })
  if (toneRaw == null) return
  const tone = (STATUS_CHIP_TONES as readonly { value: string }[]).some(
    (x) => x.value === toneRaw.trim(),
  )
    ? toneRaw.trim()
    : 'blue'
  editor.value
    ?.chain()
    .focus()
    .insertStatusChip({ label: label.trim() || '状态', tone: tone as any })
    .run()
  ElMessage.success('已插入状态徽章')
}

async function insertProgressBarBlock() {
  const raw = await openRtePrompt({
    title: '进度条',
    message: '进度 0–100',
    defaultValue: '60',
    maxlength: 3,
  })
  if (raw == null) return
  const label = await openRtePrompt({
    title: '进度说明',
    message: '可选标签',
    defaultValue: '完成度',
    maxlength: 40,
  })
  if (label == null) return
  editor.value
    ?.chain()
    .focus()
    .insertProgressBar({ percent: parseFloat(raw) || 0, label: label.trim() })
    .run()
  ElMessage.success('已插入进度条')
}

async function insertTabsBlockAtCursor() {
  const raw = await openRtePrompt({
    title: '标签页',
    message: '用逗号或顿号分隔标签名（至少 2 个）',
    defaultValue: '概览,细节,附录',
    maxlength: 80,
  })
  if (raw == null) return
  const titles = raw
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (titles.length < 2) {
    ElMessage.warning('至少两个标签')
    return
  }
  editor.value?.chain().focus().insertTabsBlock(titles).run()
  ElMessage.success('已插入标签页')
}

function insertMermaidAtCursor() {
  editor.value?.chain().focus().insertMermaidBlock().run()
  moreOpen.value = false
  ElMessage.success('已插入流程图（可点块内「编辑源码」）')
}


function openXrefDialog() {
  const ed = editor.value
  if (!ed) return
  xrefTargets.value = collectCrossRefTargets(ed)
  xrefDialogOpen.value = true
  moreOpen.value = false
}

function confirmInsertXref(target: (typeof xrefTargets.value)[number]) {
  editor.value
    ?.chain()
    .focus()
    .insertCrossRef({
      kind: target.kind,
      targetId: target.id,
      label: target.label,
    })
    .run()
  xrefDialogOpen.value = false
  ElMessage.success('已插入交叉引用')
}

function insertMentionFromToolbar() {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().insertContent('@').run()
  moreOpen.value = false
  ElMessage.info('已插入 @，请继续选择提及对象')
}

async function copyCurrentTable(format: 'csv' | 'tsv') {
  const ed = editor.value
  if (!ed) return
  const ok = await copyTableAs(ed, format)
  if (!ok) ElMessage.info('请将光标放在表格中')
  else ElMessage.success(format === 'csv' ? '已复制为 CSV' : '已复制为 TSV')
  moreOpen.value = false
}

async function promptTableRowFilter() {
  const ed = editor.value
  if (!ed) return
  const raw = await openRtePrompt({
    title: '表格行筛选',
    message: '输入关键词隐藏不含该词的数据行；留空则清除筛选（仅视图，不改文档）',
    defaultValue: tableFilterQuery.value,
    placeholder: '关键词',
    maxlength: 80,
  })
  if (raw == null) return
  tableFilterQuery.value = raw.trim()
  const hidden = applyTableRowFilter(ed, tableFilterQuery.value)
  if (hidden < 0) ElMessage.info('请将光标放在表格中')
  else if (!tableFilterQuery.value) ElMessage.success('已清除行筛选')
  else ElMessage.success(`已隐藏 ${hidden} 行`)
}

function runHeadingHierarchyCheck() {
  const ed = editor.value
  if (!ed) return
  const issues = checkHeadingHierarchy(ed)
  wave21ReportTitle.value = '标题层级检查'
  if (!issues.length) {
    wave21ReportLines.value = [{ text: '未发现问题：标题层级连续且非空。' }]
  } else {
    wave21ReportLines.value = issues.map((it) => ({
      text: `H${it.level}「${it.text}」— ${it.message}`,
      pos: it.pos,
    }))
  }
  wave21ReportOpen.value = true
  moreOpen.value = false
}

function runDeadLinkCheck() {
  const ed = editor.value
  if (!ed) return
  const issues = checkDocumentLinks(ed)
  wave21ReportTitle.value = '死链 / 空链检查'
  if (!issues.length) {
    wave21ReportLines.value = [{ text: '未发现空链接或不安全协议链接。' }]
  } else {
    wave21ReportLines.value = issues.map((it) => ({
      text: `${it.message}｜「${it.text || '(无文本)'}」 ${it.href || ''}`.trim(),
      pos: it.pos,
    }))
  }
  wave21ReportOpen.value = true
  moreOpen.value = false
}

function jumpWave21Report(pos?: number) {
  if (pos == null || !editor.value) return
  jumpToPos(editor.value, pos)
  wave21ReportOpen.value = false
}

function openReadTimeDialog() {
  readTimeDialogOpen.value = true
  moreOpen.value = false
}

function toggleImmersiveFullscreen() {
  immersiveFullscreen.value = !immersiveFullscreen.value
  moreOpen.value = false
  ElMessage.success(immersiveFullscreen.value ? '已进入全屏沉浸' : '已退出全屏')
}

function onImmersiveKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && immersiveFullscreen.value) {
    immersiveFullscreen.value = false
  }
}

function openSnippetDialog() {
  snippetList.value = loadSnippets()
  snippetEditing.value = null
  snippetTitle.value = ''
  snippetBody.value = ''
  snippetDialogOpen.value = true
  moreOpen.value = false
}

function insertSnippet(sn: RteSnippet) {
  editor.value?.chain().focus().insertContent(sn.body).run()
  snippetDialogOpen.value = false
  ElMessage.success(`已插入「${sn.title}」`)
}

function startEditSnippet(sn: RteSnippet | null) {
  snippetEditing.value = sn
  snippetTitle.value = sn?.title || ''
  snippetBody.value = sn?.body || ''
}

function saveSnippetForm() {
  const title = snippetTitle.value.trim()
  const body = snippetBody.value.trim()
  if (!title || !body) {
    ElMessage.warning('请填写标题与内容')
    return
  }
  const list = [...snippetList.value]
  if (snippetEditing.value) {
    const i = list.findIndex((x) => x.id === snippetEditing.value!.id)
    if (i >= 0) list[i] = { ...list[i]!, title, body }
  } else {
    list.push({ id: `s-${Date.now().toString(36)}`, title, body })
  }
  snippetList.value = list
  saveSnippets(list)
  snippetEditing.value = null
  snippetTitle.value = ''
  snippetBody.value = ''
  ElMessage.success('片段已保存')
}

function deleteSnippet(sn: RteSnippet) {
  const list = snippetList.value.filter((x) => x.id !== sn.id)
  snippetList.value = list.length ? list : [...DEFAULT_SNIPPETS]
  saveSnippets(snippetList.value)
  ElMessage.success('已删除片段')
}

function setImageBorderRadius(v: string) {
  editor.value?.chain().focus().updateAttributes('image', { borderRadius: v || null }).run()
}
function setImageBoxShadow(v: string) {
  editor.value?.chain().focus().updateAttributes('image', { boxShadow: v || null }).run()
}
function setImageBorderStyle(v: string) {
  editor.value?.chain().focus().updateAttributes('image', { borderStyle: v || null }).run()
}

function showCjkTypographyTip() {
  ElMessage.info('已启用轻量中文禁则样式（避头尾/标点挤压）；完整排版引擎请用导出 PDF/打印校对')
  moreOpen.value = false
}

function openPrintPreview() {
  const ed = editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (localTitle.value || '').trim()
  const body = ed.getHTML() || '<p></p>'
  printPreviewHtml.value = title
    ? `<h1 class="rte-print-title">${escapeHtml(title)}</h1>${body}`
    : body
  printPreviewOpen.value = true
  moreOpen.value = false
}

function closePrintPreview() {
  printPreviewOpen.value = false
  printPreviewHtml.value = ''
}

function printEditor() {
  const root = rteRootEl.value
  if (!root) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  root.classList.add('rte-printing')
  const cleanup = () => {
    root.classList.remove('rte-printing')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // 部分浏览器不触发 afterprint
  setTimeout(cleanup, 1500)
}

function confirmPrintFromPreview() {
  closePrintPreview()
  nextTick(() => printEditor())
}

function currentLetterSpacing(): string {
  const v = editor.value?.getAttributes('textStyle')?.letterSpacing
  return typeof v === 'string' ? v : ''
}
function currentMarginTop(): string {
  const ed = editor.value
  if (!ed) return ''
  for (const type of ['paragraph', 'heading'] as const) {
    if (ed.isActive(type)) {
      const v = ed.getAttributes(type).marginTop
      return typeof v === 'string' ? v : ''
    }
  }
  return ''
}
function currentMarginBottom(): string {
  const ed = editor.value
  if (!ed) return ''
  for (const type of ['paragraph', 'heading'] as const) {
    if (ed.isActive(type)) {
      const v = ed.getAttributes(type).marginBottom
      return typeof v === 'string' ? v : ''
    }
  }
  return ''
}
function applyLetterSpacing(v: string) {
  if (!v) chain()?.unsetLetterSpacing().run()
  else chain()?.setLetterSpacing(v).run()
}
function applyMarginTop(v: string) {
  chain()?.setParagraphSpacing({ marginTop: v || null }).run()
}
function applyMarginBottom(v: string) {
  chain()?.setParagraphSpacing({ marginBottom: v || null }).run()
}
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6
type ParaStyleId = 'paragraph' | 'blockquote' | `h${HeadingLevel}`

type ParaStyleItem = {
  id: ParaStyleId
  label: string
  /** 预览样本文字 */
  sample: string
  /** 预览字号（菜单内） */
  fontSize: string
  fontWeight: number
  /** 层级缩进（px） */
  indent: number
  group: 'text' | 'heading' | 'block'
  shortcut?: string
}

/** 段落样式菜单：正文 + H1–H6 + 引用（Word/飞书式预览） */
const PARA_STYLE_ITEMS: ParaStyleItem[] = [
  {
    id: 'paragraph',
    label: '正文',
    sample: '正文',
    fontSize: '14px',
    fontWeight: 400,
    indent: 0,
    group: 'text',
    shortcut: '',
  },
  {
    id: 'h1',
    label: '标题 1',
    sample: '标题 1',
    fontSize: '26px',
    fontWeight: 700,
    indent: 0,
    group: 'heading',
    shortcut: 'Ctrl+Alt+1',
  },
  {
    id: 'h2',
    label: '标题 2',
    sample: '标题 2',
    fontSize: '22px',
    fontWeight: 700,
    indent: 8,
    group: 'heading',
    shortcut: 'Ctrl+Alt+2',
  },
  {
    id: 'h3',
    label: '标题 3',
    sample: '标题 3',
    fontSize: '18px',
    fontWeight: 600,
    indent: 16,
    group: 'heading',
    shortcut: 'Ctrl+Alt+3',
  },
  {
    id: 'h4',
    label: '标题 4',
    sample: '标题 4',
    fontSize: '16px',
    fontWeight: 600,
    indent: 24,
    group: 'heading',
    shortcut: 'Ctrl+Alt+4',
  },
  {
    id: 'h5',
    label: '标题 5',
    sample: '标题 5',
    fontSize: '14px',
    fontWeight: 600,
    indent: 32,
    group: 'heading',
    shortcut: 'Ctrl+Alt+5',
  },
  {
    id: 'h6',
    label: '标题 6',
    sample: '标题 6',
    fontSize: '13px',
    fontWeight: 600,
    indent: 40,
    group: 'heading',
    shortcut: 'Ctrl+Alt+6',
  },
  {
    id: 'blockquote',
    label: '引用',
    sample: '引用段落',
    fontSize: '14px',
    fontWeight: 400,
    indent: 0,
    group: 'block',
    shortcut: '',
  },
]

const headingFocusIndex = ref(0)

function currentParaStyleId(): ParaStyleId {
  const ed = editor.value
  if (!ed) return 'paragraph'
  if (ed.isActive('blockquote')) return 'blockquote'
  for (let lv = 1; lv <= 6; lv++) {
    if (ed.isActive('heading', { level: lv })) return `h${lv as HeadingLevel}`
  }
  return 'paragraph'
}

const currentParaStyleLabel = computed(() => {
  void editor.value?.state
  const id = currentParaStyleId()
  return PARA_STYLE_ITEMS.find((x) => x.id === id)?.label || '正文'
})

function isParaStyleActive(id: ParaStyleId): boolean {
  return currentParaStyleId() === id
}

function setHeading(level: HeadingLevel | 0) {
  const ed = editor.value
  if (!ed) return
  if (level === 0) {
    // 若在引用中，先升起再设正文（菜单「设为」而非 toggle）
    let c = ed.chain().focus()
    if (ed.isActive('blockquote')) c = c.lift('blockquote')
    c.setParagraph().run()
    return
  }
  let c = ed.chain().focus()
  if (ed.isActive('blockquote')) c = c.lift('blockquote')
  // 使用 setHeading：从菜单点选即为「设为该样式」，避免再次点击把自己关掉
  c.setHeading({ level }).run()
}

function applyParaStyle(id: ParaStyleId) {
  const ed = editor.value
  if (!ed) return
  if (id === 'paragraph') {
    setHeading(0)
  } else if (id === 'blockquote') {
    if (ed.isActive('blockquote')) {
      headingOpen.value = false
      return
    }
    let c = ed.chain().focus()
    if (ed.isActive('heading')) c = c.setParagraph()
    c.setBlockquote().run()
  } else {
    const lv = Number(id.slice(1)) as HeadingLevel
    setHeading(lv)
  }
  headingOpen.value = false
}

function openHeadingMenu() {
  markToolbarMenuOpening()
  closeColorMenus()
  closeHighlightMenus()
  closeFontMenus()
  listOpen.value = false
  formOpen.value = false
  templateOpen.value = false
  alignOpen.value = false
  const next = !headingOpen.value
  headingOpen.value = next
  if (next) {
    const cur = currentParaStyleId()
    const idx = PARA_STYLE_ITEMS.findIndex((x) => x.id === cur)
    headingFocusIndex.value = idx >= 0 ? idx : 0
    nextTick(() => focusHeadingMenuItem(headingFocusIndex.value))
  }
}

function focusHeadingMenuItem(index: number) {
  const root = floatMenuEls.get('heading') || document.querySelector('[data-rte-float-key="heading"]')
  if (!(root instanceof HTMLElement)) return
  const buttons = root.querySelectorAll<HTMLElement>('[data-para-style]')
  const btn = buttons[index]
  btn?.focus?.()
}

function onHeadingMenuKeydown(event: KeyboardEvent) {
  const len = PARA_STYLE_ITEMS.length
  if (event.key === 'Escape') {
    event.preventDefault()
    headingOpen.value = false
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    headingFocusIndex.value = (headingFocusIndex.value + 1) % len
    focusHeadingMenuItem(headingFocusIndex.value)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    headingFocusIndex.value = (headingFocusIndex.value - 1 + len) % len
    focusHeadingMenuItem(headingFocusIndex.value)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    headingFocusIndex.value = 0
    focusHeadingMenuItem(0)
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    headingFocusIndex.value = len - 1
    focusHeadingMenuItem(len - 1)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const item = PARA_STYLE_ITEMS[headingFocusIndex.value]
    if (item) applyParaStyle(item.id)
  }
}
function toggleBold() {
  chain()?.toggleBold().run()
}
function toggleItalic() {
  chain()?.toggleItalic().run()
}
function toggleUnderline() {
  chain()?.toggleUnderline().run()
}
function toggleStrike() {
  chain()?.toggleStrike().run()
}
function toggleSubscript() {
  chain()?.toggleSubscript().run()
}
function toggleSuperscript() {
  chain()?.toggleSuperscript().run()
}
function toggleCode() {
  chain()?.toggleCode().run()
}
function toggleHighlight() {
  chain()?.toggleHighlight().run()
}
function setHighlightColor(color: string) {
  if (!color) {
    chain()?.unsetHighlight().run()
    return
  }
  chain()?.setHighlight({ color }).run()
}
function setColor(color: string) {
  if (!color) {
    chain()?.unsetColor().run()
    return
  }
  chain()?.setColor(color).run()
}
function applyTextColor(color: string) {
  setColor(color)
  colorOpen.value = false
  moreColorOpen.value = false
  moreOpen.value = false
  const name =
    WORD_STANDARD_COLOR_ITEMS.find((x) => x.color.toLowerCase() === (color || '').toLowerCase())
      ?.label || color || '自动'
  announceRte(color ? `已应用文字颜色：${name}` : '已恢复自动文字颜色')
}
function applyHighlightColor(color: string) {
  setHighlightColor(color)
  highlightOpen.value = false
  moreHighlightOpen.value = false
  moreOpen.value = false
  customHighlightOpen.value = false
  announceRte(color ? `已应用高亮：${highlightColorLabel(color)}` : '已清除高亮')
}
function currentTextColor(): string {
  const ed = editor.value
  if (!ed) return ''
  const c = ed.getAttributes('textStyle')?.color
  return typeof c === 'string' ? c.toLowerCase() : ''
}
function currentHighlightColor(): string {
  const ed = editor.value
  if (!ed) return ''
  const attrs = ed.getAttributes('highlight')
  if (!attrs || !attrs.color) {
    return ed.isActive('highlight') ? '__default__' : ''
  }
  return String(attrs.color).toLowerCase()
}
function colorsEqual(a: string, b: string) {
  return (a || '').toLowerCase() === (b || '').toLowerCase()
}
function setAlign(align: 'left' | 'center' | 'right' | 'justify') {
  chain()?.setTextAlign(align).run()
}
function toggleBulletList() {
  chain()?.toggleBulletList().run()
}
function toggleOrderedList() {
  chain()?.toggleOrderedList().run()
}
function toggleTaskList() {
  chain()?.toggleTaskList().run()
}

/** 字号 / 字体 / 行距（依赖 TextStyle + FontSize/FontFamily/LineHeight） */
const FONT_SIZE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '默认', value: '' },
  { label: '12px', value: '12px' },
  { label: '13px', value: '13px' },
  { label: '14px', value: '14px' },
  { label: '15px', value: '15px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
  { label: '28px', value: '28px' },
  { label: '32px', value: '32px' },
  { label: '36px', value: '36px' },
]
const FONT_FAMILY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '默认字体', value: '' },
  { label: '系统默认', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: '苹方 / 微软雅黑', value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: '宋体', value: '"Songti SC", SimSun, serif' },
  { label: '黑体', value: '"Heiti SC", SimHei, sans-serif' },
  { label: '楷体', value: '"Kaiti SC", KaiTi, serif' },
  { label: '仿宋', value: '"STFangsong", FangSong, serif' },
  { label: '等宽', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: '衬线', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
]
const LINE_HEIGHT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '默认行高', value: '' },
  { label: '单倍行距', value: '1' },
  { label: '1.15 倍', value: '1.15' },
  { label: '1.5 倍', value: '1.5' },
  { label: '1.75 倍', value: '1.75' },
  { label: '双倍行距', value: '2' },
  { label: '2.5 倍', value: '2.5' },
  { label: '三倍行距', value: '3' },
]

function currentFontSize(): string {
  const v = editor.value?.getAttributes('textStyle')?.fontSize
  return typeof v === 'string' ? v : ''
}
function currentFontFamily(): string {
  const v = editor.value?.getAttributes('textStyle')?.fontFamily
  return typeof v === 'string' ? v : ''
}
function currentLineHeight(): string {
  const v = editor.value?.getAttributes('textStyle')?.lineHeight
  return typeof v === 'string' ? v : ''
}
function applyFontSize(size: string) {
  if (!size) chain()?.unsetFontSize().run()
  else chain()?.setFontSize(size).run()
  fontSizeOpen.value = false
  moreFontSizeOpen.value = false
  moreOpen.value = false
}
function applyFontFamily(family: string) {
  if (!family) chain()?.unsetFontFamily().run()
  else chain()?.setFontFamily(family).run()
  fontFamilyOpen.value = false
  moreFontFamilyOpen.value = false
  moreOpen.value = false
}
function applyLineHeight(lh: string) {
  if (!lh) chain()?.unsetLineHeight().run()
  else chain()?.setLineHeight(lh).run()
  lineHeightOpen.value = false
  moreLineHeightOpen.value = false
  moreOpen.value = false
}
function closeFontMenus() {
  fontSizeOpen.value = false
  fontFamilyOpen.value = false
  lineHeightOpen.value = false
  moreFontSizeOpen.value = false
  moreFontFamilyOpen.value = false
  moreLineHeightOpen.value = false
}
function toggleBlockquote() {
  chain()?.toggleBlockquote().run()
}

/** —— 块操作：全选当前块 / 复制块 / 上移下移 —— */
function getTopLevelBlockRange(): { from: number; to: number; node: { type: { name: string }; nodeSize: number; copy: (c?: unknown) => unknown } } | null {
  const ed = editor.value
  if (!ed) return null
  const { $from } = ed.state.selection
  if ($from.depth < 1) return null
  const depth = 1
  const from = $from.before(depth)
  const node = $from.node(depth)
  return { from, to: from + node.nodeSize, node: node as any }
}

function selectCurrentBlock() {
  const ed = editor.value
  const range = getTopLevelBlockRange()
  if (!ed || !range) {
    ElMessage.warning('无法选中当前块')
    return
  }
  try {
    ed.view.dispatch(
      ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, range.from)),
    )
    ed.view.focus()
  } catch {
    ed.chain().focus().setTextSelection({ from: range.from, to: range.to }).run()
  }
}

function duplicateCurrentBlock() {
  const ed = editor.value
  const range = getTopLevelBlockRange()
  if (!ed || !range) {
    ElMessage.warning('无法复制当前块')
    return
  }
  const copy = range.node.copy((range.node as any).content)
  const tr = ed.state.tr.insert(range.to, copy as any)
  ed.view.dispatch(tr.scrollIntoView())
  ed.view.focus()
  ElMessage.success('已复制当前块')
}

function moveCurrentBlock(dir: -1 | 1) {
  const ed = editor.value
  if (!ed) return
  const { $from } = ed.state.selection
  if ($from.depth < 1) return
  const index = $from.index(0)
  const doc = ed.state.doc
  const targetIndex = index + dir
  if (targetIndex < 0 || targetIndex >= doc.childCount) {
    ElMessage.info(dir < 0 ? '已在最顶部' : '已在最底部')
    return
  }
  const children: ReturnType<typeof doc.child>[] = []
  doc.forEach((child) => {
    children.push(child)
  })
  const [moved] = children.splice(index, 1)
  children.splice(targetIndex, 0, moved)
  const copies = children.map((c) => c.copy(c.content))
  let tr = ed.state.tr
  tr = tr.replaceWith(0, doc.content.size, Fragment.from(copies))
  let selPos = 0
  for (let i = 0; i < targetIndex; i += 1) selPos += children[i].nodeSize
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, selPos)).scrollIntoView()
  } catch {
    /* ignore */
  }
  ed.view.dispatch(tr)
  ed.view.focus()
}

/** 插入纯文本日期 / 日期时间 */
function insertPlainDate() {
  const s = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  chain()?.insertContent(s).run()
}
function insertPlainDateTime() {
  const s = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  chain()?.insertContent(s).run()
}

/** 列表嵌套层级（listItem / taskItem 层数） */
function currentListDepth(): number {
  const ed = editor.value
  if (!ed) return 0
  const { $from } = ed.state.selection
  let d = 0
  for (let i = $from.depth; i > 0; i -= 1) {
    const name = $from.node(i).type.name
    if (name === 'listItem' || name === 'taskItem') d += 1
  }
  return d
}

const listDepthLabel = computed(() => {
  void editor.value?.state.selection
  const d = currentListDepth()
  return d > 0 ? `当前层级 ${d}` : ''
})

/** —— 图片对齐 / 题注 —— */
const imageBubbleCaption = ref('')
const IMAGE_ALIGN_OPTIONS: Array<{ label: string; value: '' | 'left' | 'center' | 'right' }> = [
  { label: '默认', value: '' },
  { label: '左浮', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右浮', value: 'right' },
]

function isImageNodeSelected(): boolean {
  const ed = editor.value
  if (!ed) return false
  const sel = ed.state.selection
  return sel instanceof NodeSelection && sel.node.type.name === 'image'
}

function syncImageBubbleCaption() {
  const ed = editor.value
  if (!ed || !isImageNodeSelected()) {
    imageBubbleCaption.value = ''
    return
  }
  const cap = ed.getAttributes('image')?.caption
  imageBubbleCaption.value = typeof cap === 'string' ? cap : ''
}

function setImageAlign(align: '' | 'left' | 'center' | 'right') {
  const ed = editor.value
  if (!ed || !isImageNodeSelected()) return
  ed.chain()
    .focus()
    .updateAttributes('image', { align: align || null })
    .run()
}

function applyImageCaption() {
  const ed = editor.value
  if (!ed || !isImageNodeSelected()) return
  const caption = imageBubbleCaption.value.trim()
  ed.chain()
    .focus()
    .updateAttributes('image', { caption: caption || null })
    .run()
}

function imageBubbleShouldShow(payload: {
  editor: { isDestroyed?: boolean; isEditable?: boolean; state?: { selection: unknown } }
}): boolean {
  if (viewMode.value !== 'edit') return false
  const ed = payload?.editor
  if (!ed || ed.isDestroyed || ed.isEditable === false) return false
  const sel = ed.state?.selection
  return !!(sel instanceof NodeSelection && (sel as NodeSelection).node.type.name === 'image')
}

/** —— 分割线样式 —— */
const hrOpen = ref(false)
const blockOpsOpen = ref(false)
const insertDateOpen = ref(false)
function insertHrVariant(variant: RteHrVariant) {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().insertContent({ type: 'horizontalRule', attrs: { variant } }).run()
  hrOpen.value = false
  moreOpen.value = false
}

/** —— 表格单元格背景 / 边框 —— */
function setTableCellBg(color: string) {
  const ed = editor.value
  if (!ed || !isInTable()) return
  const value = color || null
  ed.chain().focus().setCellAttribute('backgroundColor', value).run()
}
function setTableCellBorderColor(color: string) {
  const ed = editor.value
  if (!ed || !isInTable()) return
  ed.chain().focus().setCellAttribute('borderColor', color || null).run()
}
function setTableCellBorderStyle(style: string) {
  const ed = editor.value
  if (!ed || !isInTable()) return
  ed.chain().focus().setCellAttribute('borderStyle', style || null).run()
}

async function copyCurrentLinkUrl() {
  const ed = editor.value
  const hrefFromDialog = linkDialogOpen.value ? linkHref.value.trim() : ''
  if (!hrefFromDialog && (!ed || !ed.isActive('link'))) return
  const href = hrefFromDialog || ((ed?.getAttributes('link').href as string) || '')
  if (!href) {
    ElMessage.warning('当前链接无地址')
    return
  }
  try {
    await navigator.clipboard.writeText(href)
    ElMessage.success('已复制链接地址')
  } catch {
    ElMessage.error('复制失败')
  }
}

function toggleCodeBlock() {
  chain()?.toggleCodeBlock().run()
}

/** 代码块语言（lowlight）；仅在 codeBlock 内有效 */
const CODE_LANG_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '纯文本', value: 'plaintext' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JSON', value: 'json' },
  { label: 'HTML', value: 'xml' },
  { label: 'CSS', value: 'css' },
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'SQL', value: 'sql' },
  { label: 'Bash', value: 'bash' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
].filter((o) => o.value === 'plaintext' || RTE_CODE_LANGUAGES.includes(o.value))

function currentCodeLanguage(): string {
  const ed = editor.value
  if (!ed || !ed.isActive('codeBlock')) return ''
  const lang = ed.getAttributes('codeBlock')?.language
  return typeof lang === 'string' && lang ? lang : 'plaintext'
}

function setCodeLanguage(lang: string) {
  const ed = editor.value
  if (!ed || !ed.isActive('codeBlock')) return
  const next = lang || 'plaintext'
  ed.chain().focus().updateAttributes('codeBlock', { language: next }).run()
}

const codeLangOpen = ref(false)

function codeLanguageLabel(lang: string): string {
  const hit = CODE_LANG_OPTIONS.find((o) => o.value === lang)
  return hit?.label || lang || '纯文本'
}

function applyCodeLanguage(lang: string) {
  setCodeLanguage(lang)
  codeLangOpen.value = false
  announceRte(`代码语言：${codeLanguageLabel(lang)}`)
}

async function copyActiveCodeBlock() {
  const ed = editor.value
  if (!ed || !ed.isActive('codeBlock')) {
    ElMessage.warning('请先将光标放在代码块内')
    return
  }
  const { $from } = ed.state.selection
  let depth = $from.depth
  while (depth > 0 && $from.node(depth).type.name !== 'codeBlock') depth -= 1
  const node = depth > 0 ? $from.node(depth) : null
  const text = node?.textContent ?? ''
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制代码')
  } catch {
    ElMessage.error('复制失败，请检查剪贴板权限')
  }
}

/** —— 插入表单控件 —— */
function insertFormRadio() {
  editor.value?.chain().focus().insertFormRadioGroup().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormCheckbox() {
  editor.value?.chain().focus().insertFormCheckboxGroup().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormText() {
  editor.value?.chain().focus().insertFormTextInput().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormSelect() {
  editor.value?.chain().focus().insertFormSelect().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormTextarea() {
  editor.value?.chain().focus().insertFormTextarea().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormNumber() {
  editor.value?.chain().focus().insertFormNumberInput().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormDate() {
  editor.value?.chain().focus().insertFormDateInput({ kind: 'date' }).run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormDateTime() {
  editor.value?.chain().focus().insertFormDateInput({ kind: 'datetime' }).run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}
function insertFormSwitch() {
  editor.value?.chain().focus().insertFormSwitch().run()
  formOpen.value = false
  moreFormOpen.value = false
  moreOpen.value = false
}

/** Slash「/」选中后执行（range 已由 suggestion command 删除） */
function applySlashCommandItem(item: RteSlashItem) {
  const action = item.action
  switch (action.type) {
    case 'heading':
      setHeading(action.level)
      break
    case 'paragraph':
      setHeading(0)
      break
    case 'bulletList':
      toggleBulletList()
      break
    case 'orderedList':
      toggleOrderedList()
      break
    case 'taskList':
      toggleTaskList()
      break
    case 'blockquote':
      toggleBlockquote()
      break
    case 'codeBlock':
      toggleCodeBlock()
      break
    case 'hr':
      insertHrVariant('solid')
      break
    case 'plainDate':
      insertPlainDate()
      break
    case 'plainDateTime':
      insertPlainDateTime()
      break
    case 'table':
      openTableDialog()
      break
    case 'image':
      insertImage()
      break
    case 'video':
      insertVideo()
      break
    case 'link':
      insertLink()
      break
    case 'formula':
      insertFormula()
      break
    case 'attach':
      onAttachment()
      break
    case 'note':
      insertNote()
      break
    case 'bookmark':
      insertBookmark()
      break
    case 'toggleBlock':
      insertToggleBlock()
      break
    case 'audio':
      insertAudioBlock()
      break
    case 'linkCard':
      insertLinkCardBlock()
      break
    case 'footnote':
      insertFootnoteAtCursor()
      break
    case 'qrcode':
      void insertQrCode()
      break
    case 'timeline':
      insertTimelineBlock()
      break
    case 'statusChip':
      void insertStatusChipBlock()
      break
    case 'progressBar':
      void insertProgressBarBlock()
      break
    case 'tabsBlock':
      void insertTabsBlockAtCursor()
      break
    case 'mermaid':
      void insertMermaidAtCursor()
      break
    case 'ruby':
      void insertRubyAnnotation()
      break
    case 'xref':
      openXrefDialog()
      break
    case 'snippet':
      openSnippetDialog()
      break
    case 'callout':
      insertCallout(action.variant)
      break
    case 'form':
      switch (action.kind) {
        case 'radio':
          insertFormRadio()
          break
        case 'checkbox':
          insertFormCheckbox()
          break
        case 'text':
          insertFormText()
          break
        case 'textarea':
          insertFormTextarea()
          break
        case 'number':
          insertFormNumber()
          break
        case 'select':
          insertFormSelect()
          break
        case 'date':
          insertFormDate()
          break
        case 'datetime':
          insertFormDateTime()
          break
        case 'switch':
          insertFormSwitch()
          break
      }
      break
    case 'template':
      insertDocTemplate(action.id)
      break
  }
}

function closeTemplateMenus() {
  templateOpen.value = false
  moreTemplateOpen.value = false
  moreOpen.value = false
  formOpen.value = false
}

/**
 * 插入内置文档模板。
 * 根因修复：表单原子块插入后，TipTap setContent 不校正选区 / insertContent 的
 * selectionToInsertionEnd(bias=-1) 会落成 NodeSelection 在 form* 上；
 * 随后击键会整块替换该表单（内容异常），属性面板也会误弹出。
 * 另：父级 syncItemsFromHtml 若丢掉尾部空 <p>，回写后文末再次落在 form* 上——
 * itemsHtml 已保留「有内容后的空段落」；此处再强制 focusTextCaretAtEnd。
 * 策略：统一 JSON 块数组；保证末尾可编辑段落；插入后文本选区在文末。
 */
function insertDocTemplate(id: string) {
  const ed = editor.value
  const tpl = getRteDocTemplate(id)
  if (!ed || !tpl) return
  const built = sanitizeRteJsonNodes(tpl.build())
  if (!built.length) return
  // 末尾补空段落，确保光标有可输入落点（即使 schema/插件未自动补）
  const last = built[built.length - 1]
  const blocks =
    last?.type === 'paragraph' ? built : [...built, { type: 'paragraph' as const }]

  // 先关菜单，避免插入时焦点/mouseleave 与菜单开关竞态
  closeTemplateMenus()

  try {
    let ok = false
    if (ed.isEmpty) {
      // 传块数组（Fragment），避免 doc 包一层依赖 PM Fitter 解包
      ok = ed.chain().focus().setContent(blocks).run()
    } else {
      ok = ed.chain().focus().insertContent(blocks).run()
      // 约束父级（如表格单元格）可能拒绝块级表单：回退到文末插入
      if (!ok) {
        ok = ed.chain().focus('end').insertContent(blocks).run()
      }
    }
    if (!ok) {
      // 最后手段：整篇 JSON 合并（仍走 schema.nodeFromJSON，不走 HTML 以免丢 data-*）
      const prev = ed.getJSON()
      const prevBlocks = Array.isArray(prev.content) ? prev.content : []
      const merged = ed.isEmpty ? blocks : [...prevBlocks, ...blocks]
      ok = ed.chain().setContent(merged).run()
    }
    // 不依赖 chain 内 focus('end')：显式落到文末 TextSelection
    focusTextCaretAtEnd(ed)
    if (!ok) {
      console.warn('[RTE] insertDocTemplate: command returned false', id)
    }
  } catch (err) {
    console.error('[RTE] insertDocTemplate failed', id, err)
  }

  // 与 onUpdate 对齐，避免父级 items 往返回写再整篇 setContent 打乱选区
  lastEmittedHtmlNorm = normalizeHtml(ed.getHTML())
  // 父级 sync 一拍后 dual-assert，防止回声 setContent 再次卡在 form NodeSelection
  void nextTick(() => {
    const live = editor.value
    if (!live || live.isDestroyed) return
    focusTextCaretAtEnd(live)
    lastEmittedHtmlNorm = normalizeHtml(live.getHTML())
  })
}

/** —— 表单属性检查器（选中表单原子时右侧面板） —— */
const formInspectorPinned = ref(false)
/** 用户点关闭后暂不自动弹出，直到选区离开该节点 */
const formInspectorDismissedPos = ref<number | null>(null)
const selectedFormPos = ref<number | null>(null)
const selectedFormType = ref<FormNodeName | null>(null)
const formSelectionTick = ref(0)
const inspectorInteracting = ref(false)

function syncSelectedFormFromEditor(ed?: {
  state: {
    selection: unknown
    doc: {
      nodeAt: (
        pos: number,
      ) => { type: { name: string }; attrs: Record<string, unknown> } | null
    }
  }
} | null) {
  const editorInst = ed ?? editor.value
  if (!editorInst) {
    if (!inspectorInteracting.value) {
      selectedFormPos.value = null
      selectedFormType.value = null
      formInspectorPinned.value = false
    }
    return
  }
  const sel = editorInst.state.selection
  if (sel instanceof NodeSelection && isFormNodeName(sel.node.type.name)) {
    selectedFormPos.value = sel.from
    selectedFormType.value = sel.node.type.name
    if (formInspectorDismissedPos.value === sel.from) {
      formInspectorPinned.value = false
      formSelectionTick.value += 1
      return
    }
    formInspectorDismissedPos.value = null
    formInspectorPinned.value = true
    formSelectionTick.value += 1
    return
  }
  // 选区已离开表单节点：允许下次再自动打开
  formInspectorDismissedPos.value = null
  // 属性面板内操作时编辑器可能短暂失焦：若节点仍在，保持面板
  if (
    inspectorInteracting.value &&
    formInspectorPinned.value &&
    selectedFormPos.value != null
  ) {
    const node = editorInst.state.doc.nodeAt(selectedFormPos.value)
    if (node && isFormNodeName(node.type.name)) {
      selectedFormType.value = node.type.name
      formSelectionTick.value += 1
      return
    }
  }
  selectedFormPos.value = null
  selectedFormType.value = null
  formInspectorPinned.value = false
  formSelectionTick.value += 1
}

const selectedFormAttrs = computed(() => {
  void formSelectionTick.value
  const ed = editor.value
  const pos = selectedFormPos.value
  const typ = selectedFormType.value
  if (!ed || pos == null || !typ) return null
  const node = ed.state.doc.nodeAt(pos)
  if (!node || node.type.name !== typ) return null
  return { ...node.attrs } as Record<string, unknown>
})

/** 最大化浮层三种视图：编辑 / 预览 / 源码 */
type RteViewMode = 'edit' | 'preview' | 'source'
const VIEW_MODE_OPTIONS: { id: RteViewMode; label: string; icon: string }[] = [
  { id: 'edit', label: '编辑', icon: '✎' },
  { id: 'preview', label: '预览', icon: '◎' },
  { id: 'source', label: '源码', icon: '</>' },
]
const viewMode = ref<RteViewMode>('edit')
const sourceHtml = ref('')
const sourceDirty = ref(false)

function getLiveEditorHtml(): string {
  const ed = editor.value
  if (!ed) return props.modelValue || '<p></p>'
  return ed.getHTML()
}

/** 将源码写回 TipTap，并同步父级 modelValue（与 onUpdate 对齐） */
function applySourceHtmlToEditor(raw: string, opts?: { focus?: boolean }) {
  const ed = editor.value
  if (!ed || ed.isDestroyed) return false
  const next = toEditorContent(raw)
  try {
    ed.commands.setContent(next, { emitUpdate: false })
  } catch (err) {
    console.warn('[RTE] applySourceHtmlToEditor setContent failed', err)
    return false
  }
  const html = ed.getHTML()
  lastEmittedHtmlNorm = normalizeHtml(html)
  emit('update:modelValue', html)
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
  const ed = editor.value
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
  if (isImageNodeSelected()) return false
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
    const ed = editor.value
    if (ed && !ed.isDestroyed) applyFormShowIfVisibility(ed)
  })

  if (next !== 'edit') {
    // 预览/源码不展示表单属性面板
    formInspectorPinned.value = false
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

onBeforeUnmount(() => {
  if (viewMode.value === 'source') {
    applySourceHtmlToEditor(sourceHtml.value, { focus: false })
  } else if (editor.value && !editor.value.isDestroyed) {
    scheduleHtmlEmit(editor.value, true)
  }
  if (htmlEmitTimer != null) {
    clearTimeout(htmlEmitTimer)
    htmlEmitTimer = null
  }
  document.removeEventListener('pointerdown', onDocPointerDownForMenus, true)
  window.removeEventListener('resize', repositionSlashMenu)
  window.removeEventListener('scroll', repositionSlashMenu, true)
  window.removeEventListener('resize', repositionMentionMenu)
  window.removeEventListener('scroll', repositionMentionMenu, true)
  for (const t of menuCloseTimers.values()) clearTimeout(t)
  menuCloseTimers.clear()
  floatMenuEls.clear()
  floatAnchors.clear()
  if (editor.value && !editor.value.isDestroyed) editor.value.destroy()
})

const showFormInspector = computed(() => {
  // 最大化浮层（expanded）下与工具同排显示（紧跟导入）；紧凑单元格不挤入
  // 仅「编辑」模式展示表单属性面板
  return Boolean(
    props.expanded &&
      viewMode.value === 'edit' &&
      formInspectorPinned.value &&
      selectedFormType.value &&
      selectedFormAttrs.value,
  )
})

function applySelectedFormPatch(patch: Record<string, unknown>) {
  const ed = editor.value
  const pos = selectedFormPos.value
  const typ = selectedFormType.value
  if (!ed || pos == null || !typ) return
  const node = ed.state.doc.nodeAt(pos)
  if (!node || node.type.name !== typ) return
  const nextAttrs = { ...node.attrs, ...patch }
  const captured: CapturedFormSel = {
    type: typ,
    name: String(nextAttrs.name ?? node.attrs.name ?? ''),
    pos,
  }

  // 面板交互中：挡住 selection sync 清面板；并撑过父级 modelValue 回写
  inspectorInteracting.value = true
  let tr = ed.state.tr.setNodeMarkup(pos, undefined, nextAttrs)
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, pos))
  } catch {
    /* 位置无效时忽略重选 */
  }
  tr.setMeta('addToHistory', true)
  ed.view.dispatch(tr)
  // 标记刚 emit 的内容，避免紧随其后的 props.modelValue watch 整篇 setContent
  lastEmittedHtmlNorm = normalizeHtml(ed.getHTML())
  formSelectionTick.value += 1

  const reassert = () => {
    const live = editor.value
    if (!live) return
    restoreFormNodeSelection(live, captured)
  }
  reassert()
  queueMicrotask(reassert)
  void nextTick(() => {
    reassert()
    requestAnimationFrame(() => {
      reassert()
      inspectorInteracting.value = false
    })
  })
}

function closeFormInspector() {
  formInspectorDismissedPos.value = selectedFormPos.value
  formInspectorPinned.value = false
  inspectorInteracting.value = false
  formSelectionTick.value += 1
}

function onFormInspectorMouseDown(_event: MouseEvent) {
  inspectorInteracting.value = true
}

function onFormInspectorMouseUp() {
  // 下一帧再允许 selection sync 清面板，避免输入框抢焦点时闪断
  requestAnimationFrame(() => {
    inspectorInteracting.value = false
  })
}



/** —— 查找 / 替换 —— */
const findDialogOpen = ref(false)
const findQuery = ref('')
const findReplaceText = ref('')
const findCaseSensitive = ref(false)
const findWholeWord = ref(false)
const findMatches = ref<RteFindMatch[]>([])
const findMatchIndex = ref(-1)

function findOpts() {
  return {
    caseSensitive: findCaseSensitive.value,
    wholeWord: findWholeWord.value,
  }
}

function refreshFindMatches(selectNext = false) {
  const ed = editor.value
  if (!ed) {
    findMatches.value = []
    findMatchIndex.value = -1
    return
  }
  const matches = collectFindMatches(ed.state.doc, findQuery.value, findOpts())
  findMatches.value = matches
  if (!matches.length) {
    findMatchIndex.value = -1
    return
  }
  if (selectNext || findMatchIndex.value < 0 || findMatchIndex.value >= matches.length) {
    const fromPos = ed.state.selection.from
    const idx = pickNextMatchIndex(matches, fromPos, 1)
    findMatchIndex.value = idx
    if (idx >= 0) selectFindMatch(ed, matches[idx])
  } else {
    selectFindMatch(ed, matches[findMatchIndex.value])
  }
}

function openFindDialog() {
  findDialogOpen.value = true
  moreOpen.value = false
  // 若有选区且选区较短，预填查找词
  const ed = editor.value
  if (ed) {
    const { from, to, empty } = ed.state.selection
    if (!empty && to - from <= 80) {
      const t = ed.state.doc.textBetween(from, to, ' ')
      if (t && !findQuery.value) findQuery.value = t
    }
  }
  nextTick(() => {
    const el = document.querySelector('.rte-find-query') as HTMLInputElement | null
    el?.focus()
    el?.select()
    refreshFindMatches(true)
  })
}

function closeFindDialog() {
  findDialogOpen.value = false
}

function onFindQueryInput() {
  refreshFindMatches(true)
}

function findGo(direction: 1 | -1) {
  const ed = editor.value
  const matches = findMatches.value
  if (!ed || !matches.length) {
    refreshFindMatches(true)
    return
  }
  let idx = findMatchIndex.value
  if (idx < 0) {
    idx = pickNextMatchIndex(matches, ed.state.selection.from, direction)
  } else {
    idx = (idx + direction + matches.length) % matches.length
  }
  findMatchIndex.value = idx
  selectFindMatch(ed, matches[idx])
}

function doReplaceOne() {
  const ed = editor.value
  const matches = findMatches.value
  const idx = findMatchIndex.value
  if (!ed || idx < 0 || !matches[idx]) {
    ElMessage.info('没有可替换的匹配')
    return
  }
  replaceFindMatch(ed, matches[idx], findReplaceText.value)
  // 替换后重新收集，并跳到下一处
  const nextFrom = matches[idx].from + findReplaceText.value.length
  const nextMatches = collectFindMatches(ed.state.doc, findQuery.value, findOpts())
  findMatches.value = nextMatches
  if (!nextMatches.length) {
    findMatchIndex.value = -1
    ElMessage.success('已替换，无更多匹配')
    return
  }
  const ni = pickNextMatchIndex(nextMatches, nextFrom, 1)
  findMatchIndex.value = ni
  if (ni >= 0) selectFindMatch(ed, nextMatches[ni])
}

function doReplaceAll() {
  const ed = editor.value
  if (!ed) return
  const matches = collectFindMatches(ed.state.doc, findQuery.value, findOpts())
  if (!matches.length) {
    ElMessage.info('没有匹配项')
    findMatches.value = []
    findMatchIndex.value = -1
    return
  }
  const n = replaceAllFindMatches(ed, matches, findReplaceText.value)
  findMatches.value = []
  findMatchIndex.value = -1
  ElMessage.success(`已全部替换 ${n} 处`)
}

const findStatusText = computed(() => {
  const q = findQuery.value
  if (!q) return '输入要查找的内容'
  const total = findMatches.value.length
  if (!total) return '共 0 处'
  const cur = findMatchIndex.value >= 0 ? findMatchIndex.value + 1 : 0
  return `共 ${total} 处 · 第 ${cur} 处`
})

/** —— 插入链接 —— */
const linkDialogOpen = ref(false)
const linkText = ref('')
const linkHref = ref('')
const linkHrefInputRef = ref<HTMLInputElement | null>(null)
const linkPopoverStyle = ref<Record<string, string>>({})
/** 当前是否在编辑已有链接（影响标题与「取消链接」按钮） */
const linkDialogEditing = ref(false)

function positionLinkPopover() {
  const ed = editor.value
  const margin = 8
  const width = 360
  const height = 210
  let left = 24
  let top = 72
  if (ed && !ed.isDestroyed) {
    try {
      const coords = ed.view.coordsAtPos(ed.state.selection.from)
      left = coords.left
      top = coords.bottom + margin
    } catch {
      /* 选区失效时用默认位置 */
    }
  }
  const maxLeft = Math.max(margin, window.innerWidth - width - margin)
  const maxTop = Math.max(margin, window.innerHeight - height - margin)
  if (top > maxTop) top = Math.max(margin, top - height - 28)
  linkPopoverStyle.value = {
    top: `${Math.min(Math.max(margin, top), maxTop)}px`,
    left: `${Math.min(Math.max(margin, left), maxLeft)}px`,
  }
}

function resetLinkDialog() {
  linkText.value = ''
  linkHref.value = ''
  linkDialogEditing.value = false
}

function openLinkDialog() {
  const ed = editor.value
  resetLinkDialog()
  if (ed) {
    const { from, to, empty } = ed.state.selection
    const prev = ed.getAttributes('link').href as string | undefined
    const inLink = ed.isActive('link') && !!prev
    linkDialogEditing.value = inLink
    if (inLink) {
      // 扩展到整段链接文本，便于编辑显示文字
      const attrs = ed.getAttributes('link')
      try {
        ed.chain().focus().extendMarkRange('link').run()
      } catch {
        /* ignore */
      }
      const sel = ed.state.selection
      linkText.value = ed.state.doc.textBetween(sel.from, sel.to, ' ')
      linkHref.value = (attrs.href as string) || prev || ''
    } else if (!empty) {
      linkText.value = ed.state.doc.textBetween(from, to, ' ')
    }
  }
  linkDialogOpen.value = true
  moreOpen.value = false
  void nextTick(() => {
    positionLinkPopover()
    linkHrefInputRef.value?.focus()
    if (linkDialogEditing.value) linkHrefInputRef.value?.select()
  })
}

function closeLinkDialog() {
  linkDialogOpen.value = false
  resetLinkDialog()
}

function insertLink() {
  openLinkDialog()
}

function unlinkSelection() {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().extendMarkRange('link').unsetLink().run()
  closeLinkDialog()
}

function openCurrentLink() {
  const ed = editor.value
  const href =
    (linkDialogOpen.value ? linkHref.value.trim() : '') ||
    (ed?.getAttributes('link').href as string | undefined) ||
    ''
  if (!href) {
    ElMessage.warning('没有可打开的链接')
    return
  }
  if (/^(https?:|mailto:|\/|#)/i.test(href)) {
    window.open(href, '_blank', 'noopener,noreferrer')
  } else {
    ElMessage.warning('链接协议不受支持')
  }
}

function confirmInsertLink() {
  const ed = editor.value
  if (!ed) return
  const href = linkHref.value.trim()
  const text = linkText.value.trim()
  if (!href) {
    ElMessage.warning('请输入链接地址')
    return
  }
  if (!/^https?:\/\//i.test(href) && !href.startsWith('/') && !href.startsWith('#') && !href.startsWith('mailto:')) {
    ElMessage.warning('请输入有效的链接地址（http/https）')
    return
  }
  const { empty } = ed.state.selection
  if (!empty) {
    // 有选区：更新链接；若填写了不同文本则替换选区文本并加链接
    if (text && text !== ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, ' ')) {
      ed.chain()
        .focus()
        .insertContent(`<a href="${href.replace(/"/g, '&quot;')}" class="rte-link">${escapeHtml(text)}</a>`)
        .run()
    } else {
      ed.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
  } else if (text) {
    ed.chain()
      .focus()
      .insertContent(`<a href="${href.replace(/"/g, '&quot;')}" class="rte-link">${escapeHtml(text)}</a>`)
      .run()
  } else {
    ed.chain().focus().setLink({ href }).run()
  }
  closeLinkDialog()
}

/** —— 插入图片 —— */
type ImageDialogTab = 'personal' | 'external'
type ImageCategory = { id: string; name: string }
type StoredImage = {
  id: string
  src: string
  name: string
  categoryId: string
  createdAt: number
}

const IMAGE_CAT_LS = 'metamatrix-rte-image-categories'
const IMAGE_ASSET_LS = 'metamatrix-rte-image-assets'

const imageDialogOpen = ref(false)
const imageDialogTab = ref<ImageDialogTab>('personal')
const imageSidebarKey = ref<'all' | 'uncategorized' | string>('all')
const imageCategories = ref<ImageCategory[]>([])
const imageAssets = ref<StoredImage[]>([])
const imageSelectedIds = ref<Set<string>>(new Set())
const imageSelectAll = ref(false)
const imageExternalUrls = ref('')
const imageFileInputRef = ref<HTMLInputElement | null>(null)
const addingCategory = ref(false)
const newCategoryName = ref('')

function loadImageStore() {
  try {
    const cats = JSON.parse(localStorage.getItem(IMAGE_CAT_LS) || '[]') as ImageCategory[]
    const assets = JSON.parse(localStorage.getItem(IMAGE_ASSET_LS) || '[]') as StoredImage[]
    imageCategories.value = Array.isArray(cats) ? cats : []
    imageAssets.value = Array.isArray(assets) ? assets : []
  } catch {
    imageCategories.value = []
    imageAssets.value = []
  }
}

function saveImageStore() {
  try {
    localStorage.setItem(IMAGE_CAT_LS, JSON.stringify(imageCategories.value))
    localStorage.setItem(IMAGE_ASSET_LS, JSON.stringify(imageAssets.value))
  } catch {
    /* quota / private mode */
  }
}

const filteredImageAssets = computed(() => {
  const key = imageSidebarKey.value
  if (key === 'all') return imageAssets.value
  if (key === 'uncategorized') {
    return imageAssets.value.filter((a) => !a.categoryId || a.categoryId === 'uncategorized')
  }
  return imageAssets.value.filter((a) => a.categoryId === key)
})

function resetImageDialog() {
  imageDialogTab.value = 'personal'
  imageSidebarKey.value = 'all'
  imageSelectedIds.value = new Set()
  imageSelectAll.value = false
  imageExternalUrls.value = ''
  addingCategory.value = false
  newCategoryName.value = ''
}

function openImageDialog() {
  loadImageStore()
  resetImageDialog()
  imageDialogOpen.value = true
  moreOpen.value = false
}

function closeImageDialog() {
  imageDialogOpen.value = false
  resetImageDialog()
}

function insertImage() {
  openImageDialog()
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/** 弹层 z-index 4100+，默认 ElMessage(~3000) 会被挡住，导致「点确定没反应」 */
function rteToast(
  type: 'success' | 'warning' | 'error' | 'info',
  message: string,
) {
  ElMessage({ type, message, zIndex: 5000, duration: 2800 })
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i
const ATTACH_MAX_BYTES = 8 * 1024 * 1024
const VIDEO_MAX_BYTES = 50 * 1024 * 1024

function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true
  return VIDEO_EXT_RE.test(file.name || '')
}

function currentCategoryIdForUpload() {
  const key = imageSidebarKey.value
  if (key === 'all' || key === 'uncategorized') return 'uncategorized'
  return key
}

function toggleImageSelect(id: string) {
  const next = new Set(imageSelectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  imageSelectedIds.value = next
  imageSelectAll.value =
    filteredImageAssets.value.length > 0 &&
    filteredImageAssets.value.every((a) => next.has(a.id))
}

function onImageSelectAllChange() {
  const checked = !imageSelectAll.value
  imageSelectAll.value = checked
  if (checked) {
    imageSelectedIds.value = new Set(filteredImageAssets.value.map((a) => a.id))
  } else {
    imageSelectedIds.value = new Set()
  }
}

function startAddCategory() {
  addingCategory.value = true
  newCategoryName.value = ''
}

function confirmAddCategory() {
  const name = newCategoryName.value.trim()
  if (!name) {
    addingCategory.value = false
    return
  }
  if (imageCategories.value.some((c) => c.name === name)) {
    rteToast('warning', '分类已存在')
    return
  }
  const cat: ImageCategory = { id: uid(), name }
  imageCategories.value = [...imageCategories.value, cat]
  saveImageStore()
  imageSidebarKey.value = cat.id
  addingCategory.value = false
  newCategoryName.value = ''
}

function triggerLocalImagePick() {
  imageFileInputRef.value?.click()
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onLocalImageFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((f) => f.type.startsWith('image/'))
  input.value = ''
  if (!files.length) {
    rteToast('warning', '请选择图片文件')
    return
  }
  const catId = currentCategoryIdForUpload()
  const added: StoredImage[] = []
  for (const file of files) {
    try {
      let src: string
      if (imageCompressOnInsert.value) {
        try {
          const compressed = await compressImageFile(file, { maxEdge: 1600, quality: 0.82 })
          src = compressed.dataUrl
        } catch {
          src = await readFileAsDataURL(file)
        }
      } else {
        src = await readFileAsDataURL(file)
      }
      if (!src) continue
      added.push({
        id: uid(),
        src,
        name: file.name,
        categoryId: catId,
        createdAt: Date.now(),
      })
    } catch {
      /* skip broken file */
    }
  }
  if (!added.length) {
    rteToast('error', '图片读取失败')
    return
  }
  imageAssets.value = [...added, ...imageAssets.value]
  saveImageStore()
  const next = new Set(imageSelectedIds.value)
  added.forEach((a) => next.add(a.id))
  imageSelectedIds.value = next
  // MVP：本地上传后直接插入编辑器
  insertImageSrcs(added.map((a) => a.src))
  closeImageDialog()
  rteToast('success', `已插入 ${added.length} 张图片`)
}

function parseExternalImageUrls(raw: string): string[] {
  const lines = raw
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const urls: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    // also allow space/comma separated on one line
    const parts = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    for (const part of parts) {
      if (!/^https?:\/\//i.test(part)) continue
      if (seen.has(part)) continue
      seen.add(part)
      urls.push(part)
    }
  }
  return urls
}

function insertImageSrcs(srcs: string[]) {
  const ed = editor.value
  if (!ed || !srcs.length) return
  // 多张一次插入：同一段落内并排；默认宽度便于同行展示（仍可拖拽锚点缩放）
  const multi = srcs.length > 1
  const defaultWidth = multi ? Math.max(140, Math.floor(560 / Math.min(srcs.length, 4))) : null
  const nodes = srcs.map((src) => ({
    type: 'image' as const,
    attrs: defaultWidth ? { src, width: defaultWidth } : { src },
  }))
  ed.chain().focus().insertContent(nodes).run()
}

function confirmInsertImages() {
  if (imageDialogTab.value === 'external') {
    const urls = parseExternalImageUrls(imageExternalUrls.value)
    if (!urls.length) {
      rteToast('warning', '请输入至少一个有效的图片 URL（http/https，每行一个）')
      return
    }
    insertImageSrcs(urls)
    closeImageDialog()
    rteToast('success', `已插入 ${urls.length} 张图片`)
    return
  }
  const selected = imageAssets.value.filter((a) => imageSelectedIds.value.has(a.id))
  if (!selected.length) {
    rteToast('warning', '请选择图片，或使用「本地图片上传」')
    return
  }
  insertImageSrcs(selected.map((a) => a.src))
  closeImageDialog()
  rteToast('success', `已插入 ${selected.length} 张图片`)
}

/** —— 插入视频（与图片弹窗同构） —— */
type VideoDialogTab = 'personal' | 'external'
type VideoCategory = { id: string; name: string }
type StoredVideo = {
  id: string
  src: string
  name: string
  categoryId: string
  createdAt: number
}

const VIDEO_CAT_LS = 'metamatrix-rte-video-categories'
const VIDEO_ASSET_LS = 'metamatrix-rte-video-assets'

const videoDialogOpen = ref(false)
const videoDialogTab = ref<VideoDialogTab>('personal')
const videoSidebarKey = ref<'all' | 'uncategorized' | string>('all')
const videoCategories = ref<VideoCategory[]>([])
const videoAssets = ref<StoredVideo[]>([])
const videoSelectedIds = ref<Set<string>>(new Set())
const videoSelectAll = ref(false)
const videoExternalUrls = ref('')
const videoFileInputRef = ref<HTMLInputElement | null>(null)
const videoAddingCategory = ref(false)
const videoNewCategoryName = ref('')

function loadVideoStore() {
  try {
    const cats = JSON.parse(localStorage.getItem(VIDEO_CAT_LS) || '[]') as VideoCategory[]
    const assets = JSON.parse(localStorage.getItem(VIDEO_ASSET_LS) || '[]') as StoredVideo[]
    videoCategories.value = Array.isArray(cats) ? cats : []
    videoAssets.value = Array.isArray(assets) ? assets.filter((a) => !!a.src) : []
  } catch {
    videoCategories.value = []
    videoAssets.value = []
  }
}

function saveVideoStore() {
  try {
    localStorage.setItem(VIDEO_CAT_LS, JSON.stringify(videoCategories.value))
    // blob: 仅会话有效，不落库；http(s) 可持久。DataURL 过大则丢弃 src 以免撑爆配额
    const persistable = videoAssets.value
      .filter((a) => a.src && !a.src.startsWith('blob:'))
      .map((a) =>
        a.src.startsWith('data:') && a.src.length > 400_000
          ? { ...a, src: '' }
          : a,
      )
      .filter((a) => !!a.src)
      .slice(0, 40)
    localStorage.setItem(VIDEO_ASSET_LS, JSON.stringify(persistable))
  } catch {
    try {
      localStorage.setItem(VIDEO_CAT_LS, JSON.stringify(videoCategories.value))
      const light = videoAssets.value
        .filter((a) => /^https?:\/\//i.test(a.src))
        .slice(0, 30)
      localStorage.setItem(VIDEO_ASSET_LS, JSON.stringify(light))
    } catch {
      /* private mode */
    }
  }
}

const filteredVideoAssets = computed(() => {
  const key = videoSidebarKey.value
  if (key === 'all') return videoAssets.value
  if (key === 'uncategorized') {
    return videoAssets.value.filter((a) => !a.categoryId || a.categoryId === 'uncategorized')
  }
  return videoAssets.value.filter((a) => a.categoryId === key)
})

function resetVideoDialog() {
  videoDialogTab.value = 'personal'
  videoSidebarKey.value = 'all'
  videoSelectedIds.value = new Set()
  videoSelectAll.value = false
  videoExternalUrls.value = ''
  videoAddingCategory.value = false
  videoNewCategoryName.value = ''
}

function openVideoDialog() {
  loadVideoStore()
  resetVideoDialog()
  videoDialogOpen.value = true
  moreOpen.value = false
}

function closeVideoDialog() {
  videoDialogOpen.value = false
  resetVideoDialog()
}

function insertVideo() {
  openVideoDialog()
}

function currentVideoCategoryIdForUpload() {
  const key = videoSidebarKey.value
  if (key === 'all' || key === 'uncategorized') return 'uncategorized'
  return key
}

function toggleVideoSelect(id: string) {
  const next = new Set(videoSelectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  videoSelectedIds.value = next
  videoSelectAll.value =
    filteredVideoAssets.value.length > 0 &&
    filteredVideoAssets.value.every((a) => next.has(a.id))
}

function onVideoSelectAllChange() {
  const checked = !videoSelectAll.value
  videoSelectAll.value = checked
  if (checked) {
    videoSelectedIds.value = new Set(filteredVideoAssets.value.map((a) => a.id))
  } else {
    videoSelectedIds.value = new Set()
  }
}

function startAddVideoCategory() {
  videoAddingCategory.value = true
  videoNewCategoryName.value = ''
}

function confirmAddVideoCategory() {
  const name = videoNewCategoryName.value.trim()
  if (!name) {
    videoAddingCategory.value = false
    return
  }
  if (videoCategories.value.some((c) => c.name === name)) {
    rteToast('warning', '分类已存在')
    return
  }
  const cat: VideoCategory = { id: uid(), name }
  videoCategories.value = [...videoCategories.value, cat]
  saveVideoStore()
  videoSidebarKey.value = cat.id
  videoAddingCategory.value = false
  videoNewCategoryName.value = ''
}

function triggerLocalVideoPick() {
  videoFileInputRef.value?.click()
}

async function onLocalVideoFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const rawFiles = Array.from(input.files || [])
  input.value = ''
  const files = rawFiles.filter(isVideoFile)
  if (!files.length) {
    rteToast('warning', '请选择视频文件（mp4 / webm / mov 等）')
    return
  }
  const catId = currentVideoCategoryIdForUpload()
  const added: StoredVideo[] = []
  let skippedSize = 0
  for (const file of files) {
    if (file.size > VIDEO_MAX_BYTES) {
      skippedSize += 1
      rteToast(
        'warning',
        `${file.name} 超过 ${Math.round(VIDEO_MAX_BYTES / (1024 * 1024))}MB，已跳过`,
      )
      continue
    }
    try {
      // 视频用 blob URL：避免 DataURL 撑爆内存 / localStorage，插入仍可用
      const src = URL.createObjectURL(file)
      if (!src) continue
      added.push({
        id: uid(),
        src,
        name: file.name,
        categoryId: catId,
        createdAt: Date.now(),
      })
    } catch {
      /* skip */
    }
  }
  if (!added.length) {
    rteToast(
      'error',
      skippedSize ? '所选视频均超出大小限制' : '视频读取失败，请换 mp4/webm/mov 再试',
    )
    return
  }
  videoAssets.value = [...added, ...videoAssets.value]
  saveVideoStore()
  const next = new Set(videoSelectedIds.value)
  added.forEach((a) => next.add(a.id))
  videoSelectedIds.value = next
  // 与图片一致：本地上传后直接插入并关闭；库保存失败也不影响本次插入
  insertVideoSrcs(added.map((a) => a.src))
  closeVideoDialog()
  rteToast('success', `已插入 ${added.length} 个视频`)
}

function parseExternalVideoUrls(raw: string): string[] {
  const lines = raw
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const urls: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    for (const part of parts) {
      if (!/^https?:\/\//i.test(part)) continue
      if (seen.has(part)) continue
      seen.add(part)
      urls.push(part)
    }
  }
  return urls
}

function insertVideoSrcs(srcs: string[]) {
  const ed = editor.value
  const valid = (srcs || []).map((s) => (s || '').trim()).filter(Boolean)
  if (!ed || !valid.length) return
  // 与 insertImageSrcs 同构：一次 insertContent 多个 inline video 节点
  const multi = valid.length > 1
  const defaultWidth = multi ? Math.max(140, Math.floor(560 / Math.min(valid.length, 4))) : null
  const nodes = valid.map((src) => ({
    type: 'video' as const,
    attrs: defaultWidth
      ? { src, controls: true, width: defaultWidth }
      : { src, controls: true },
  }))
  ed.chain().focus().insertContent(nodes).run()
}

function confirmInsertVideos() {
  if (videoDialogTab.value === 'external') {
    const urls = parseExternalVideoUrls(videoExternalUrls.value)
    if (!urls.length) {
      rteToast('warning', '请输入至少一个有效的视频 URL（http/https，每行一个）')
      return
    }
    insertVideoSrcs(urls)
    closeVideoDialog()
    rteToast('success', `已插入 ${urls.length} 个视频`)
    return
  }
  const selected = videoAssets.value.filter((a) => videoSelectedIds.value.has(a.id))
  if (!selected.length) {
    rteToast('warning', '请选择视频，或使用「本地视频上传」')
    return
  }
  const usable = selected.map((a) => a.src).filter((s) => !!s && String(s).trim())
  if (!usable.length) {
    rteToast('warning', '所选视频缺少文件数据，请重新上传')
    return
  }
  insertVideoSrcs(usable)
  closeVideoDialog()
  rteToast('success', `已插入 ${usable.length} 个视频`)
}

/** —— 公式编辑器 —— */
type FormulaMode = 'inline' | 'display'

const FORMULA_SYMBOL_GROUPS: { title: string; items: { label: string; tex: string }[] }[] = [
  {
    title: '希腊字母',
    items: [
      { label: 'α', tex: '\\alpha' },
      { label: 'β', tex: '\\beta' },
      { label: 'γ', tex: '\\gamma' },
      { label: 'δ', tex: '\\delta' },
      { label: 'Δ', tex: '\\Delta' },
      { label: 'θ', tex: '\\theta' },
      { label: 'λ', tex: '\\lambda' },
      { label: 'μ', tex: '\\mu' },
      { label: 'π', tex: '\\pi' },
      { label: 'σ', tex: '\\sigma' },
      { label: 'φ', tex: '\\phi' },
      { label: 'ω', tex: '\\omega' },
      { label: 'Ω', tex: '\\Omega' },
      { label: 'Σ', tex: '\\Sigma' },
    ],
  },
  {
    title: '运算',
    items: [
      { label: '±', tex: '\\pm' },
      { label: '×', tex: '\\times' },
      { label: '÷', tex: '\\div' },
      { label: '·', tex: '\\cdot' },
      { label: '∑', tex: '\\sum' },
      { label: '∏', tex: '\\prod' },
      { label: '∫', tex: '\\int' },
      { label: '∞', tex: '\\infty' },
      { label: '∂', tex: '\\partial' },
    ],
  },
  {
    title: '关系',
    items: [
      { label: '=', tex: '=' },
      { label: '≠', tex: '\\neq' },
      { label: '≈', tex: '\\approx' },
      { label: '≤', tex: '\\leq' },
      { label: '≥', tex: '\\geq' },
      { label: '∈', tex: '\\in' },
      { label: '⊂', tex: '\\subset' },
      { label: '⊆', tex: '\\subseteq' },
      { label: '∝', tex: '\\propto' },
    ],
  },
  {
    title: '结构',
    items: [
      { label: '√', tex: '\\sqrt{}' },
      { label: '∛', tex: '\\sqrt[3]{}' },
      { label: '( )', tex: '\\left(\\right)' },
      { label: '[ ]', tex: '\\left[\\right]' },
      { label: '{ }', tex: '\\left\\{\\right\\}' },
      { label: 'x²', tex: '^{2}' },
      { label: 'xₙ', tex: '_{n}' },
      { label: 'x̄', tex: '\\bar{x}' },
      { label: 'â', tex: '\\hat{a}' },
      { label: '分数', tex: '\\frac{a}{b}' },
    ],
  },
  {
    title: '箭头',
    items: [
      { label: '→', tex: '\\rightarrow' },
      { label: '←', tex: '\\leftarrow' },
      { label: '⇒', tex: '\\Rightarrow' },
      { label: '⇔', tex: '\\Leftrightarrow' },
      { label: '↦', tex: '\\mapsto' },
      { label: '↑', tex: '\\uparrow' },
      { label: '↓', tex: '\\downarrow' },
    ],
  },
]

const formulaDialogOpen = ref(false)
const formulaMode = ref<FormulaMode>('inline')
const formulaTex = ref('')
const formulaPreviewExpanded = ref(false)
const formulaTexareaRef = ref<HTMLTextAreaElement | null>(null)

const formulaPreviewHtml = computed(() => {
  const tex = formulaTex.value.trim()
  if (!tex) return ''
  return renderKatex(tex, formulaMode.value === 'display')
})

function resetFormulaDialog() {
  formulaMode.value = 'inline'
  formulaTex.value = ''
  formulaPreviewExpanded.value = false
}

function openFormulaDialog() {
  resetFormulaDialog()
  formulaDialogOpen.value = true
  moreOpen.value = false
}

function closeFormulaDialog() {
  formulaDialogOpen.value = false
  resetFormulaDialog()
}

function setFormulaMode(mode: FormulaMode) {
  formulaMode.value = mode
}

function insertFormulaSymbol(tex: string) {
  const el = formulaTexareaRef.value
  const cur = formulaTex.value
  if (!el) {
    formulaTex.value = cur + tex
    return
  }
  const start = el.selectionStart ?? cur.length
  const end = el.selectionEnd ?? cur.length
  formulaTex.value = cur.slice(0, start) + tex + cur.slice(end)
  requestAnimationFrame(() => {
    el.focus()
    const caret = start + tex.length
    // 若插入带 {}，尽量把光标放进第一个括号内
    const brace = tex.indexOf('{')
    if (brace >= 0) {
      const pos = start + brace + 1
      el.setSelectionRange(pos, pos)
    } else {
      el.setSelectionRange(caret, caret)
    }
  })
}

function insertFormula() {
  openFormulaDialog()
}

function confirmInsertFormula() {
  const ed = editor.value
  if (!ed) return
  const tex = formulaTex.value.trim()
  if (!tex) {
    ElMessage.warning('请输入 TeX 公式')
    return
  }
  if (formulaMode.value === 'display') {
    ed.chain().focus().insertMathDisplay({ tex }).run()
  } else {
    ed.chain().focus().insertMathInline({ tex }).run()
  }
  closeFormulaDialog()
}

/** —— 插入表格 —— */
const tableDialogOpen = ref(false)
const tableRows = ref(3)
const tableCols = ref(3)
/** 尺寸网格悬停预览（Word 风格） */
const tableGridHover = ref({ rows: 0, cols: 0 })
const TABLE_GRID_MAX_ROWS = 8
const TABLE_GRID_MAX_COLS = 20

function resetTableDialog() {
  tableRows.value = 3
  tableCols.value = 3
  tableGridHover.value = { rows: 0, cols: 0 }
}

function onTableGridHover(r: number, c: number) {
  tableGridHover.value = { rows: r, cols: c }
  // 悬停即同步行/列数字输入（选择后更改对应数字）
  tableRows.value = clampInt(r, 1, 100)
  tableCols.value = clampInt(c, 1, TABLE_GRID_MAX_COLS)
}

function onTableGridLeave() {
  tableGridHover.value = { rows: 0, cols: 0 }
}

function pickTableGridSize(r: number, c: number) {
  tableRows.value = clampInt(r, 1, 100)
  tableCols.value = clampInt(c, 1, TABLE_GRID_MAX_COLS)
  tableGridHover.value = { rows: r, cols: c }
  confirmInsertTable()
}

function openTableDialog() {
  resetTableDialog()
  tableDialogOpen.value = true
  moreOpen.value = false
  tableMenuOpen.value = false
  tableOpsSheetOpen.value = false
  closeTableCtx()
}

function closeTableDialog() {
  tableDialogOpen.value = false
  resetTableDialog()
}

function clampInt(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, Math.trunc(v)))
}

function onTableRowsInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const n = parseInt(raw, 10)
  tableRows.value = clampInt(Number.isNaN(n) ? 1 : n, 1, 100)
}

function onTableColsInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const n = parseInt(raw, 10)
  tableCols.value = clampInt(Number.isNaN(n) ? 1 : n, 1, TABLE_GRID_MAX_COLS)
}

function stepTableRows(delta: number) {
  tableRows.value = clampInt(tableRows.value + delta, 1, 100)
}

function stepTableCols(delta: number) {
  tableCols.value = clampInt(tableCols.value + delta, 1, TABLE_GRID_MAX_COLS)
}

function confirmInsertTable() {
  const ed = editor.value
  if (!ed) return
  const rows = clampInt(tableRows.value, 1, 100)
  const cols = clampInt(tableCols.value, 1, TABLE_GRID_MAX_COLS)
  tableRows.value = rows
  tableCols.value = cols
  closeAllTableUi()
  // 优先在当前光标插入；失败时落到文末再试（嵌套块/异常选区）
  const opts = { rows, cols, withHeaderRow: true }
  let ok = ed.chain().focus().insertTable(opts).run()
  if (!ok) {
    ok = ed.chain().focus('end').insertTable(opts).run()
  }
  if (!ok) {
    rteToast('warning', '无法插入表格，请将光标放到正文段落后再试')
    return
  }
  closeTableDialog()
}

/** —— 表格内常用操作（合并/拆分/插删行列） —— */
type TableOpItem = {
  key: string
  label: string
  run: () => void
  disabled?: () => boolean
  danger?: boolean
  sepBefore?: boolean
}

function isInTable() {
  return editor.value?.isActive('table') ?? false
}

function canMergeCells() {
  return editor.value?.can().mergeCells() ?? false
}

function canSplitCell() {
  return editor.value?.can().splitCell() ?? false
}

function closeTableMenu() {
  tableMenuOpen.value = false
}

function closeTableOpsSheet() {
  tableOpsSheetOpen.value = false
}

function closeAllTableUi() {
  closeTableMenu()
  closeTableOpsSheet()
  closeTableCtx()
}

function runTableCommand(command: () => boolean) {
  const ed = editor.value
  if (!ed) return
  // 保持 CellSelection：菜单已 @mousedown.prevent，勿额外打乱选区
  command()
  closeAllTableUi()
}

function tableAddRowBefore() {
  runTableCommand(() => editor.value!.chain().focus().addRowBefore().run())
}
function tableAddRowAfter() {
  runTableCommand(() => editor.value!.chain().focus().addRowAfter().run())
}
function tableAddColBefore() {
  runTableCommand(() => editor.value!.chain().focus().addColumnBefore().run())
}
function tableAddColAfter() {
  runTableCommand(() => editor.value!.chain().focus().addColumnAfter().run())
}
function tableDeleteRow() {
  runTableCommand(() => editor.value!.chain().focus().deleteRow().run())
}
function tableDeleteCol() {
  runTableCommand(() => editor.value!.chain().focus().deleteColumn().run())
}
function tableMergeCells() {
  if (!canMergeCells()) return
  runTableCommand(() => editor.value!.chain().focus().mergeCells().run())
}
function tableSplitCell() {
  if (!canSplitCell()) return
  runTableCommand(() => editor.value!.chain().focus().splitCell().run())
}
function tableToggleHeaderRow() {
  runTableCommand(() => editor.value!.chain().focus().toggleHeaderRow().run())
}
function tableToggleHeaderColumn() {
  runTableCommand(() => editor.value!.chain().focus().toggleHeaderColumn().run())
}
function tableDeleteTable() {
  runTableCommand(() => editor.value!.chain().focus().deleteTable().run())
}
function tableClearCellFormat() {
  const ed = editor.value
  if (!ed || !isInTable()) return
  ed.chain()
    .focus()
    .setCellAttribute('backgroundColor', null)
    .setCellAttribute('borderColor', null)
    .setCellAttribute('borderStyle', null)
    .run()
  closeAllTableUi()
  announceRte('已清除单元格格式')
}

const tableOpItems = computed((): TableOpItem[] => {
  void editor.value?.state
  return [
    { key: 'row-before', label: '向上插入行', run: tableAddRowBefore },
    { key: 'row-after', label: '向下插入行', run: tableAddRowAfter },
    { key: 'col-before', label: '向左插入列', run: tableAddColBefore },
    { key: 'col-after', label: '向右插入列', run: tableAddColAfter },
    {
      key: 'del-row',
      label: '删除行',
      run: tableDeleteRow,
      sepBefore: true,
    },
    { key: 'del-col', label: '删除列', run: tableDeleteCol },
    {
      key: 'merge',
      label: '合并单元格',
      run: tableMergeCells,
      disabled: () => !canMergeCells(),
      sepBefore: true,
    },
    {
      key: 'split',
      label: '拆分单元格',
      run: tableSplitCell,
      disabled: () => !canSplitCell(),
    },
    {
      key: 'header',
      label: '切换表头行',
      run: tableToggleHeaderRow,
      sepBefore: true,
    },
    {
      key: 'header-col',
      label: '切换表头列',
      run: tableToggleHeaderColumn,
    },
    {
      key: 'clear-cell',
      label: '清除单元格格式',
      run: tableClearCellFormat,
    },
    {
      key: 'valign-top',
      label: '垂直对齐·顶',
      run: () => applyCellValign('top'),
    },
    {
      key: 'valign-middle',
      label: '垂直对齐·中',
      run: () => applyCellValign('middle'),
    },
    {
      key: 'valign-bottom',
      label: '垂直对齐·底',
      run: () => applyCellValign('bottom'),
    },
    {
      key: 'sort-asc',
      label: '按当前列升序',
      run: () => doSortTable(true),
    },
    {
      key: 'sort-desc',
      label: '按当前列降序',
      run: () => doSortTable(false),
    },
    {
      key: 'sum-row',
      label: '简易合计行',
      run: () => doTableSumRow(),
    },
    {
      key: 'sticky-header',
      label: '表头冻结开关',
      run: () => toggleTableStickyHeader(),
      sepBefore: true,
    },
    {
      key: 'copy-csv',
      label: '复制为 CSV',
      run: () => { void copyCurrentTable('csv') },
      sepBefore: true,
    },
    {
      key: 'copy-tsv',
      label: '复制为 TSV',
      run: () => { void copyCurrentTable('tsv') },
    },
    {
      key: 'row-filter',
      label: '行筛选…',
      run: () => { void promptTableRowFilter() },
    },
    {
      key: 'del-table',
      label: '删除表格',
      run: tableDeleteTable,
      danger: true,
      sepBefore: true,
    },
  ]
})


/**
 * 紧凑「更多」：表外直接开插入弹窗；表内开操作面板。
 * 最大化工具条请用 onTableToolbarButtonClick（表内下拉、表外弹窗）。
 */
function onTableToolClick() {
  moreOpen.value = false
  closeImportMenu()
  closeExportMenu()
  if (isInTable()) {
    tableMenuOpen.value = false
    tableOpsSheetOpen.value = true
    closeTableCtx()
    return
  }
  closeTableMenu()
  openTableDialog()
}

/** 最大化工具栏「表格」按钮：表外一键插入弹窗；表内切换操作下拉 */
function onTableToolbarButtonClick() {
  moreOpen.value = false
  closeImportMenu()
  headingOpen.value = false
  listOpen.value = false
  formOpen.value = false
  colorOpen.value = false
  highlightOpen.value = false
  alignOpen.value = false
  closeFontMenus()
  if (isInTable()) {
    tableMenuOpen.value = !tableMenuOpen.value
    closeTableCtx()
    return
  }
  closeTableMenu()
  openTableDialog()
}

const NOTE_TYPES = [
  { value: '新注释', icon: 'N', label: '新注释' },
  { value: '重要', icon: '!', label: '重要' },
  { value: '待办', icon: '✓', label: '待办' },
] as const

const noteDialogOpen = ref(false)
const noteTypeOpen = ref(false)
const noteType = ref<string>('新注释')
const noteText = ref('')
const noteHref = ref('')

const noteTypeMeta = computed(() => {
  return NOTE_TYPES.find((t) => t.value === noteType.value) ?? NOTE_TYPES[0]
})

function resetNoteDialog() {
  noteType.value = '新注释'
  noteText.value = ''
  noteHref.value = ''
  noteTypeOpen.value = false
}

function openNoteDialog() {
  resetNoteDialog()
  // 若选区已有注释，预填
  const ed = editor.value
  if (ed?.isActive('annotation')) {
    const attrs = ed.getAttributes('annotation') as {
      type?: string
      note?: string
      href?: string
    }
    if (attrs.type) noteType.value = attrs.type
    if (attrs.note) noteText.value = attrs.note
    if (attrs.href) noteHref.value = attrs.href
  } else if (ed) {
    const { from, to } = ed.state.selection
    const selected = ed.state.doc.textBetween(from, to, ' ')
    if (selected.trim()) noteText.value = selected.trim()
  }
  noteDialogOpen.value = true
  moreOpen.value = false
}

function closeNoteDialog() {
  noteDialogOpen.value = false
  noteTypeOpen.value = false
  resetNoteDialog()
}

function selectNoteType(value: string) {
  noteType.value = value
  noteTypeOpen.value = false
}

function insertNote() {
  openNoteDialog()
}

function confirmInsertNote() {
  const ed = editor.value
  if (!ed) return
  const note = noteText.value.trim()
  const href = noteHref.value.trim()
  const type = noteType.value || '新注释'
  if (!note && ed.state.selection.empty) {
    ElMessage.warning('请输入注释文本')
    return
  }

  const attrs = { type, note: note || type, href }

  if (ed.state.selection.empty) {
    // 无选区：插入注释文本并套上标记
    ed.chain()
      .focus()
      .insertContent({
        type: 'text',
        text: note || type,
        marks: [
          {
            type: 'annotation',
            attrs,
          },
        ],
      })
      .run()
  } else {
    ed.chain().focus().setAnnotation(attrs).run()
  }

  noteDialogOpen.value = false
  resetNoteDialog()
}

/** —— 选择附件（单栏：分类素材，无外部链接） —— */
type AttachCategory = { id: string; name: string }
type StoredAttach = {
  id: string
  src: string
  name: string
  mime: string
  size: number
  categoryId: string
  createdAt: number
}

const ATTACH_CAT_LS = 'metamatrix-rte-attach-categories'
const ATTACH_ASSET_LS = 'metamatrix-rte-attach-assets'

const attachDialogOpen = ref(false)
const attachSidebarKey = ref<'all' | 'uncategorized' | string>('all')
const attachCategories = ref<AttachCategory[]>([])
const attachAssets = ref<StoredAttach[]>([])
const attachSelectedIds = ref<Set<string>>(new Set())
const attachSelectAll = ref(false)
const attachFileInputRef = ref<HTMLInputElement | null>(null)
const attachAddingCategory = ref(false)
const attachNewCategoryName = ref('')

function loadAttachStore() {
  try {
    const cats = JSON.parse(localStorage.getItem(ATTACH_CAT_LS) || '[]') as AttachCategory[]
    const assets = JSON.parse(localStorage.getItem(ATTACH_ASSET_LS) || '[]') as StoredAttach[]
    attachCategories.value = Array.isArray(cats) ? cats : []
    attachAssets.value = Array.isArray(assets) ? assets : []
  } catch {
    attachCategories.value = []
    attachAssets.value = []
  }
}

function saveAttachStore() {
  try {
    localStorage.setItem(ATTACH_CAT_LS, JSON.stringify(attachCategories.value))
    const persistable = attachAssets.value
      .filter((a) => a.src && !String(a.src).startsWith('blob:'))
      .map((a) => ({
        ...a,
        src: a.src.startsWith('data:') && a.src.length > 200_000 ? '' : a.src,
      }))
      .filter((a) => !!a.src)
    try {
      localStorage.setItem(ATTACH_ASSET_LS, JSON.stringify(persistable))
    } catch {
      const light = persistable
        .filter((a) => /^https?:\/\//i.test(a.src) || a.src.length < 80_000)
        .slice(0, 40)
      localStorage.setItem(ATTACH_ASSET_LS, JSON.stringify(light))
    }
  } catch {
    /* quota / private mode */
  }
}

const filteredAttachAssets = computed(() => {
  const key = attachSidebarKey.value
  if (key === 'all') return attachAssets.value
  if (key === 'uncategorized') {
    return attachAssets.value.filter((a) => !a.categoryId || a.categoryId === 'uncategorized')
  }
  return attachAssets.value.filter((a) => a.categoryId === key)
})

function resetAttachDialog() {
  attachSidebarKey.value = 'all'
  attachSelectedIds.value = new Set()
  attachSelectAll.value = false
  attachAddingCategory.value = false
  attachNewCategoryName.value = ''
}

function openAttachDialog() {
  loadAttachStore()
  resetAttachDialog()
  attachDialogOpen.value = true
  moreOpen.value = false
}

function closeAttachDialog() {
  attachDialogOpen.value = false
  resetAttachDialog()
}

function onAttachment() {
  openAttachDialog()
}

function currentAttachCategoryId() {
  const key = attachSidebarKey.value
  if (key === 'all' || key === 'uncategorized') return 'uncategorized'
  return key
}

function toggleAttachSelect(id: string) {
  const next = new Set(attachSelectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  attachSelectedIds.value = next
  attachSelectAll.value =
    filteredAttachAssets.value.length > 0 &&
    filteredAttachAssets.value.every((a) => next.has(a.id))
}

function onAttachSelectAllChange() {
  const checked = !attachSelectAll.value
  attachSelectAll.value = checked
  if (checked) {
    attachSelectedIds.value = new Set(filteredAttachAssets.value.map((a) => a.id))
  } else {
    attachSelectedIds.value = new Set()
  }
}

function startAddAttachCategory() {
  attachAddingCategory.value = true
  attachNewCategoryName.value = ''
}

function confirmAddAttachCategory() {
  const name = attachNewCategoryName.value.trim()
  if (!name) {
    attachAddingCategory.value = false
    return
  }
  if (attachCategories.value.some((c) => c.name === name)) {
    rteToast('warning', '分类已存在')
    return
  }
  const cat: AttachCategory = { id: uid(), name }
  attachCategories.value = [...attachCategories.value, cat]
  saveAttachStore()
  attachSidebarKey.value = cat.id
  attachAddingCategory.value = false
  attachNewCategoryName.value = ''
}

function triggerLocalAttachPick() {
  attachFileInputRef.value?.click()
}

function formatAttachSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function attachExtIcon(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['pdf'].includes(ext)) return 'PDF'
  if (['doc', 'docx'].includes(ext)) return 'DOC'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'XLS'
  if (['ppt', 'pptx'].includes(ext)) return 'PPT'
  if (['zip', 'rar', '7z'].includes(ext)) return 'ZIP'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'IMG'
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'VID'
  if (['mp3', 'wav', 'aac'].includes(ext)) return 'AUD'
  if (['txt', 'md', 'json'].includes(ext)) return 'TXT'
  return 'FILE'
}

async function onLocalAttachFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) {
    rteToast('warning', '请选择附件文件')
    return
  }
  const catId = currentAttachCategoryId()
  const added: StoredAttach[] = []
  for (const file of files) {
    if (file.size > ATTACH_MAX_BYTES) {
      rteToast('warning', `${file.name} 超过 8MB，已跳过（本地预览限制）`)
      continue
    }
    try {
      // 优先 blob（插入可靠、不受 Link/配额影响）；小文件额外尝试 dataURL 便于素材库持久化
      let src = URL.createObjectURL(file)
      if (file.size <= 2 * 1024 * 1024) {
        try {
          const dataUrl = await readFileAsDataURL(file)
          if (dataUrl) src = dataUrl
        } catch {
          /* keep blob */
        }
      }
      if (!src) continue
      added.push({
        id: uid(),
        src,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        categoryId: catId,
        createdAt: Date.now(),
      })
    } catch {
      /* skip */
    }
  }
  if (!added.length) {
    rteToast('error', '附件读取失败')
    return
  }
  attachAssets.value = [...added, ...attachAssets.value]
  saveAttachStore()
  const next = new Set(attachSelectedIds.value)
  added.forEach((a) => next.add(a.id))
  attachSelectedIds.value = next
  insertAttachItems(added)
  closeAttachDialog()
  rteToast('success', `已插入 ${added.length} 个附件`)
}

function insertAttachItems(items: StoredAttach[]) {
  const ed = editor.value
  if (!ed || !items.length) return
  const usable = items.filter((a) => !!a.src && String(a.src).trim())
  if (!usable.length) return
  // 用 JSON 节点+link mark 插入，避免超长 href 的 HTML 解析丢标；data/blob 已在 Link 白名单
  const nodes: Record<string, unknown>[] = []
  usable.forEach((a, i) => {
    if (i > 0) nodes.push({ type: 'text', text: ' ' })
    nodes.push({
      type: 'text',
      text: `📎 ${a.name}`,
      marks: [
        {
          type: 'link',
          attrs: {
            href: a.src,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
            class: 'rte-attachment-link rte-link',
            title: a.name,
          },
        },
      ],
    })
  })
  ed.chain().focus().insertContent(nodes).run()
}

function confirmInsertAttaches() {
  const selected = attachAssets.value.filter((a) => attachSelectedIds.value.has(a.id))
  if (!selected.length) {
    rteToast('warning', '请选择附件，或使用「本地附件上传」')
    return
  }
  const usable = selected.filter((a) => a.src)
  if (!usable.length) {
    rteToast('warning', '所选附件缺少文件数据，请重新上传')
    return
  }
  insertAttachItems(usable)
  closeAttachDialog()
  rteToast('success', `已插入 ${usable.length} 个附件`)
}

const importMenuOpen = ref(false)
const importFileInputRef = ref<HTMLInputElement | null>(null)
const linkImportOpen = ref(false)
const linkImportUrl = ref('')
const linkImportBusy = ref(false)

function closeImportMenu() {
  importMenuOpen.value = false
}

const exportMenuOpen = ref(false)
const exportBusy = ref(false)

function closeExportMenu() {
  exportMenuOpen.value = false
}

function onExportMenu() {
  exportMenuOpen.value = true
  moreOpen.value = false
}

function exportFileBasename(): string {
  const raw = (localTitle.value || '').trim() || '未命名文档'
  return raw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

function triggerDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportAsHtml() {
  closeExportMenu()
  moreOpen.value = false
  const ed = editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (localTitle.value || '').trim() || '未命名文档'
  const body = ed.getHTML()
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6;color:#1d2129;max-width:800px;margin:32px auto;padding:0 16px;}
img,video{max-width:100%;height:auto;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #e5e6eb;padding:6px 8px;}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`
  triggerDownloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${exportFileBasename()}.html`)
  ElMessage.success('已导出 HTML')
}

function exportAsPlainText() {
  closeExportMenu()
  moreOpen.value = false
  const ed = editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (localTitle.value || '').trim()
  const textBody = ed.getText({ blockSeparator: '\n' }) || ''
  const content = title ? `${title}\n\n${textBody}` : textBody
  triggerDownloadBlob(
    new Blob([content], { type: 'text/plain;charset=utf-8' }),
    `${exportFileBasename()}.txt`,
  )
  ElMessage.success('已导出纯文本')
}

async function exportAsPng() {
  closeExportMenu()
  moreOpen.value = false
  if (exportBusy.value) return
  const root = rteRootEl.value
  const el =
    (root?.querySelector?.('.ProseMirror') as HTMLElement | null) ||
    (root?.querySelector?.('.rte-body') as HTMLElement | null)
  if (!el) {
    ElMessage.warning('未找到可导出的正文区域')
    return
  }
  exportBusy.value = true
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const link = document.createElement('a')
    link.download = `${exportFileBasename()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('已导出图片')
  } catch (err) {
    console.error(err)
    ElMessage.error('导出图片失败')
  } finally {
    exportBusy.value = false
  }
}

async function exportAsPdf() {
  closeExportMenu()
  moreOpen.value = false
  if (exportBusy.value) return
  const root = rteRootEl.value
  const el =
    (root?.querySelector?.('.ProseMirror') as HTMLElement | null) ||
    (root?.querySelector?.('.rte-body') as HTMLElement | null)
  if (!el) {
    ElMessage.warning('未找到可导出的正文区域')
    return
  }
  exportBusy.value = true
  try {
    const title = (localTitle.value || '').trim() || '未命名文档'
    const blob = await buildPdfFromElement(el, { title })
    triggerDownloadBlob(blob, `${exportFileBasename()}.pdf`)
    ElMessage.success('已导出 PDF')
  } catch (err) {
    console.error(err)
    ElMessage.error('导出 PDF 失败')
  } finally {
    exportBusy.value = false
  }
}

async function exportAsDocx() {
  closeExportMenu()
  moreOpen.value = false
  if (exportBusy.value) return
  const ed = editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  exportBusy.value = true
  try {
    const title = (localTitle.value || '').trim() || '未命名文档'
    const bodyHtml = ed.getHTML() || ''
    const bodyText = ed.getText({ blockSeparator: '\n' }) || ''
    const blob = await buildDocxBlob({ title, bodyHtml, bodyText })
    triggerDownloadBlob(blob, `${exportFileBasename()}.docx`)
    ElMessage.success('已导出 Word')
  } catch (err) {
    console.error(err)
    ElMessage.error('导出 Word 失败')
  } finally {
    exportBusy.value = false
  }
}

function exportAsMarkdown() {
  closeExportMenu()
  moreOpen.value = false
  const ed = editor.value
  if (!ed) {
    ElMessage.warning('编辑器未就绪')
    return
  }
  const title = (localTitle.value || '').trim()
  const mdBody = htmlToMarkdown(ed.getHTML() || '')
  const md = title ? `# ${title}\n\n${mdBody}` : mdBody
  triggerDownloadBlob(
    new Blob([md], { type: 'text/markdown;charset=utf-8' }),
    `${exportFileBasename()}.md`,
  )
  ElMessage.success('已导出 Markdown')
}

/** tool-wrap @mouseleave：仅当指针真正离开按钮+菜单时才关（避免点选项前被关掉） */
/** 工具条下拉：fixed + Teleport 到 body，按按钮 rect 自动翻转/夹紧 */
const FLOAT_VIEW_PAD = 8
const FLOAT_GAP = 2
const floatAnchors = new Map<string, HTMLElement>()
const menuCloseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const floatMenuEls = new Map<string, HTMLElement>()
/** 打开瞬间抑制 mouseleave / document pointerdown 误关 */
let ignoreDocMenuCloseUntil = 0
function markToolbarMenuOpening() {
  ignoreDocMenuCloseUntil = Date.now() + 500
  // 取消所有待关闭定时器
  for (const [k, t] of menuCloseTimers) {
    clearTimeout(t)
    menuCloseTimers.delete(k)
  }
}

function setFloatAnchor(key: string, el: unknown) {
  if (el && el instanceof HTMLElement) floatAnchors.set(key, el)
  else floatAnchors.delete(key)
}

function cancelMenuClose(key: string) {
  const t = menuCloseTimers.get(key)
  if (t != null) {
    clearTimeout(t)
    menuCloseTimers.delete(key)
  }
}

function scheduleMenuClose(key: string, close: () => void) {
  cancelMenuClose(key)
  menuCloseTimers.set(
    key,
    setTimeout(() => {
      menuCloseTimers.delete(key)
      close()
    }, 200),
  )
}

function onToolMenuEnter(key: string) {
  cancelMenuClose(key)
}

function onToolMenuLeave(
  event: MouseEvent,
  key: string,
  close: () => void,
) {
  // Teleport 挂载/重排时浏览器常对 wrap 甩一次 relatedTarget=null 的 mouseleave
  if (Date.now() < ignoreDocMenuCloseUntil) return
  const wrap = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (wrap && next && wrap.contains(next)) return
  const menu = floatMenuEls.get(key) || document.querySelector(`[data-rte-float-key="${key}"]`)
  if (menu && next && menu.contains(next)) return
  // 指针仍在菜单上（elementFromPoint）也不关
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const x = (event as MouseEvent).clientX
    const y = (event as MouseEvent).clientY
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const under = document.elementFromPoint(x, y)
      if (under && (under.closest?.(`[data-rte-float-key="${key}"]`) || under.closest?.('.rte-float-menu'))) {
        return
      }
    }
  }
  scheduleMenuClose(key, close)
}

function setFloatStyle(
  el: HTMLElement,
  prop: string,
  value: string,
) {
  // 必须 important：若 CSS 带 !important，普通 inline 会被盖掉，菜单落在 body 流末尾
  el.style.setProperty(prop, value, 'important')
}

function placeFloatMenuEl(menuEl: HTMLElement, key: string) {
  let anchor = floatAnchors.get(key)
  if (!anchor || !anchor.isConnected) {
    const found = document.querySelector(`[data-rte-anchor="${key}"]`)
    if (found instanceof HTMLElement) {
      anchor = found
      floatAnchors.set(key, found)
    }
  }
  // 非最大化从「更多」打开时，emoji/特殊字符/段距/字数按钮不在顶栏：回退锚到「更多」
  if (
    (!anchor || !anchor.isConnected) &&
    (key === 'emoji' || key === 'specialChars' || key === 'spacing' || key === 'wordStats')
  ) {
    const more =
      floatAnchors.get('more') ||
      (document.querySelector('[data-rte-anchor="more"]') as HTMLElement | null)
    if (more instanceof HTMLElement) {
      anchor = more
      floatAnchors.set(key, more)
    }
  }
  if (!anchor || !menuEl.isConnected) {
    menuEl.style.setProperty('visibility', 'visible', 'important')
    return
  }

  const rect = anchor.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  setFloatStyle(menuEl, 'position', 'fixed')
  setFloatStyle(menuEl, 'right', 'auto')
  setFloatStyle(menuEl, 'bottom', 'auto')
  setFloatStyle(menuEl, 'margin', '0')
  setFloatStyle(menuEl, 'z-index', '5200')
  // 先放到视口内可测，避免 top/left:auto 落在文档流末尾
  setFloatStyle(menuEl, 'left', '0px')
  setFloatStyle(menuEl, 'top', '0px')
  setFloatStyle(menuEl, 'max-height', 'none')
  menuEl.style.width = ''
  setFloatStyle(menuEl, 'visibility', 'hidden')

  const mw = Math.max(menuEl.offsetWidth, 1)
  const mh = Math.max(menuEl.offsetHeight, 1)
  const spaceBelow = vh - rect.bottom - FLOAT_VIEW_PAD
  const spaceAbove = rect.top - FLOAT_VIEW_PAD
  const preferBelow =
    spaceBelow >= Math.min(mh, 220) || spaceBelow >= spaceAbove

  let maxH: number
  let top: number
  if (preferBelow) {
    maxH = Math.max(120, spaceBelow - FLOAT_GAP)
    top = rect.bottom - FLOAT_GAP
  } else {
    maxH = Math.max(120, spaceAbove - FLOAT_GAP)
    const usedH = Math.min(mh, maxH)
    top = rect.top + FLOAT_GAP - usedH
  }

  const preferEnd =
    key === 'import' || key === 'export' || key === 'table' || key === 'more' || key.startsWith('more-')
  let left = preferEnd ? rect.right - mw : rect.left
  const maxW = Math.max(160, vw - FLOAT_VIEW_PAD * 2)
  if (mw > maxW) {
    menuEl.style.width = `${Math.floor(maxW)}px`
    left = FLOAT_VIEW_PAD
  } else {
    if (left + mw > vw - FLOAT_VIEW_PAD) left = vw - FLOAT_VIEW_PAD - mw
    if (left < FLOAT_VIEW_PAD) left = FLOAT_VIEW_PAD
  }

  if (top < FLOAT_VIEW_PAD) top = FLOAT_VIEW_PAD
  if (top + Math.min(mh, maxH) > vh - FLOAT_VIEW_PAD) {
    top = Math.max(FLOAT_VIEW_PAD, vh - FLOAT_VIEW_PAD - Math.min(mh, maxH))
  }

  setFloatStyle(menuEl, 'left', `${Math.round(left)}px`)
  setFloatStyle(menuEl, 'top', `${Math.round(top)}px`)
  setFloatStyle(menuEl, 'max-height', `${Math.round(maxH)}px`)
  setFloatStyle(menuEl, 'visibility', 'visible')
  menuEl.style.setProperty('--rte-float-max-h', `${Math.round(maxH)}px`)
  if (menuEl.classList.contains('rte-template-menu')) {
    setFloatStyle(menuEl, 'overflow', 'hidden')
  } else {
    setFloatStyle(menuEl, 'overflow-x', 'hidden')
    setFloatStyle(menuEl, 'overflow-y', 'auto')
  }
}

type FloatMenuEl = HTMLElement & { __rteFloatCleanup?: () => void }

const vRteFloat: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const key = String(binding.value || '')
    if (!key) return
    const node = el as FloatMenuEl
    node.classList.add('rte-float-menu')
    node.dataset.rteFloatKey = key
    floatMenuEls.set(key, node)
    markToolbarMenuOpening()
    let tries = 0
    const place = () => {
      placeFloatMenuEl(node, key)
      // 回调 ref 有时晚于 Teleport mount：短重试
      if (!floatAnchors.get(key) && tries < 10) {
        tries += 1
        requestAnimationFrame(place)
      }
    }
    nextTick(() => {
      place()
      requestAnimationFrame(place)
    })
    const ro = new ResizeObserver(() => placeFloatMenuEl(node, key))
    ro.observe(node)
    const onWin = () => placeFloatMenuEl(node, key)
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    node.__rteFloatCleanup = () => {
      ro.disconnect()
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
      if (floatMenuEls.get(key) === node) floatMenuEls.delete(key)
    }
  },
  updated(el, binding) {
    const key = String(binding.value || '')
    if (!key) return
    floatMenuEls.set(key, el)
    nextTick(() => placeFloatMenuEl(el, key))
  },
  unmounted(el) {
    const node = el as FloatMenuEl
    const key = node.dataset.rteFloatKey
    node.__rteFloatCleanup?.()
    delete node.__rteFloatCleanup
    if (key && floatMenuEls.get(key) === node) floatMenuEls.delete(key)
  },
}

function closeAllToolbarMenus() {
  headingOpen.value = false
  listOpen.value = false
  formOpen.value = false
  templateOpen.value = false
  alignOpen.value = false
  tableMenuOpen.value = false
  importMenuOpen.value = false
  exportMenuOpen.value = false
  pasteFormatOpen.value = false
  bookmarkPanelOpen.value = false
  caseMenuOpen.value = false
  zoomMenuOpen.value = false
  viewExtrasOpen.value = false
  emojiOpen.value = false
  specialCharsOpen.value = false
  columnsOpen.value = false
  spacingOpen.value = false
  wordStatsOpen.value = false
  shortcutsOpen.value = false
  calloutOpen.value = false
  moreCalloutOpen.value = false
  hrOpen.value = false
  blockOpsOpen.value = false
  insertDateOpen.value = false
  codeLangOpen.value = false
  // outline 侧栏独立，不随工具条菜单一并关闭
  closeFontMenus()
  closeColorMenus()
  closeHighlightMenus()
  closeMore()
}

function onDocPointerDownForMenus(e: PointerEvent) {
  if (Date.now() < ignoreDocMenuCloseUntil) return
  const t = e.target as HTMLElement | null
  if (!t) return
  if (
    t.closest(
      '.rte-tool-wrap, .rte-tool, .rte-float-menu, .rte-more-menu, .rte-more-flyout, .rte-emoji-panel, .rte-specialchars-panel, .rte-spacing-panel, .rte-wordstats-panel, .rte-shortcuts-panel, .rte-callout-menu, .rte-outline-panel, .rte-slash-menu, .rte-mention-menu, .el-overlay, .el-dialog, .el-message-box, .rte-table-dialog, .rte-attach-dialog',
    )
  ) {
    return
  }
  closeAllToolbarMenus()
}

function repositionSlashMenu() {
  if (!slashOpen.value) return
  placeSlashMenuFromRect(slashClientRectFn?.() ?? null)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDownForMenus, true)
  window.addEventListener('resize', repositionSlashMenu)
  window.addEventListener('scroll', repositionSlashMenu, true)
  window.addEventListener('resize', repositionMentionMenu)
  window.addEventListener('scroll', repositionMentionMenu, true)
  nextTick(() => {
    syncSpellcheckToDom()
    editor.value?.commands.captureRevisionBaseline()
  })
})

watch(spellcheckEnabled, () => syncSpellcheckToDom())
watch(
  () => editor.value,
  (ed) => {
    if (ed) nextTick(() => syncSpellcheckToDom())
  },
)

function onImport() {
  // 紧凑「更多」菜单入口：打开同款双选项
  importMenuOpen.value = true
  moreOpen.value = false
}

function pickImportDocument() {
  closeImportMenu()
  moreOpen.value = false
  importFileInputRef.value?.click()
}

function openImportLinkDialog() {
  closeImportMenu()
  moreOpen.value = false
  linkImportUrl.value = ''
  linkImportOpen.value = true
}

function closeImportLinkDialog() {
  linkImportOpen.value = false
  linkImportUrl.value = ''
  linkImportBusy.value = false
}

function looksLikeRichHtml(html: string): boolean {
  const h = (html || '').trim()
  if (!h) return false
  // 浏览器常给纯文本也包一层 html/body；忽略空壳
  const stripped = h
    .replace(/<\/?!(DOCTYPE)[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
  if (!stripped) return false
  // 有实质块级/行内富文本标签才算「富文本粘贴」
  return /<(p|div|span|table|ul|ol|li|h[1-6]|br|strong|em|b|i|a|img|pre|blockquote)\b/i.test(
    stripped,
  )
}

/** 粗判剪贴板纯文本是否为 Markdown（标题/列表/引用/代码/链接） */
function looksLikeMarkdown(text: string): boolean {
  const t = (text || '').replace(/\r\n/g, '\n')
  if (!t.trim()) return false
  const lines = t.split('\n').filter((l) => l.trim())
  if (lines.length < 1) return false
  let hits = 0
  for (const line of lines.slice(0, 40)) {
    if (/^#{1,6}\s+\S/.test(line)) hits += 2
    else if (/^[-*+]\s+\S/.test(line)) hits += 1
    else if (/^\d+\.\s+\S/.test(line)) hits += 1
    else if (/^>\s+\S/.test(line)) hits += 1
    else if (/^```/.test(line)) hits += 2
    else if (/\*\*[^*]+\*\*/.test(line) || /__[^_]+__/.test(line)) hits += 1
    else if (/\[[^\]]+\]\(https?:[^)]+\)/.test(line)) hits += 1
  }
  return hits >= 2
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  const closeLists = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
    if (inOl) {
      out.push('</ol>')
      inOl = false
    }
  }
  const inlineFormat = (s: string) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2" class="rte-link">$1</a>',
      )

  for (const raw of lines) {
    const line = raw
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      closeLists()
      const level = heading[1]!.length
      out.push(`<h${level}>${inlineFormat(heading[2]!.trim())}</h${level}>`)
      continue
    }
    const ul = /^[-*+]\s+(.+)$/.exec(line)
    if (ul) {
      if (inOl) {
        out.push('</ol>')
        inOl = false
      }
      if (!inUl) {
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${inlineFormat(ul[1]!.trim())}</li>`)
      continue
    }
    const ol = /^\d+\.\s+(.+)$/.exec(line)
    if (ol) {
      if (inUl) {
        out.push('</ul>')
        inUl = false
      }
      if (!inOl) {
        out.push('<ol>')
        inOl = true
      }
      out.push(`<li>${inlineFormat(ol[1]!.trim())}</li>`)
      continue
    }
    if (!line.trim()) {
      closeLists()
      continue
    }
    closeLists()
    out.push(`<p>${inlineFormat(line.trim())}</p>`)
  }
  closeLists()
  return out.join('') || '<p></p>'
}

async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  // 轻量解析：docx 是 zip，读 word/document.xml 抽文本
  const zip = await JSZip.loadAsync(buf)
  const xmlFile = zip.file('word/document.xml')
  if (!xmlFile) throw new Error('NO_DOCUMENT_XML')
  const xml = await xmlFile.async('string')
  const texts: string[] = []
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    texts.push(m[1]!)
  }
  // 粗略按段落：遇 </w:p> 换行
  const paras = xml
    .split(/<\/w:p>/)
    .map((chunk) => {
      const parts: string[] = []
      const r = /<w:t[^>]*>([^<]*)<\/w:t>/g
      let mm: RegExpExecArray | null
      while ((mm = r.exec(chunk))) parts.push(mm[1]!)
      return parts.join('')
    })
    .map((s) => s.trim())
    .filter(Boolean)
  return paras.join('\n\n') || texts.join('')
}

async function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const name = file.name.toLowerCase()
  const ed = editor.value
  if (!ed) return

  try {
    if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
      const textContent = await file.text()
      const html = name.endsWith('.txt')
        ? textContent
            .split(/\n{2,}/)
            .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
            .join('') || `<p>${escapeHtml(textContent)}</p>`
        : markdownToHtml(textContent)
      ed.chain().focus().insertContent(html).run()
      ElMessage.success(`已导入文档：${file.name}`)
      return
    }

    if (name.endsWith('.docx')) {
      const buf = await file.arrayBuffer()
      try {
        const plain = await extractDocxText(buf)
        const html = plain
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
          .join('')
        ed.chain().focus().insertContent(html || `<p></p>`).run()
        ElMessage.success(`已导入文档：${file.name}`)
      } catch {
        ElMessage.warning('无法解析该 .docx，请另存为 Markdown (.md) 后再导入')
      }
      return
    }

    if (name.endsWith('.doc')) {
      ElMessage.warning('暂不支持旧版 .doc，请另存为 .docx 或 .md 后导入')
      return
    }

    ElMessage.warning('请选择 .md / .docx 文档')
  } catch (err) {
    console.error(err)
    ElMessage.error('导入失败，请重试')
  }
}

async function confirmImportLink() {
  const ed = editor.value
  if (!ed) return
  const url = linkImportUrl.value.trim()
  if (!url) {
    ElMessage.warning('请输入公众号文章链接')
    return
  }
  let href = url
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`

  linkImportBusy.value = true
  let title = ''
  let excerpt = ''
  try {
    // 浏览器侧常被 CORS 拦截；失败则走占位插入
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(href, { signal: ctrl.signal, mode: 'cors' })
    window.clearTimeout(timer)
    if (res.ok) {
      const html = await res.text()
      const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
      title = (t?.[1] || '').trim()
      const desc =
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(
          html,
        ) ||
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(
          html,
        )
      if (desc?.[1]) title = desc[1].trim()
      const d2 =
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i.exec(
          html,
        ) ||
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i.exec(
          html,
        )
      if (d2?.[1]) excerpt = d2[1].trim()
    }
  } catch {
    // CORS / network — expected for 公众号
  } finally {
    linkImportBusy.value = false
  }

  const label = title || '公众号文章'
  const safeHref = escapeHtml(href)
  const safeLabel = escapeHtml(label)
  const safeExcerpt = excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ''
  const block = `<p><a href="${safeHref}" class="rte-link" target="_blank" rel="noopener">🔗 ${safeLabel}</a></p>${safeExcerpt}<p><code>来源：${safeHref}</code></p>`
  ed.chain().focus().insertContent(block).run()
  if (title) {
    ElMessage.success('已导入链接并写入标题')
  } else {
    ElMessage.info('无法抓取正文（公众号常限制跨域），已插入可点击链接占位')
  }
  closeImportLinkDialog()
}
function onDraftBackup() {
  ElMessage.success('草稿已保存在本地编辑状态')
}
function onPublishSettings() {
  ElMessage.info('发布设置即将支持')
}
function onPreview() {
  if (props.expanded) {
    setViewMode('preview')
    return
  }
  ElMessage.info('请先最大化面板，再使用预览')
}
function onPublish() {
  ElMessage.success('内容已写入文档（面板内无需单独发布）')
}

const headingOpen = ref(false)
const listOpen = ref(false)
const formOpen = ref(false)
const templateOpen = ref(false)
const moreFormOpen = ref(false)
const moreTemplateOpen = ref(false)
const moreOpen = ref(false)
const colorOpen = ref(false)
const highlightOpen = ref(false)
const moreColorOpen = ref(false)
const moreHighlightOpen = ref(false)
const alignOpen = ref(false)
const fontSizeOpen = ref(false)
const fontFamilyOpen = ref(false)
const lineHeightOpen = ref(false)
const moreFontSizeOpen = ref(false)
const moreFontFamilyOpen = ref(false)
const moreLineHeightOpen = ref(false)
const customColorOpen = ref(false)
const customColorHex = ref('#165dff')

/**
 * Word 风格字体颜色：主题颜色（10 列 × 6 行：基色 + 明暗变体）+ 标准颜色一行。
 * 色值对齐 Office 常见主题调色板。
 */
const WORD_THEME_COLORS: string[][] = [
  ['#FFFFFF', '#F2F2F2', '#D8D8D8', '#BFBFBF', '#A5A5A5', '#7F7F7F'],
  ['#000000', '#7F7F7F', '#595959', '#3F3F3F', '#262626', '#0C0C0C'],
  ['#E7E6E6', '#D0CECE', '#AEABAB', '#757070', '#3A3838', '#171616'],
  ['#44546A', '#D6DCE4', '#ADB9CA', '#8496B0', '#323F4F', '#222A35'],
  ['#5B9BD5', '#DEEBF6', '#BDD7EE', '#9CC2E5', '#2E75B5', '#1F4E79'],
  ['#ED7D31', '#FBE4D5', '#F7CAAC', '#F4B183', '#C55A11', '#833C0B'],
  ['#A5A5A5', '#EDEDED', '#DBDBDB', '#C9C9C9', '#7B7B7B', '#525252'],
  ['#FFC000', '#FFF2CC', '#FFE699', '#FFD966', '#BF9000', '#7F6000'],
  ['#4472C4', '#D6DCE4', '#B4C6E7', '#8EA9DB', '#2F5496', '#1F3864'],
  ['#70AD47', '#E2EFD9', '#C5E0B3', '#A8D08D', '#548235', '#375623'],
]

/** 按行展开主题色网格（第 0 行为基色，其后为明暗），供 CSS grid 按行渲染 */
const WORD_THEME_ROWS = (() => {
  const rows: string[][] = []
  const cols = WORD_THEME_COLORS.length
  const depth = WORD_THEME_COLORS[0]?.length ?? 0
  for (let r = 0; r < depth; r++) {
    rows.push(Array.from({ length: cols }, (_, c) => WORD_THEME_COLORS[c][r]))
  }
  return rows
})()

/** 办公常用高亮：柔和底色（主色板）+ 经典荧光笔 */
const WORD_HIGHLIGHT_SOFT = [
  { color: '#FFF3BF', label: '淡黄' },
  { color: '#D8F5A2', label: '浅绿' },
  { color: '#A5D8FF', label: '浅蓝' },
  { color: '#FFC9C9', label: '浅粉' },
  { color: '#E5DBFF', label: '浅紫' },
  { color: '#FFE8CC', label: '浅橙' },
  { color: '#C3FAE8', label: '薄荷绿' },
  { color: '#D0EBFF', label: '天空蓝' },
  { color: '#FFDEEB', label: '玫瑰粉' },
  { color: '#E9ECEF', label: '浅灰' },
]

const WORD_HIGHLIGHT_VIVID = [
  { color: '#FFFF00', label: '荧光黄' },
  { color: '#00FF00', label: '荧光绿' },
  { color: '#00FFFF', label: '青绿' },
  { color: '#FF00FF', label: '品红' },
  { color: '#FF6B6B', label: '珊瑚红' },
  { color: '#74C0FC', label: '亮蓝' },
  { color: '#B197FC', label: '亮紫' },
  { color: '#FFD43B', label: '金黄' },
  { color: '#69DB7C', label: '草绿' },
  { color: '#ADB5BD', label: '中灰' },
]

/** 兼容旧引用：合并列表 */
const WORD_HIGHLIGHT_COLORS = [...WORD_HIGHLIGHT_SOFT, ...WORD_HIGHLIGHT_VIVID]

const WORD_STANDARD_COLOR_ITEMS = [
  { color: '#C00000', label: '深红' },
  { color: '#FF0000', label: '红色' },
  { color: '#FFC000', label: '橙色' },
  { color: '#FFFF00', label: '黄色' },
  { color: '#92D050', label: '浅绿' },
  { color: '#00B050', label: '绿色' },
  { color: '#00B0F0', label: '青绿' },
  { color: '#0070C0', label: '蓝色' },
  { color: '#002060', label: '深蓝' },
  { color: '#7030A0', label: '紫色' },
]

const customHighlightOpen = ref(false)
const customHighlightHex = ref('#FFF3BF')
const highlightHoverLabel = ref('')
const colorHoverLabel = ref('')
const rteAriaStatus = ref('')

function announceRte(msg: string) {
  rteAriaStatus.value = msg
}

function highlightColorLabel(color: string): string {
  const c = (color || '').toLowerCase()
  if (!c) return '无'
  if (c === '__default__') return '默认高亮'
  const hit = WORD_HIGHLIGHT_COLORS.find((h) => h.color.toLowerCase() === c)
  return hit?.label || color
}

function isLightHighlight(color: string): boolean {
  const c = (color || '').toLowerCase()
  if (!c || c === '__default__') return true
  const hex = c.startsWith('#') ? c.slice(1) : c
  if (hex.length !== 3 && hex.length !== 6) return false
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // 相对亮度
  return (r * 299 + g * 587 + b * 114) / 1000 > 180
}

function currentHighlightLabel(): string {
  return highlightColorLabel(currentHighlightColor())
}

function applyCustomHighlight() {
  let hex = customHighlightHex.value.trim()
  if (!hex) return
  if (!hex.startsWith('#')) hex = `#${hex}`
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) && !/^#[0-9a-fA-F]{3}$/.test(hex)) {
    ElMessage.warning('请输入有效的十六进制颜色，如 #FFF3BF')
    return
  }
  applyHighlightColor(hex)
  customHighlightOpen.value = false
}

function onCustomHighlightNativeInput(event: Event) {
  const el = event.target as HTMLInputElement | null
  if (el?.value) customHighlightHex.value = el.value
}

function closeColorMenus() {
  colorOpen.value = false
  moreColorOpen.value = false
  customColorOpen.value = false
}

function closeHighlightMenus() {
  highlightOpen.value = false
  moreHighlightOpen.value = false
  customHighlightOpen.value = false
  highlightHoverLabel.value = ''
}

function toggleColorMenu() {
  closeHighlightMenus()
  closeFontMenus()
  headingOpen.value = false
  listOpen.value = false
  formOpen.value = false
  templateOpen.value = false
  alignOpen.value = false
  customColorOpen.value = false
  colorOpen.value = !colorOpen.value
}

function toggleHighlightMenu() {
  closeColorMenus()
  closeFontMenus()
  headingOpen.value = false
  listOpen.value = false
  formOpen.value = false
  templateOpen.value = false
  alignOpen.value = false
  highlightOpen.value = !highlightOpen.value
}

function applyCustomColor() {
  let hex = customColorHex.value.trim()
  if (!hex) return
  if (!hex.startsWith('#')) hex = `#${hex}`
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) && !/^#[0-9a-fA-F]{3}$/.test(hex)) return
  applyTextColor(hex)
}
function onCustomColorNativeInput(event: Event) {
  const el = event.target as HTMLInputElement | null
  if (el?.value) customColorHex.value = el.value
}

/** 主题色按行展平后的一维列表（10 列 × 6 行） */
const WORD_THEME_FLAT = WORD_THEME_ROWS.flat()

function onMoreToolClick(t: ToolItem) {
  if (t.kind === 'color') {
    moreHighlightOpen.value = false
    moreFormOpen.value = false
    moreTemplateOpen.value = false
    moreFontSizeOpen.value = false
    moreFontFamilyOpen.value = false
    moreLineHeightOpen.value = false
    moreCalloutOpen.value = false
    moreColorOpen.value = !moreColorOpen.value
    customColorOpen.value = false
    return
  }
  if (t.key === 'highlight') {
    moreColorOpen.value = false
    moreFormOpen.value = false
    moreTemplateOpen.value = false
    moreFontSizeOpen.value = false
    moreFontFamilyOpen.value = false
    moreLineHeightOpen.value = false
    moreCalloutOpen.value = false
    customColorOpen.value = false
    moreHighlightOpen.value = !moreHighlightOpen.value
    return
  }
  if (t.kind === 'form') {
    moreColorOpen.value = false
    moreHighlightOpen.value = false
    moreTemplateOpen.value = false
    moreFontSizeOpen.value = false
    moreFontFamilyOpen.value = false
    moreLineHeightOpen.value = false
    customColorOpen.value = false
    moreFormOpen.value = !moreFormOpen.value
    return
  }
  if (t.kind === 'template') {
    moreColorOpen.value = false
    moreHighlightOpen.value = false
    moreFormOpen.value = false
    moreFontSizeOpen.value = false
    moreFontFamilyOpen.value = false
    moreLineHeightOpen.value = false
    customColorOpen.value = false
    moreTemplateOpen.value = !moreTemplateOpen.value
    return
  }
  if (t.kind === 'fontSize') {
    moreColorOpen.value = false
    moreHighlightOpen.value = false
    moreFormOpen.value = false
    moreTemplateOpen.value = false
    moreFontFamilyOpen.value = false
    moreLineHeightOpen.value = false
    customColorOpen.value = false
    moreFontSizeOpen.value = !moreFontSizeOpen.value
    return
  }
  if (t.kind === 'fontFamily') {
    moreColorOpen.value = false
    moreHighlightOpen.value = false
    moreFormOpen.value = false
    moreTemplateOpen.value = false
    moreFontSizeOpen.value = false
    moreLineHeightOpen.value = false
    customColorOpen.value = false
    moreFontFamilyOpen.value = !moreFontFamilyOpen.value
    return
  }
  if (t.kind === 'lineHeight') {
    moreColorOpen.value = false
    moreHighlightOpen.value = false
    moreFormOpen.value = false
    moreTemplateOpen.value = false
    moreFontSizeOpen.value = false
    moreFontFamilyOpen.value = false
    customColorOpen.value = false
    moreLineHeightOpen.value = !moreLineHeightOpen.value
    return
  }
  if (t.kind === 'emoji' || t.kind === 'specialChars' || t.kind === 'spacing' || t.kind === 'wordStats') {
    // 紧凑模式工具不在顶栏：把浮层锚到「更多」按钮，避免无 anchor 飞到视口角落
    const moreBtn =
      floatAnchors.get('more') ||
      (document.querySelector('[data-rte-anchor="more"]') as HTMLElement | null)
    const panelKey =
      t.kind === 'emoji'
        ? 'emoji'
        : t.kind === 'specialChars'
          ? 'specialChars'
          : t.kind === 'spacing'
            ? 'spacing'
            : 'wordStats'
    if (moreBtn instanceof HTMLElement) floatAnchors.set(panelKey, moreBtn)
    moreOpen.value = false
    markToolbarMenuOpening()
    nextTick(() => {
      if (panelKey === 'emoji') {
        specialCharsOpen.value = false
        emojiOpen.value = true
      } else if (panelKey === 'specialChars') {
        emojiOpen.value = false
        specialCharsOpen.value = true
      } else if (panelKey === 'spacing') spacingOpen.value = true
      else wordStatsOpen.value = true
    })
    return
  }
  if (t.kind === 'callout') {
    moreColorOpen.value = false
    moreHighlightOpen.value = false
    moreFormOpen.value = false
    moreTemplateOpen.value = false
    moreFontSizeOpen.value = false
    moreFontFamilyOpen.value = false
    moreLineHeightOpen.value = false
    customColorOpen.value = false
    moreCalloutOpen.value = !moreCalloutOpen.value
    return
  }
  if (t.kind === 'shortcuts') {
    moreOpen.value = false
    const moreBtn =
      floatAnchors.get('more') ||
      (document.querySelector('[data-rte-anchor="more"]') as HTMLElement | null)
    if (moreBtn instanceof HTMLElement) floatAnchors.set('shortcuts', moreBtn)
    markToolbarMenuOpening()
    nextTick(() => {
      shortcutsOpen.value = true
    })
    return
  }
  if (t.kind === 'columns') {
    moreOpen.value = false
    insertColumns(2)
    return
  }
  if (t.kind === 'hr' || t.kind === 'blockOps' || t.kind === 'insertDate') {
    const moreBtn =
      floatAnchors.get('more') ||
      (document.querySelector('[data-rte-anchor="more"]') as HTMLElement | null)
    const panelKey = t.kind
    if (moreBtn instanceof HTMLElement) floatAnchors.set(panelKey, moreBtn)
    moreOpen.value = false
    markToolbarMenuOpening()
    nextTick(() => {
      hrOpen.value = panelKey === 'hr'
      blockOpsOpen.value = panelKey === 'blockOps'
      insertDateOpen.value = panelKey === 'insertDate'
    })
    return
  }
  moreColorOpen.value = false
  moreHighlightOpen.value = false
  moreFormOpen.value = false
  moreTemplateOpen.value = false
  moreFontSizeOpen.value = false
  moreFontFamilyOpen.value = false
  moreLineHeightOpen.value = false
  moreCalloutOpen.value = false
  customColorOpen.value = false
    if (t.kind === 'caseTransform') {
    caseMenuOpen.value = !caseMenuOpen.value
    return
  }
  if (t.kind === 'zoom') {
    zoomMenuOpen.value = !zoomMenuOpen.value
    return
  }
  if (t.kind === 'viewExtras') {
    viewExtrasOpen.value = !viewExtrasOpen.value
    return
  }
  if (t.kind === 'paraStyle') {
    paraStyleOpen.value = !paraStyleOpen.value
    listStyleOpen.value = false
    return
  }
  if (t.kind === 'listStyle') {
    listStyleOpen.value = !listStyleOpen.value
    paraStyleOpen.value = false
    return
  }
moreOpen.value = false
  t.run?.()
}

/**
 * 飞书式主栏顺序。分隔用 __div。
 * 紧凑画布只放这一行（可横滑）；最大化时其余工具落到第二行。
 */
const FEISHU_PRIMARY_ORDER = [
  'undo',
  'redo',
  '__div',
  'heading',
  'bold',
  'italic',
  'underline',
  'strike',
  '__div',
  'color',
  'highlight',
  '__div',
  'list',
  'quote',
  'code',
  '__div',
  'link',
  'image',
  'align',
] as const

const PRIMARY_KEYS = new Set<string>(
  FEISHU_PRIMARY_ORDER.filter((key) => key !== '__div'),
)

function collapseToolbarDividers(items: ToolItem[]): ToolItem[] {
  const out: ToolItem[] = []
  for (const item of items) {
    if (item.kind === 'divider') {
      if (!out.length || out[out.length - 1]?.kind === 'divider') continue
      out.push(item)
      continue
    }
    out.push(item)
  }
  while (out[0]?.kind === 'divider') out.shift()
  while (out[out.length - 1]?.kind === 'divider') out.pop()
  return out
}

type ToolItem = {
  disabled?: () => boolean
  key: string
  label: string
  /** 悬停完整说明；缺省用 label */
  title?: string
  icon: string
  iconComp?: Component
  kind?: 'heading' | 'list' | 'more' | 'btn' | 'color' | 'highlight' | 'align' | 'fontSize' | 'fontFamily' | 'lineHeight' | 'import' | 'export' | 'table' | 'attach' | 'form' | 'template' | 'code' | 'divider' | 'emoji' | 'specialChars' | 'columns' | 'spacing' | 'wordStats' | 'callout' | 'shortcuts' | 'hr' | 'blockOps' | 'insertDate' | 'pasteFormat' | 'caseTransform' | 'zoom' | 'viewExtras' | 'paraStyle' | 'listStyle'
  active?: () => boolean
  run?: () => void
}

function toolIcon(key: string): Component | undefined {
  return toolbarIconMap[key]
}

const allTools = computed((): ToolItem[] => {
  void editor.value?.state // reactive tick
  const ic = (key: string) => toolIcon(key)
  /**
   * 最大化工具栏分组（企业级）：
   * 操作（撤销/查找/格式刷/纯文本）| 文字（标题→段距）| 段落（引用/分页/分栏）|
   * 插入（媒体/表单/模板/表情）| 其他（打印/字数/导入导出）
   * 目录已按产品要求移除，勿恢复。分组靠发丝竖线；换行靠 flex-wrap。
   */
  return [
    // —— 操作 ——
    {
      key: 'undo',
      label: '撤销',
      title: '撤销 (Ctrl/⌘+Z)',
      icon: '↶',
      iconComp: ic('undo'),
      run: undo,
      disabled: () => !(editor.value?.can().undo() ?? false),
    },
    {
      key: 'redo',
      label: '重做',
      title: '重做 (Ctrl/⌘+Shift+Z)',
      icon: '↷',
      iconComp: ic('redo'),
      run: redo,
      disabled: () => !(editor.value?.can().redo() ?? false),
    },
    {
      key: 'clear',
      label: '清除格式',
      title: '清除格式',
      icon: '⌫',
      iconComp: ic('clear'),
      run: clearFormat,
    },
    {
      key: 'find',
      label: '查找',
      title: '查找与替换 (Ctrl/⌘+F)',
      icon: '🔍',
      iconComp: ic('find'),
      active: () => findDialogOpen.value,
      run: openFindDialog,
    },
    {
      key: 'formatPainter',
      label: '格式刷',
      title: '格式刷（单击一次，双击连续）',
      icon: '🖌',
      iconComp: ic('formatPainter'),
      active: () => formatPainterArmed.value,
      run: toggleFormatPainter,
    },
    {
      key: 'pastePlain',
      label: '纯文本',
      title: '粘贴为纯文本（开关）',
      icon: 'TXT',
      iconComp: ic('pastePlain'),
      active: () => pastePlainTextMode.value,
      run: togglePastePlain,
    },
    { key: 'div-ops', label: '', icon: '', kind: 'divider' },
    // —— 文字 ——
    { key: 'heading', label: '段落', title: '段落样式（正文 / 标题 / 引用）', icon: 'H▾', iconComp: ic('heading'), kind: 'heading', active: () => isActive('heading') || isActive('blockquote') },
    {
      key: 'bold',
      label: '加粗',
      title: '加粗 (Ctrl/⌘+B)',
      icon: 'B',
      iconComp: ic('bold'),
      active: () => isActive('bold'),
      run: toggleBold,
    },
    {
      key: 'italic',
      label: '斜体',
      title: '斜体 (Ctrl/⌘+I)',
      icon: 'I',
      iconComp: ic('italic'),
      active: () => isActive('italic'),
      run: toggleItalic,
    },
    {
      key: 'underline',
      label: '下划线',
      title: '下划线 (Ctrl/⌘+U)',
      icon: 'U',
      iconComp: ic('underline'),
      active: () => isActive('underline'),
      run: toggleUnderline,
    },
    {
      key: 'strike',
      label: '删除线',
      title: '删除线 (Ctrl/⌘+Shift+X)',
      icon: 'S̶',
      iconComp: ic('strike'),
      active: () => isActive('strike'),
      run: toggleStrike,
    },
    {
      key: 'subscript',
      label: '下标',
      icon: 'x₂',
      iconComp: ic('subscript'),
      active: () => isActive('subscript'),
      run: toggleSubscript,
    },
    {
      key: 'superscript',
      label: '上标',
      icon: 'x²',
      iconComp: ic('superscript'),
      active: () => isActive('superscript'),
      run: toggleSuperscript,
    },
    {
      key: 'codeInline',
      label: '行内码',
      title: '行内代码 (Ctrl/⌘+E)',
      icon: '`',
      iconComp: ic('codeInline'),
      active: () => isActive('code'),
      run: toggleCode,
    },
    {
      key: 'highlight',
      label: '高亮',
      icon: '🖍',
      iconComp: ic('highlight'),
      kind: 'highlight',
      active: () => isActive('highlight'),
    },
    { key: 'color', label: '颜色', icon: 'A', iconComp: ic('color'), kind: 'color' },
    { key: 'fontSize', label: '字号', icon: 'Aa', iconComp: ic('fontSize'), kind: 'fontSize', active: () => !!currentFontSize() },
    { key: 'fontFamily', label: '字体', icon: 'F', iconComp: ic('fontFamily'), kind: 'fontFamily', active: () => !!currentFontFamily() },
    { key: 'lineHeight', label: '行距', icon: '↕', iconComp: ic('lineHeight'), kind: 'lineHeight', active: () => !!currentLineHeight() },
    { key: 'align', label: '对齐', icon: '≡', iconComp: ic('align'), kind: 'align' },
    { key: 'list', label: '列表', icon: '☰▾', iconComp: ic('list'), kind: 'list' },
    {
      key: 'indent',
      label: '缩进',
      title: '增加缩进',
      icon: '→',
      iconComp: ic('indent'),
      run: indentBlock,
    },
    {
      key: 'outdent',
      label: '减少',
      title: '减少缩进',
      icon: '←',
      iconComp: ic('outdent'),
      run: outdentBlock,
    },
    { key: 'spacing', label: '段距', title: '段前段后 / 字间距', icon: '↕', iconComp: ic('spacing'), kind: 'spacing', active: () => !!(currentLetterSpacing() || currentMarginTop() || currentMarginBottom()) },
    { key: 'div-text', label: '', icon: '', kind: 'divider' },
    // —— 高级（段落）——
    {
      key: 'quote',
      label: '引用',
      title: '引用 (Ctrl/⌘+Shift+9)',
      icon: '❝',
      iconComp: ic('quote'),
      active: () => isActive('blockquote'),
      run: toggleBlockquote,
    },
    {
      key: 'callout',
      label: '告示',
      title: '告示框（提示/警告/成功/错误）',
      icon: '!',
      iconComp: ic('callout'),
      kind: 'callout',
      active: () => isActive('callout'),
    },
    { key: 'hr', label: '分割线', title: '分割线样式', icon: '┄', iconComp: ic('hr'), kind: 'hr' },
    {
      key: 'blockOps',
      label: '块',
      title: '块操作：全选 / 复制 / 上移 / 下移',
      icon: '▣',
      iconComp: ic('more'),
      kind: 'blockOps',
    },
    {
      key: 'insertDate',
      label: '日期',
      title: '插入今天日期',
      icon: '📅',
      iconComp: ic('note'),
      kind: 'insertDate',
    },
    {
      key: 'code',
      label: '代码块',
      title: '代码块 (Ctrl/⌘+Shift+E)',
      icon: '</>',
      iconComp: ic('code'),
      kind: 'code',
      active: () => isActive('codeBlock'),
      run: toggleCodeBlock,
    },
    {
      key: 'pageBreak',
      label: '分页符',
      title: '插入分页符（打印/PDF）',
      icon: '=======',
      iconComp: ic('pageBreak'),
      run: insertPageBreak,
    },
    { key: 'columns', label: '分栏', title: '多栏布局', icon: '▥', iconComp: ic('columns'), kind: 'columns' },
    { key: 'div-block', label: '', icon: '', kind: 'divider' },
    // —— 插入 ——
    { key: 'image', label: '图片', icon: '🖼', iconComp: ic('image'), run: insertImage },
    { key: 'video', label: '视频', icon: '▶', iconComp: ic('video'), run: insertVideo },
    {
      key: 'link',
      label: '链接',
      title: '插入/编辑链接 (Ctrl/⌘+K)',
      icon: '🔗',
      iconComp: ic('link'),
      active: () => isActive('link'),
      run: insertLink,
    },
    { key: 'formula', label: '公式', icon: 'Σ', iconComp: ic('formula'), run: insertFormula },
    {
      key: 'form',
      label: '表单',
      icon: '☑▾',
      iconComp: ic('form'),
      kind: 'form',
      active: () =>
        isActive('formTextInput') ||
        isActive('formRadioGroup') ||
        isActive('formCheckboxGroup') ||
        isActive('formSelect') ||
        isActive('formTextarea') ||
        isActive('formNumberInput') ||
        isActive('formDateInput') ||
        isActive('formSwitch'),
    },
    {
      key: 'template',
      label: '模板',
      title: '插入模板',
      icon: '📄▾',
      iconComp: ic('template'),
      kind: 'template',
    },
    { key: 'table', label: '表格', icon: '▦', iconComp: ic('table'), kind: 'table', active: () => isInTable(), run: onTableToolClick },
    { key: 'attach', label: '附件', icon: '☁▾', iconComp: ic('attach'), kind: 'attach', run: onAttachment },
    { key: 'note', label: '注释', icon: '[1]', iconComp: ic('note'), run: insertNote },
    { key: 'emoji', label: '表情', title: '插入表情', icon: '☺', iconComp: ic('emoji'), kind: 'emoji' },
    { key: 'specialChars', label: '字符', title: '插入字符', icon: 'Ω', iconComp: ic('specialChars'), kind: 'specialChars' },
    { key: 'div-insert', label: '', icon: '', kind: 'divider' },
    // —— 其他 ——
    {
      key: 'print',
      label: '打印',
      title: '打印预览',
      icon: '🖨',
      iconComp: ic('print'),
      run: openPrintPreview,
    },
    {
      key: 'bookmark',
      label: '书签',
      title: '书签 / 锚点（打开列表；可新建）',
      icon: '⚓',
      iconComp: ic('link'),
      active: () => isActive('bookmark') || bookmarkPanelOpen.value,
      run: toggleBookmarkPanel,
    },
    {
      key: 'spellcheck',
      label: '拼写',
      title: '拼写检查开关（浏览器词典）',
      icon: 'Abc',
      iconComp: ic('note'),
      active: () => spellcheckEnabled.value,
      run: toggleSpellcheck,
    },
    {
      key: 'pasteFormat',
      label: '粘贴格式',
      title: '粘贴格式：保留 / 纯文本 / Markdown（点击切换）',
      icon: '📋',
      iconComp: ic('import'),
      active: () => pasteFormatMode.value !== 'keep',
      run: cyclePasteFormatMode,
    },
    { key: 'div-wave20a', label: '', icon: '', kind: 'divider' },
    // —— 书写 / 结构 / 审阅 / 视图（Wave20）——
    {
      key: 'caseTransform',
      label: '大小写',
      title: '大小写转换',
      icon: 'Aa',
      iconComp: ic('fontSize'),
      kind: 'caseTransform',
    },
    {
      key: 'emphasisDot',
      label: '着重号',
      title: '中文着重号',
      icon: '••',
      iconComp: ic('highlight'),
      active: () => isActive('emphasisDot'),
      run: toggleEmphasisDot,
    },
    {
      key: 'copyMd',
      label: '复制MD',
      title: '复制为 Markdown',
      icon: 'MD',
      iconComp: ic('exportText'),
      run: copyAsMarkdown,
    },
    {
      key: 'cjkTip',
      label: '禁则',
      title: '中文禁则 / 避头尾（轻量）',
      icon: '禁',
      iconComp: ic('note'),
      run: showCjkTypographyTip,
    },
    {
      key: 'toggleBlock',
      label: '折叠',
      title: '插入折叠块',
      icon: '▸',
      iconComp: ic('outline'),
      run: insertToggleBlock,
    },
    {
      key: 'audio',
      label: '音频',
      title: '插入音频',
      icon: '♪',
      iconComp: ic('video'),
      run: insertAudioBlock,
    },
    {
      key: 'linkCard',
      label: '网页卡',
      title: '链接卡片 / 受控嵌入',
      icon: '⧉',
      iconComp: ic('link'),
      run: insertLinkCardBlock,
    },
    {
      key: 'footnote',
      label: '脚注',
      title: '插入脚注 / 打开脚注列表',
      icon: '[n]',
      iconComp: ic('note'),
      active: () => footnotePanelOpen.value,
      run: insertFootnoteAtCursor,
    },
    {
      key: 'footnoteList',
      label: '脚注区',
      title: '脚注汇总',
      icon: '脚',
      iconComp: ic('outline'),
      run: openFootnotePanel,
    },
    {
      key: 'captionNum',
      label: '题注号',
      title: '题注自动编号（图/表）',
      icon: '№',
      iconComp: ic('note'),
      run: doRenumberCaptions,
    },
    {
      key: 'qrcode',
      label: '二维码',
      title: '插入二维码',
      icon: '▦',
      iconComp: ic('attach'),
      run: insertQrCode,
    },
    {
      key: 'speak',
      label: '朗读',
      title: '朗读选区（无选区则读全文开头）',
      icon: '🔊',
      iconComp: ic('note'),
      run: speakSelection,
    },
    {
      key: 'speakStop',
      label: '停读',
      title: '停止朗读',
      icon: '⏹',
      iconComp: ic('clear'),
      run: stopSpeaking,
    },
    {
      key: 'sensitive',
      label: '敏感词',
      title: '敏感词 / 错别字提示',
      icon: '⚠',
      iconComp: ic('highlight'),
      active: () => sensitiveOn.value,
      run: toggleSensitiveCheck,
    },
    {
      key: 'revision',
      label: '修订',
      title: '单机修订高亮（相对基线）',
      icon: '✎+',
      iconComp: ic('highlight'),
      active: () => revisionOn.value,
      run: toggleRevisionHighlight,
    },
    {
      key: 'revisionBase',
      label: '基线',
      title: '重新标记修订基线',
      icon: '⚓',
      iconComp: ic('note'),
      run: resetRevisionBaseline,
    },
    {
      key: 'zoom',
      label: '缩放',
      title: '编辑区缩放',
      icon: '🔍',
      iconComp: ic('wordStats'),
      kind: 'zoom',
      active: () => editorZoom.value !== 1,
    },
    {
      key: 'viewExtras',
      label: '视图',
      title: '专注 / 暗色 / 纸张参考线',
      icon: '👁',
      iconComp: ic('outline'),
      kind: 'viewExtras',
      active: () => focusMode.value || darkEditor.value || paperGuide.value,
    },
    { key: 'div-wave21', label: '', icon: '', kind: 'divider' },
    {
      key: 'headingAutoNum',
      label: '标题号',
      title: '标题自动编号 1 / 1.1 / 1.1.1',
      icon: '1.',
      iconComp: ic('list'),
      active: () => headingAutoNumber.value,
      run: toggleHeadingAutoNumber,
    },
    {
      key: 'paraStyle',
      label: '段样式',
      title: '段落样式集',
      icon: '¶',
      iconComp: ic('fontSize'),
      kind: 'paraStyle',
      active: () => paraStyleOpen.value,
    },
    {
      key: 'listStyle',
      label: '编号样式',
      title: '有序列表编号样式 / 起始',
      icon: 'a.',
      iconComp: ic('list'),
      kind: 'listStyle',
      active: () => listStyleOpen.value,
    },
    {
      key: 'ruby',
      label: '注音',
      title: '注音 / 拼音（ruby）',
      icon: 'あ',
      iconComp: ic('fontSize'),
      run: () => { void insertRubyAnnotation() },
    },
    {
      key: 'timeline',
      label: '时间线',
      title: '插入时间线',
      icon: '⏱',
      iconComp: ic('note'),
      run: insertTimelineBlock,
    },
    {
      key: 'statusChip',
      label: '徽章',
      title: '状态徽章 Chip',
      icon: '●',
      iconComp: ic('highlight'),
      run: () => { void insertStatusChipBlock() },
    },
    {
      key: 'progressBar',
      label: '进度',
      title: '进度条',
      icon: '▮',
      iconComp: ic('wordStats'),
      run: () => { void insertProgressBarBlock() },
    },
    {
      key: 'tabsBlock',
      label: '标签页',
      title: '插入 Tabs',
      icon: '⧉',
      iconComp: ic('columns'),
      run: () => { void insertTabsBlockAtCursor() },
    },
    {
      key: 'mermaid',
      label: '流程图',
      title: 'Mermaid 流程图',
      icon: '⌥',
      iconComp: ic('code'),
      run: () => { void insertMermaidAtCursor() },
    },
    {
      key: 'xref',
      label: '交叉引用',
      title: '引用标题 / 图 / 表',
      icon: '※',
      iconComp: ic('link'),
      run: openXrefDialog,
    },
    {
      key: 'mentionBtn',
      label: '@提及',
      title: '插入 @ 提及',
      icon: '@',
      iconComp: ic('note'),
      run: insertMentionFromToolbar,
    },
    {
      key: 'tableCsv',
      label: '表CSV',
      title: '复制当前表为 CSV',
      icon: 'CSV',
      iconComp: ic('table'),
      run: () => { void copyCurrentTable('csv') },
    },
    {
      key: 'tableFilter',
      label: '表筛选',
      title: '表格行筛选',
      icon: '▽',
      iconComp: ic('table'),
      run: () => { void promptTableRowFilter() },
    },
    {
      key: 'headingCheck',
      label: '标题检',
      title: '标题层级 / 空标题检查',
      icon: 'H✓',
      iconComp: ic('outline'),
      run: runHeadingHierarchyCheck,
    },
    {
      key: 'linkCheck',
      label: '链检',
      title: '死链 / 空链检查',
      icon: '🔗✓',
      iconComp: ic('link'),
      run: runDeadLinkCheck,
    },
    {
      key: 'readTime',
      label: '时长',
      title: '阅读时长估算',
      icon: '⌛',
      iconComp: ic('wordStats'),
      run: openReadTimeDialog,
    },
    {
      key: 'immersive',
      label: '全屏',
      title: '全屏沉浸编辑（Esc 退出）',
      icon: '⛶',
      iconComp: ic('outline'),
      active: () => immersiveFullscreen.value,
      run: toggleImmersiveFullscreen,
    },
    {
      key: 'snippets',
      label: '片段',
      title: '文本片段 Snippets',
      icon: '✂',
      iconComp: ic('note'),
      run: openSnippetDialog,
    },
    {
      key: 'wordStats',
      label: '字数',
      title: '字数统计',
      icon: '∑',
      iconComp: ic('wordStats'),
      kind: 'wordStats',
      active: () => wordStatsOpen.value,
    },
    {
      key: 'outline',
      label: '大纲',
      title: '标题大纲导航',
      icon: '☰',
      iconComp: ic('outline'),
      active: () => outlineOpen.value,
      run: toggleOutlinePanel,
    },
    {
      key: 'shortcuts',
      label: '快捷键',
      title: '快捷键速查',
      icon: '⌨',
      iconComp: ic('shortcuts'),
      kind: 'shortcuts',
      active: () => shortcutsOpen.value,
      run: toggleShortcutsPanel,
    },
    { key: 'import', label: '导入', icon: '⇪▾', iconComp: ic('import'), kind: 'import', run: onImport },
    { key: 'export', label: '导出', icon: '⇩▾', iconComp: ic('export'), kind: 'export', run: onExportMenu },
    // 草稿备份：按产品要求先隐藏入口（保留 onDraftBackup 逻辑）
    // { key: 'draft', label: '草稿备份', icon: '⏱', run: onDraftBackup },
  ]
})

/**
 * 仅最大化（expanded）时展示：不进紧凑顶栏，也不进「更多」。
 * 导入 / 导出等同款；「更改」若后续加回工具条，请放入此集合。
 */
const EXPANDED_ONLY_KEYS = new Set(['import', 'export'])

/** 顶栏：飞书式主栏；最大化时主栏后换行接高级工具 */
const visibleTools = computed((): ToolItem[] => {
  const all = allTools.value
  const byKey = new Map(all.map((tool) => [tool.key, tool]))
  const primary: ToolItem[] = []
  let divN = 0
  for (const key of FEISHU_PRIMARY_ORDER) {
    if (key === '__div') {
      divN += 1
      primary.push({
        key: `div-primary-${divN}`,
        label: '',
        icon: '',
        kind: 'divider',
      })
      continue
    }
    const tool = byKey.get(key)
    if (tool) primary.push(tool)
  }
  if (!props.expanded) return primary
  const advanced = collapseToolbarDividers(
    all.filter((tool) => !PRIMARY_KEYS.has(tool.key)),
  )
  if (!advanced.length) return primary
  return [
    ...primary,
    { key: 'div-tier', label: '', icon: '', kind: 'divider' },
    ...advanced,
  ] as ToolItem[]
})

/** 收起模式下「更多」下拉内容 */
const moreTools = computed(() => {
  if (props.expanded) return [] as ToolItem[]
  return allTools.value.filter(
    (t) =>
      t.kind !== 'divider' &&
      !PRIMARY_KEYS.has(t.key) &&
      !EXPANDED_ONLY_KEYS.has(t.key),
  )
})

function closeMore() {
  moreOpen.value = false
  moreColorOpen.value = false
  moreHighlightOpen.value = false
  moreFormOpen.value = false
  moreTemplateOpen.value = false
  moreFontSizeOpen.value = false
  moreFontFamilyOpen.value = false
  moreLineHeightOpen.value = false
  moreCalloutOpen.value = false
  customColorOpen.value = false
  // 表情/特殊字符/段距/字数/分栏/快捷键是独立浮层：可能刚从「更多」接力打开，勿连带关掉
}

function onRootMouseDown(event: MouseEvent) {
  event.stopPropagation()
}

/**
 * 程序化聚焦到文末（供 maximize / 父组件调用）。
 * 注意：不要在画布 click 上无条件调用，否则会把单元格内刚点中的光标拽到文档末尾。
 */
function focusEditor() {
  editor.value?.commands.focus('end')
}

/** 仅点击编辑器空白衬底时聚焦文末；点到 ProseMirror / 表格单元格则保留原生选区 */
function onCanvasClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return
  // 标题输入框已 @click.stop；此处再兜底一次
  if (target.closest('.rte-title')) return
  // 点在可编辑区（含 table td/th、.tableWrapper）内：不要抢走选区
  if (target.closest('.ProseMirror, .tiptap, .rte-body')) return
  editor.value?.commands.focus('end')
}

defineExpose({ focusEditor, editor, onDraftBackup, openRtePrompt, openRteConfirm })
</script>

<template>
  <div
    ref="rteRootEl"
    class="rte-root"
    :class="{
      compact,
      expanded,
      'has-title': showTitle,
      'has-form-inspector': showFormInspector,
      'mode-edit': viewMode === 'edit',
      'mode-preview': viewMode === 'preview',
      'mode-source': viewMode === 'source',
      'is-focus-mode': focusMode,
      'is-dark-editor': darkEditor,
      'is-heading-auto-num': headingAutoNumber,
      'is-immersive': immersiveFullscreen,
      'is-paper-guide': paperGuide,
      'is-table-sticky': tableHeaderSticky,
      'is-cjk-typography': true,
    }"
    @mousedown="onRootMouseDown"
    @keydown="onImmersiveKeydown"
  >
    <p v-if="!editorReady" class="rte-boot" role="status">正在加载编辑器…</p>
    <p v-else-if="editorBootError" class="rte-boot is-error" role="alert">{{ editorBootError }}</p>
    <div
      class="rte-toolbar"
      role="toolbar"
      aria-label="编辑工具栏"
    >
      <div class="rte-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ rteAriaStatus }}
      </div>
      <div class="rte-toolbar-tools">
      <template v-for="t in visibleTools" :key="t.key">
        <div
          v-if="t.kind === 'heading'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('heading')"
          @mouseleave="onToolMenuLeave($event, 'heading', () => (headingOpen = false))"
        >
          <button
            type="button"
            class="rte-tool is-labeled"
            :ref="(el) => setFloatAnchor('heading', el)"
            data-rte-anchor="heading"
            :class="{ active: headingOpen || isActive('heading') || isActive('blockquote') }"
            :title="'段落样式：' + currentParaStyleLabel"
            aria-label="段落样式"
            :aria-expanded="headingOpen"
            aria-haspopup="menu"
            @click.stop="openHeadingMenu()"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('heading')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >{{ currentParaStyleLabel }}<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="headingOpen"
              class="rte-menu rte-para-menu"
              v-rte-float="'heading'"
              role="menu"
              aria-label="段落样式"
              @mousedown.prevent
              @keydown="onHeadingMenuKeydown"
              @mouseenter="onToolMenuEnter('heading')"
              @mouseleave="onToolMenuLeave($event, 'heading', () => (headingOpen = false))"
            >
              <template v-for="(it, idx) in PARA_STYLE_ITEMS" :key="it.id">
                <div
                  v-if="idx === 0 || it.group !== PARA_STYLE_ITEMS[idx - 1]!.group"
                  class="rte-menu-section-label"
                >
                  {{
                    it.group === 'text'
                      ? '文本'
                      : it.group === 'heading'
                        ? '标题'
                        : '块'
                  }}
                </div>
                <button
                  type="button"
                  role="menuitemradio"
                  :data-para-style="it.id"
                  :aria-checked="isParaStyleActive(it.id)"
                  :class="{
                    active: isParaStyleActive(it.id),
                    'is-focused': headingFocusIndex === idx,
                    'is-quote': it.id === 'blockquote',
                  }"
                  :tabindex="headingFocusIndex === idx ? 0 : -1"
                  @mouseenter="headingFocusIndex = idx"
                  @click="applyParaStyle(it.id)"
                >
                  <span
                    class="rte-para-preview"
                    :class="'rte-para-preview--' + it.id"
                    :style="{
                      fontSize: it.fontSize,
                      fontWeight: it.fontWeight,
                      paddingLeft: it.indent + 'px',
                    }"
                  >{{ it.sample }}</span>
                  <span v-if="it.shortcut" class="rte-para-shortcut">{{ it.shortcut }}</span>
                </button>
              </template>
              <div class="rte-menu-section-label">引用样式</div>
              <button
                v-for="qs in QUOTE_STYLE_OPTIONS"
                :key="'qs-' + qs.value"
                type="button"
                role="menuitemradio"
                :aria-checked="isActive('blockquote') && currentQuoteStyle() === qs.value"
                :class="{ active: isActive('blockquote') && currentQuoteStyle() === qs.value }"
                :title="qs.hint"
                @click="applyQuoteStyle(qs.value)"
              >
                <span class="rte-para-preview" :class="'rte-quote-preview--' + qs.value">{{ qs.label }}</span>
                <span class="rte-para-shortcut">{{ qs.hint }}</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'list'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('list')"
          @mouseleave="onToolMenuLeave($event, 'list', () => (listOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('list', el)" data-rte-anchor="list"
            :class="{
              active:
                isActive('bulletList') ||
                isActive('orderedList') ||
                isActive('taskList'),
            }"
            :title="isActive('taskList') ? '任务列表' : isActive('orderedList') ? '有序列表' : isActive('bulletList') ? '无序列表' : '列表（无序 / 有序 / 任务）'"
            :aria-label="isActive('taskList') ? '任务列表' : isActive('orderedList') ? '有序列表' : isActive('bulletList') ? '无序列表' : '列表'"
            aria-haspopup="menu"
            :aria-expanded="listOpen"
            :aria-pressed="isActive('bulletList') || isActive('orderedList') || isActive('taskList')"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); closeFontMenus(); headingOpen = false; formOpen = false; templateOpen = false; alignOpen = false; listOpen = !listOpen"
          >
            <span class="rte-tool-icon">
              <component
                :is="isActive('taskList') ? toolIcon('listTask') : isActive('orderedList') ? toolIcon('listOrdered') : toolIcon('list')"
                class="rte-ep-icon"
              />
            </span>
            <span class="rte-tool-label"
              >列表<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="listOpen"
              class="rte-menu"
              v-rte-float="'list'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('list')"
              @mouseleave="onToolMenuLeave($event, 'list', () => (listOpen = false))"
            >
              <button
                type="button"
                :class="{ active: isActive('bulletList') }"
                @click="toggleBulletList(); listOpen = false"
              >
                无序列表
              </button>
              <button
                type="button"
                :class="{ active: isActive('orderedList') }"
                @click="toggleOrderedList(); listOpen = false"
              >
                有序列表
              </button>
              <button
                type="button"
                :class="{ active: isActive('taskList') }"
                @click="toggleTaskList(); listOpen = false"
              >
                任务列表
              </button>
              <div class="rte-menu-sep" aria-hidden="true" />
              <div v-if="listDepthLabel" class="rte-menu-hint">{{ listDepthLabel }}</div>
              <div class="rte-menu-hint">Tab / Shift+Tab 调整层级</div>
              <button
                type="button"
                @click="indentBlock(); listOpen = false"
              >
                增加缩进
              </button>
              <button
                type="button"
                @click="outdentBlock(); listOpen = false"
              >
                减少缩进
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'form'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('form')"
          @mouseleave="onToolMenuLeave($event, 'form', () => (formOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('form', el)" data-rte-anchor="form"
            :class="{
              active:
                formOpen ||
                isActive('formTextInput') ||
                isActive('formRadioGroup') ||
                isActive('formCheckboxGroup') ||
                isActive('formSelect') ||
                isActive('formTextarea') ||
                isActive('formNumberInput') ||
                isActive('formDateInput') ||
                isActive('formSwitch'),
            }"
            title="表单"
            aria-label="插入表单控件"
            aria-haspopup="menu"
            :aria-expanded="formOpen"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); headingOpen = false; listOpen = false; templateOpen = false; alignOpen = false; formOpen = !formOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('form')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >表单<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="formOpen"
              class="rte-menu"
              v-rte-float="'form'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('form')"
              @mouseleave="onToolMenuLeave($event, 'form', () => (formOpen = false))"
            >
              <button type="button" @click.stop="insertFormRadio()">
                单选组
              </button>
              <button type="button" @click.stop="insertFormCheckbox()">
                多选组
              </button>
              <button type="button" @click.stop="insertFormText()">
                文本输入
              </button>
              <button type="button" @click.stop="insertFormTextarea()">
                多行文本
              </button>
              <button type="button" @click.stop="insertFormNumber()">
                数字输入
              </button>
              <button type="button" @click.stop="insertFormSelect()">
                下拉选择
              </button>
              <button type="button" @click.stop="insertFormDate()">
                日期
              </button>
              <button type="button" @click.stop="insertFormDateTime()">
                日期时间
              </button>
              <button type="button" @click.stop="insertFormSwitch()">
                开关
              </button>
              <div class="rte-menu-sep" aria-hidden="true" />
              <button type="button" @click.stop="formOpen = false; openTableDialog()">
                表格
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'template'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('template')"
          @mouseleave="onToolMenuLeave($event, 'template', () => (templateOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('template', el)" data-rte-anchor="template"
            :class="{ active: templateOpen }"
            title="插入模板"
            aria-label="插入模板"
            aria-haspopup="menu"
            :aria-expanded="templateOpen"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); headingOpen = false; listOpen = false; formOpen = false; alignOpen = false; templateOpen = !templateOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('template')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >模板<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="templateOpen"
              class="rte-menu rte-template-menu"
              v-rte-float="'template'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('template')"
              @mouseleave="onToolMenuLeave($event, 'template', () => (templateOpen = false))"
            >
              <div class="rte-template-menu-body">
                <template v-for="g in RTE_DOC_TEMPLATE_GROUPS" :key="g.id">
                  <div class="rte-menu-section-label">{{ g.label }}</div>
                  <div class="rte-template-grid">
                    <button
                      v-for="tpl in RTE_DOC_TEMPLATES.filter((x) => x.group === g.id)"
                      :key="tpl.id"
                      type="button"
                      class="rte-template-item"
                      :title="tpl.description || tpl.label"
                      @click.stop="insertDocTemplate(tpl.id)"
                    >
                      <span class="rte-template-item-label">{{ tpl.label }}</span>
                      <span v-if="tpl.description" class="rte-template-item-desc">{{
                        tpl.description
                      }}</span>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'highlight'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('highlight')"
          @mouseleave="onToolMenuLeave($event, 'highlight', () => (highlightOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('highlight', el)" data-rte-anchor="highlight"
            :class="{ active: isActive('highlight') || highlightOpen }"
            title="高亮颜色"
            aria-label="高亮颜色"
            :aria-expanded="highlightOpen"
            aria-haspopup="dialog"
            @click.stop="markToolbarMenuOpening(); toggleHighlightMenu()"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('highlight')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">高亮</span>
          </button>
          <Teleport to="body">
            <div
              v-if="highlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu"
              role="dialog"
              aria-label="高亮颜色"
              v-rte-float="'highlight'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('highlight')"
              @mouseleave="onToolMenuLeave($event, 'highlight', () => (highlightOpen = false))"
            >
              <div class="rte-hl-current" aria-live="polite">
                当前：{{ currentHighlightLabel() }}
              </div>
              <button
                type="button"
                class="rte-color-action rte-hl-clear"
                :class="{ selected: !isActive('highlight') }"
                title="清除高亮"
                aria-label="清除高亮"
                @click="applyHighlightColor('')"
              >
                清除高亮
              </button>
              <div class="rte-color-section-label">常用底色</div>
              <div
                class="rte-highlight-swatches"
                role="listbox"
                aria-label="常用高亮底色"
              >
                <button
                  v-for="h in WORD_HIGHLIGHT_SOFT"
                  :key="'hl-s-' + h.color"
                  type="button"
                  role="option"
                  class="rte-swatch rte-hl-swatch"
                  :class="{
                    selected: colorsEqual(currentHighlightColor(), h.color),
                    'is-light': isLightHighlight(h.color),
                  }"
                  :style="{ background: h.color }"
                  :title="h.label"
                  :aria-label="h.label"
                  :aria-selected="colorsEqual(currentHighlightColor(), h.color)"
                  @mouseenter="highlightHoverLabel = h.label"
                  @mouseleave="highlightHoverLabel = ''"
                  @click="applyHighlightColor(h.color)"
                />
              </div>
              <div class="rte-color-section-label">荧光笔</div>
              <div
                class="rte-highlight-swatches"
                role="listbox"
                aria-label="荧光笔颜色"
              >
                <button
                  v-for="h in WORD_HIGHLIGHT_VIVID"
                  :key="'hl-v-' + h.color"
                  type="button"
                  role="option"
                  class="rte-swatch rte-hl-swatch"
                  :class="{
                    selected: colorsEqual(currentHighlightColor(), h.color),
                    'is-light': isLightHighlight(h.color),
                  }"
                  :style="{ background: h.color }"
                  :title="h.label"
                  :aria-label="h.label"
                  :aria-selected="colorsEqual(currentHighlightColor(), h.color)"
                  @mouseenter="highlightHoverLabel = h.label"
                  @mouseleave="highlightHoverLabel = ''"
                  @click="applyHighlightColor(h.color)"
                />
              </div>
              <div class="rte-color-sep" />
              <button
                type="button"
                class="rte-color-action"
                :aria-expanded="customHighlightOpen"
                @click.stop="customHighlightOpen = !customHighlightOpen"
              >
                自定义颜色…
              </button>
              <div v-if="customHighlightOpen" class="rte-custom-color" @click.stop>
                <input
                  v-model="customHighlightHex"
                  type="color"
                  class="rte-custom-color-native"
                  title="选取高亮色"
                  aria-label="选取高亮色"
                  @input="onCustomHighlightNativeInput"
                />
                <input
                  v-model="customHighlightHex"
                  type="text"
                  class="rte-custom-color-hex"
                  maxlength="7"
                  placeholder="#FFF3BF"
                  aria-label="高亮色十六进制"
                  @keydown.enter.prevent="applyCustomHighlight"
                />
                <button
                  type="button"
                  class="rte-custom-color-ok"
                  @click="applyCustomHighlight"
                >
                  确定
                </button>
              </div>
              <div class="rte-hl-hover-hint" aria-hidden="true">
                {{ highlightHoverLabel || '悬停色块可预览名称' }}
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'color'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('color')"
          @mouseleave="onToolMenuLeave($event, 'color', closeColorMenus)"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('color', el)" data-rte-anchor="color"
            :class="{ active: colorOpen }"
            title="文字颜色"
            aria-label="文字颜色"
            :aria-expanded="colorOpen"
            aria-haspopup="dialog"
            @click.stop="markToolbarMenuOpening(); toggleColorMenu()"
          >
            <span
              class="rte-tool-icon rte-color-icon"
              :style="{ textDecorationColor: currentTextColor() || '#1d2129' }"
            >
              <component :is="toolIcon('color')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">颜色</span>
          </button>
          <Teleport to="body">
            <div
              v-if="colorOpen"
              class="rte-menu rte-color-menu"
              v-rte-float="'color'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('color')"
              @mouseleave="onToolMenuLeave($event, 'color', closeColorMenus)"
            >
            <button
              type="button"
              class="rte-color-action"
              :class="{ selected: !currentTextColor() }"
              @click="applyTextColor('')"
            >
              自动
            </button>
            <div class="rte-color-section-label">主题颜色</div>
            <div class="rte-theme-grid">
              <button
                v-for="(c, i) in WORD_THEME_FLAT"
                :key="'th-' + i + '-' + c"
                type="button"
                class="rte-swatch"
                :class="{
                  selected: colorsEqual(currentTextColor(), c),
                  'is-light': c === '#FFFFFF' || c.toLowerCase() === '#ffffff',
                }"
                :style="{ background: c }"
                :title="c"
                @click="applyTextColor(c)"
              />
            </div>
            <div class="rte-color-section-label">标准颜色</div>
            <div class="rte-standard-row" role="listbox" aria-label="标准文字颜色">
              <button
                v-for="item in WORD_STANDARD_COLOR_ITEMS"
                :key="'st-' + item.color"
                type="button"
                role="option"
                class="rte-swatch"
                :class="{
                  selected: colorsEqual(currentTextColor(), item.color),
                  'is-light': isLightHighlight(item.color),
                }"
                :style="{ background: item.color }"
                :title="item.label"
                :aria-label="item.label"
                :aria-selected="colorsEqual(currentTextColor(), item.color)"
                @mouseenter="colorHoverLabel = item.label"
                @mouseleave="colorHoverLabel = ''"
                @click="applyTextColor(item.color)"
              />
            </div>
            <div class="rte-hl-hover-hint" aria-hidden="true">
              {{ colorHoverLabel || '悬停色块可预览名称' }}
            </div>
            <div class="rte-color-sep" />
            <button
              type="button"
              class="rte-color-action"
              @click.stop="customColorOpen = !customColorOpen"
            >
              其他颜色…
            </button>
            <div v-if="customColorOpen" class="rte-custom-color" @click.stop>
              <input
                v-model="customColorHex"
                type="color"
                class="rte-custom-color-native"
                title="选取颜色"
                @input="onCustomColorNativeInput"
              />
              <input
                v-model="customColorHex"
                type="text"
                class="rte-custom-color-hex"
                maxlength="7"
                placeholder="#165dff"
                @keydown.enter.prevent="applyCustomColor"
              />
              <button
                type="button"
                class="rte-custom-color-ok"
                @click="applyCustomColor"
              >
                确定
              </button>
            </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'fontSize'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('fontSize')"
          @mouseleave="onToolMenuLeave($event, 'fontSize', () => (fontSizeOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('fontSize', el)" data-rte-anchor="fontSize"
            :class="{ active: fontSizeOpen || !!currentFontSize() }"
            title="字号"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); fontFamilyOpen = false; lineHeightOpen = false; moreFontSizeOpen = false; moreFontFamilyOpen = false; moreLineHeightOpen = false; headingOpen = false; listOpen = false; formOpen = false; templateOpen = false; alignOpen = false; fontSizeOpen = !fontSizeOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >字号<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="fontSizeOpen"
              class="rte-menu"
              v-rte-float="'fontSize'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('fontSize')"
              @mouseleave="onToolMenuLeave($event, 'fontSize', () => (fontSizeOpen = false))"
            >
              <button
                v-for="opt in FONT_SIZE_OPTIONS"
                :key="'fs-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (currentFontSize() || '') }"
                @click="applyFontSize(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'fontFamily'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('fontFamily')"
          @mouseleave="onToolMenuLeave($event, 'fontFamily', () => (fontFamilyOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('fontFamily', el)" data-rte-anchor="fontFamily"
            :class="{ active: fontFamilyOpen || !!currentFontFamily() }"
            title="字体"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); fontSizeOpen = false; lineHeightOpen = false; moreFontSizeOpen = false; moreFontFamilyOpen = false; moreLineHeightOpen = false; headingOpen = false; listOpen = false; formOpen = false; templateOpen = false; alignOpen = false; fontFamilyOpen = !fontFamilyOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('fontFamily')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >字体<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="fontFamilyOpen"
              class="rte-menu rte-font-family-menu"
              v-rte-float="'fontFamily'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('fontFamily')"
              @mouseleave="onToolMenuLeave($event, 'fontFamily', () => (fontFamilyOpen = false))"
            >
              <button
                v-for="opt in FONT_FAMILY_OPTIONS"
                :key="'ff-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (currentFontFamily() || '') }"
                :style="opt.value ? { fontFamily: opt.value } : undefined"
                @click="applyFontFamily(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'lineHeight'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('lineHeight')"
          @mouseleave="onToolMenuLeave($event, 'lineHeight', () => (lineHeightOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('lineHeight', el)" data-rte-anchor="lineHeight"
            :class="{ active: lineHeightOpen || !!currentLineHeight() }"
            title="行距"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); fontSizeOpen = false; fontFamilyOpen = false; moreFontSizeOpen = false; moreFontFamilyOpen = false; moreLineHeightOpen = false; headingOpen = false; listOpen = false; formOpen = false; templateOpen = false; alignOpen = false; lineHeightOpen = !lineHeightOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('lineHeight')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >行距<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="lineHeightOpen"
              class="rte-menu"
              v-rte-float="'lineHeight'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('lineHeight')"
              @mouseleave="onToolMenuLeave($event, 'lineHeight', () => (lineHeightOpen = false))"
            >
              <button
                v-for="opt in LINE_HEIGHT_OPTIONS"
                :key="'lh-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (currentLineHeight() || '') }"
                @click="applyLineHeight(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'align'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('align')"
          @mouseleave="onToolMenuLeave($event, 'align', () => (alignOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('align', el)" data-rte-anchor="align"
            :class="{
              active:
                isActive({ textAlign: 'center' }) ||
                isActive({ textAlign: 'right' }) ||
                isActive({ textAlign: 'justify' }),
            }"
            title="对齐"
            aria-label="对齐"
            aria-haspopup="menu"
            :aria-expanded="alignOpen"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); closeFontMenus(); headingOpen = false; listOpen = false; formOpen = false; templateOpen = false; alignOpen = !alignOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('align')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">对齐</span>
          </button>
          <Teleport to="body">
            <div
              v-if="alignOpen"
              class="rte-menu"
              v-rte-float="'align'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('align')"
              @mouseleave="onToolMenuLeave($event, 'align', () => (alignOpen = false))"
            >
              <button type="button" @click="setAlign('left'); alignOpen = false">
                左对齐
              </button>
              <button type="button" @click="setAlign('center'); alignOpen = false">
                居中
              </button>
              <button type="button" @click="setAlign('right'); alignOpen = false">
                右对齐
              </button>
              <button type="button" @click="setAlign('justify'); alignOpen = false">
                两端对齐
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'divider'"
          class="rte-tool-divider"
          :class="{ 'is-tier': t.key === 'div-tier' }"
          aria-hidden="true"
        />
        <div
          v-else-if="t.kind === 'table'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('table')"
          @mouseleave="onToolMenuLeave($event, 'table', closeTableMenu)"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('table', el)" data-rte-anchor="table"
            :class="{ active: tableMenuOpen || tableDialogOpen || isInTable() }"
            :title="isInTable() ? '表格操作' : '插入表格'"
            :aria-haspopup="isInTable() ? 'menu' : 'dialog'"
            :aria-expanded="isInTable() ? tableMenuOpen : undefined"
            @click.stop="markToolbarMenuOpening(); onTableToolbarButtonClick()"
          >
            <span class="rte-tool-icon">
              <component
                :is="t.iconComp || toolIcon('table')"
                class="rte-ep-icon"
              />
            </span>
            <span class="rte-tool-label"
              >表格<span
                v-if="isInTable()"
                class="rte-caret"
                aria-hidden="true"
              ></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="tableMenuOpen && isInTable()"
              class="rte-menu rte-table-menu"
              v-rte-float="'table'"
              role="menu"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('table')"
              @mouseleave="onToolMenuLeave($event, 'table', closeTableMenu)"
            >
              <template v-for="op in tableOpItems" :key="op.key">
                <div v-if="op.sepBefore" class="rte-menu-sep" aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  :class="{ danger: op.danger }"
                  :disabled="op.disabled?.()"
                  @click="op.run()"
                >
                  {{ op.label }}
                </button>
              </template>
              <div class="rte-menu-sep" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                @click="closeTableMenu(); openTableDialog()"
              >
                插入表格
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'import'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('import')"
          @mouseleave="onToolMenuLeave($event, 'import', closeImportMenu)"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('import', el)" data-rte-anchor="import"
            :class="{ active: importMenuOpen }"
            title="导入"
            @click.stop="markToolbarMenuOpening(); importMenuOpen = !importMenuOpen"
          >
            <span class="rte-tool-icon">
              <component
                :is="t.iconComp || toolIcon('import')"
                class="rte-ep-icon"
              />
            </span>
            <span class="rte-tool-label"
              >导入<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="importMenuOpen"
              class="rte-import-menu"
              v-rte-float="'import'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('import')"
              @mouseleave="onToolMenuLeave($event, 'import', closeImportMenu)"
            >
              <button type="button" class="rte-import-item" @click.stop="pickImportDocument">
                <span class="rte-import-left">
                  <component :is="toolIcon('importDoc')" class="rte-ep-icon" />
                  <span>导入文档</span>
                </span>
                <span class="rte-import-pill">MD/Doc</span>
              </button>
              <button type="button" class="rte-import-item" @click.stop="openImportLinkDialog">
                <span class="rte-import-left">
                  <component :is="toolIcon('importLink')" class="rte-ep-icon" />
                  <span>导入链接</span>
                </span>
                <span class="rte-import-pill">公众号</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'export'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('export')"
          @mouseleave="onToolMenuLeave($event, 'export', closeExportMenu)"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('export', el)" data-rte-anchor="export"
            :class="{ active: exportMenuOpen }"
            title="导出"
            @click.stop="markToolbarMenuOpening(); exportMenuOpen = !exportMenuOpen"
          >
            <span class="rte-tool-icon">
              <component
                :is="t.iconComp || toolIcon('export')"
                class="rte-ep-icon"
              />
            </span>
            <span class="rte-tool-label"
              >导出<span class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div
              v-if="exportMenuOpen"
              class="rte-import-menu"
              v-rte-float="'export'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('export')"
              @mouseleave="onToolMenuLeave($event, 'export', closeExportMenu)"
            >
              <button type="button" class="rte-import-item" @click.stop="exportAsHtml">
                <span class="rte-import-left">
                  <component :is="toolIcon('exportHtml')" class="rte-ep-icon" />
                  <span>导出 HTML</span>
                </span>
                <span class="rte-import-pill">.html</span>
              </button>
              <button type="button" class="rte-import-item" @click.stop="exportAsPlainText">
                <span class="rte-import-left">
                  <component :is="toolIcon('exportText')" class="rte-ep-icon" />
                  <span>导出纯文本</span>
                </span>
                <span class="rte-import-pill">.txt</span>
              </button>
              <button type="button" class="rte-import-item" @click.stop="exportAsMarkdown">
                <span class="rte-import-left">
                  <component :is="toolIcon('exportText')" class="rte-ep-icon" />
                  <span>导出 Markdown</span>
                </span>
                <span class="rte-import-pill">.md</span>
              </button>
              <button
                type="button"
                class="rte-import-item"
                :disabled="exportBusy"
                @click.stop="exportAsPng"
              >
                <span class="rte-import-left">
                  <component :is="toolIcon('exportPng')" class="rte-ep-icon" />
                  <span>{{ exportBusy ? '导出中…' : '导出图片' }}</span>
                </span>
                <span class="rte-import-pill">PNG</span>
              </button>
              <button
                type="button"
                class="rte-import-item"
                :disabled="exportBusy"
                @click.stop="exportAsPdf"
              >
                <span class="rte-import-left">
                  <component :is="toolIcon('exportPdf')" class="rte-ep-icon" />
                  <span>{{ exportBusy ? '导出中…' : '导出 PDF' }}</span>
                </span>
                <span class="rte-import-pill">.pdf</span>
              </button>
              <button
                type="button"
                class="rte-import-item"
                :disabled="exportBusy"
                @click.stop="exportAsDocx"
              >
                <span class="rte-import-left">
                  <component :is="toolIcon('exportDocx')" class="rte-ep-icon" />
                  <span>{{ exportBusy ? '导出中…' : '导出 Word' }}</span>
                </span>
                <span class="rte-import-pill">.docx</span>
              </button>
            </div>
          </Teleport>
        </div>
        <button
          v-else-if="t.kind === 'attach'"
          type="button"
          class="rte-tool"
          :class="{ active: attachDialogOpen }"
          :title="t.title || t.label"
          :aria-label="t.title || t.label"
          aria-haspopup="dialog"
          @click="t.run?.()"
        >
          <span class="rte-tool-icon">
            <component
              :is="t.iconComp || toolIcon('attach')"
              class="rte-ep-icon"
            />
            <span class="rte-caret rte-caret-on-icon" aria-hidden="true"></span>
          </span>
          <span class="rte-tool-label">附件</span>
        </button>
        <div
          v-else-if="t.kind === 'code'"
          class="rte-tool-wrap rte-code-tool-wrap"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{ active: t.active?.() }"
            :title="t.title || t.label"
            :aria-label="t.title || t.label"
            @click="t.run?.()"
          >
            <span class="rte-tool-icon">
              <component
                v-if="t.iconComp"
                :is="t.iconComp"
                class="rte-ep-icon"
              />
              <template v-else>{{ t.icon }}</template>
            </span>
            <span class="rte-tool-label">{{ t.label }}</span>
          </button>
          <div
            v-if="isActive('codeBlock')"
            class="rte-code-lang-wrap"
            @mouseenter="onToolMenuEnter('codeLang')"
            @mouseleave="onToolMenuLeave($event, 'codeLang', () => (codeLangOpen = false))"
          >
            <button
              type="button"
              class="rte-code-lang-btn"
              :ref="(el) => setFloatAnchor('codeLang', el)"
              data-rte-anchor="codeLang"
              :class="{ active: codeLangOpen }"
              title="代码语言"
              aria-label="代码语言"
              :aria-expanded="codeLangOpen"
              aria-haspopup="listbox"
              @mousedown.prevent
              @click.stop="markToolbarMenuOpening(); codeLangOpen = !codeLangOpen"
            >
              {{ codeLanguageLabel(currentCodeLanguage()) }}
              <span class="rte-caret" aria-hidden="true"></span>
            </button>
            <Teleport to="body">
              <div
                v-if="codeLangOpen"
                class="rte-menu rte-code-lang-menu"
                role="listbox"
                aria-label="代码语言"
                v-rte-float="'codeLang'"
                @mousedown.prevent
                @mouseenter="onToolMenuEnter('codeLang')"
                @mouseleave="onToolMenuLeave($event, 'codeLang', () => (codeLangOpen = false))"
              >
                <button
                  v-for="opt in CODE_LANG_OPTIONS"
                  :key="'cl-' + opt.value"
                  type="button"
                  role="option"
                  :class="{ active: currentCodeLanguage() === opt.value }"
                  :aria-selected="currentCodeLanguage() === opt.value"
                  @click="applyCodeLanguage(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </Teleport>
          </div>
          <button
            v-if="isActive('codeBlock')"
            type="button"
            class="rte-code-copy-btn"
            title="复制代码块"
            aria-label="复制代码块"
            @mousedown.prevent
            @click="copyActiveCodeBlock"
          >
            复制
          </button>
        </div>
        <div
          v-else-if="t.kind === 'emoji'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('emoji')"
          @mouseleave="onToolMenuLeave($event, 'emoji', () => (emojiOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('emoji', el)"
            data-rte-anchor="emoji"
            :class="{ active: emojiOpen }"
            title="表情"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); closeFontMenus(); specialCharsOpen = false; emojiOpen = !emojiOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('emoji')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">表情<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="emojiOpen"
              class="rte-emoji-panel"
              v-rte-float="'emoji'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('emoji')"
              @mouseleave="onToolMenuLeave($event, 'emoji', () => (emojiOpen = false))"
            >
              <div class="rte-picker-tabs" role="tablist" aria-label="表情分类">
                <button
                  v-for="cat in RTE_EMOJI_CATEGORIES"
                  :key="'em-tab-' + cat.id"
                  type="button"
                  role="tab"
                  class="rte-picker-tab"
                  :class="{ active: emojiTabId === cat.id }"
                  :aria-selected="emojiTabId === cat.id"
                  @click.stop="emojiTabId = cat.id"
                >{{ cat.label }}</button>
              </div>
              <div
                class="rte-picker-grid rte-emoji-grid"
                :class="{ 'rte-emoji-grid--large': isLargeEmojiTab, 'rte-emoji-grid--kaomoji': isKaomojiTab }"
                role="tabpanel"
              >
                <button
                  v-for="em in activeEmojiList"
                  :key="'em-' + emojiTabId + '-' + em"
                  type="button"
                  class="rte-emoji-btn"
                  :class="{ 'rte-emoji-btn--kaomoji': isKaomojiTab || em.includes('(') || em.includes('¯') || em.includes('∠') }"
                  :title="em"
                  @click="insertEmoji(em)"
                >{{ em }}</button>
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'specialChars'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('specialChars')"
          @mouseleave="onToolMenuLeave($event, 'specialChars', () => (specialCharsOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('specialChars', el)"
            data-rte-anchor="specialChars"
            :class="{ active: specialCharsOpen }"
            title="字符"
            @click.stop="markToolbarMenuOpening(); closeColorMenus(); closeHighlightMenus(); closeFontMenus(); emojiOpen = false; specialCharsOpen = !specialCharsOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('specialChars')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">字符<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="specialCharsOpen"
              class="rte-specialchars-panel"
              v-rte-float="'specialChars'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('specialChars')"
              @mouseleave="onToolMenuLeave($event, 'specialChars', () => (specialCharsOpen = false))"
            >
              <div class="rte-picker-tabs" role="tablist" aria-label="字符分类">
                <button
                  v-for="cat in RTE_SPECIAL_CHAR_CATEGORIES"
                  :key="'sc-tab-' + cat.id"
                  type="button"
                  role="tab"
                  class="rte-picker-tab"
                  :class="{ active: specialCharTabId === cat.id }"
                  :aria-selected="specialCharTabId === cat.id"
                  @click.stop="specialCharTabId = cat.id"
                >{{ cat.label }}</button>
              </div>
              <div class="rte-picker-grid rte-specialchars-grid" role="tabpanel">
                <button
                  v-for="ch in activeSpecialCharList"
                  :key="'sc-' + specialCharTabId + '-' + ch"
                  type="button"
                  class="rte-specialchars-btn"
                  :title="ch"
                  @click="insertSpecialChar(ch)"
                >{{ ch }}</button>
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'columns'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('columns')"
          @mouseleave="onToolMenuLeave($event, 'columns', () => (columnsOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('columns', el)"
            data-rte-anchor="columns"
            :class="{ active: columnsOpen || isActive('columns') }"
            title="多栏布局（2–6 栏）"
            @click.stop="markToolbarMenuOpening(); columnsOpen = !columnsOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('columns')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">分栏<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="columnsOpen"
              class="rte-menu rte-columns-menu"
              v-rte-float="'columns'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('columns')"
              @mouseleave="onToolMenuLeave($event, 'columns', () => (columnsOpen = false))"
            >
              <template v-for="(it, idx) in COLUMN_MENU_ITEMS" :key="idx">
                <div v-if="it.type === 'label'" class="rte-menu-section-label">{{ it.text }}</div>
                <div v-else-if="it.type === 'sep'" class="rte-menu-sep" aria-hidden="true" />
                <button
                  v-else
                  type="button"
                  @click="insertColumns(it.cols, it.ratios)"
                >
                  {{ it.label }}
                </button>
              </template>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'spacing'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('spacing')"
          @mouseleave="onToolMenuLeave($event, 'spacing', () => (spacingOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('spacing', el)"
            data-rte-anchor="spacing"
            :class="{ active: spacingOpen || !!(currentLetterSpacing() || currentMarginTop() || currentMarginBottom()) }"
            title="段前段后 / 字间距"
            @click.stop="markToolbarMenuOpening(); spacingOpen = !spacingOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('spacing')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">段距<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="spacingOpen"
              class="rte-spacing-panel"
              v-rte-float="'spacing'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('spacing')"
              @mouseleave="onToolMenuLeave($event, 'spacing', () => (spacingOpen = false))"
            >
              <div class="rte-spacing-row">
                <span class="rte-spacing-label">段前</span>
                <select
                  class="rte-spacing-select"
                  :value="currentMarginTop()"
                  @change="applyMarginTop(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">默认</option>
                  <option value="0">0</option>
                  <option value="0.5em">0.5em</option>
                  <option value="1em">1em</option>
                  <option value="1.5em">1.5em</option>
                  <option value="2em">2em</option>
                  <option value="3em">3em</option>
                </select>
              </div>
              <div class="rte-spacing-row">
                <span class="rte-spacing-label">段后</span>
                <select
                  class="rte-spacing-select"
                  :value="currentMarginBottom()"
                  @change="applyMarginBottom(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">默认</option>
                  <option value="0">0</option>
                  <option value="0.5em">0.5em</option>
                  <option value="1em">1em</option>
                  <option value="1.5em">1.5em</option>
                  <option value="2em">2em</option>
                  <option value="3em">3em</option>
                </select>
              </div>
              <div class="rte-spacing-row">
                <span class="rte-spacing-label">字间距</span>
                <select
                  class="rte-spacing-select"
                  :value="currentLetterSpacing()"
                  @change="applyLetterSpacing(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">默认</option>
                  <option value="0">0</option>
                  <option value="0.05em">0.05em</option>
                  <option value="0.1em">0.1em</option>
                  <option value="0.15em">0.15em</option>
                  <option value="0.2em">0.2em</option>
                  <option value="0.3em">0.3em</option>
                </select>
              </div>
              <div class="rte-spacing-row">
                <span class="rte-spacing-label">首行缩进</span>
                <select
                  class="rte-spacing-select"
                  :value="currentTextIndent()"
                  @change="applyTextIndent(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">无</option>
                  <option value="2em">2 字符</option>
                  <option value="3em">3 字符</option>
                  <option value="4em">4 字符</option>
                </select>
              </div>
              <div class="rte-spacing-row">
                <span class="rte-spacing-label">文字方向</span>
                <select
                  class="rte-spacing-select"
                  :value="currentTextDir()"
                  @change="applyTextDir(($event.target as HTMLSelectElement).value as '' | 'ltr' | 'rtl')"
                >
                  <option value="">默认</option>
                  <option value="ltr">从左到右</option>
                  <option value="rtl">从右到左</option>
                </select>
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'paraStyle'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('paraStyle')"
          @mouseleave="onToolMenuLeave($event, 'paraStyle', () => (paraStyleOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('paraStyle', el)"
            data-rte-anchor="paraStyle"
            :class="{ active: paraStyleOpen }"
            title="段落样式集"
            @click.stop="markToolbarMenuOpening(); paraStyleOpen = !paraStyleOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">段样式</span>
          </button>
          <Teleport to="body">
            <div
              v-if="paraStyleOpen"
              class="rte-menu rte-float-menu"
              v-rte-float="'paraStyle'"
              @mousedown.prevent
            >
              <button
                v-for="opt in PARA_STYLE_OPTIONS"
                :key="'ps-' + opt.id"
                type="button"
                @click="applyParaStyleId(opt.id)"
              >
                {{ opt.label }}
                <span class="rte-menu-desc">{{ opt.desc }}</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'listStyle'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('listStyle')"
          @mouseleave="onToolMenuLeave($event, 'listStyle', () => (listStyleOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('listStyle', el)"
            data-rte-anchor="listStyle"
            :class="{ active: listStyleOpen }"
            title="列表编号样式"
            @click.stop="markToolbarMenuOpening(); listStyleOpen = !listStyleOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('list')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">编号样式</span>
          </button>
          <Teleport to="body">
            <div
              v-if="listStyleOpen"
              class="rte-menu rte-float-menu"
              v-rte-float="'listStyle'"
              @mousedown.prevent
            >
              <button
                v-for="opt in ORDERED_LIST_STYLE_OPTIONS"
                :key="'ls-' + opt.value"
                type="button"
                @click="applyListStyle(opt.value)"
              >
                {{ opt.label }}
              </button>
              <div class="rte-menu-sep" />
              <button type="button" @click="applyListStart()">自定义起始…</button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'wordStats'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('wordStats')"
          @mouseleave="onToolMenuLeave($event, 'wordStats', () => (wordStatsOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('wordStats', el)"
            data-rte-anchor="wordStats"
            :class="{ active: wordStatsOpen }"
            title="字数统计"
            @click.stop="markToolbarMenuOpening(); wordStatsOpen = !wordStatsOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('wordStats')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">字数<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="wordStatsOpen"
              class="rte-wordstats-panel"
              v-rte-float="'wordStats'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('wordStats')"
              @mouseleave="onToolMenuLeave($event, 'wordStats', () => (wordStatsOpen = false))"
            >
              <div class="rte-wordstats-title">字数统计</div>
              <div class="rte-wordstats-row"><span>全文（去空白）</span><strong>{{ charCount }}</strong></div>
              <div class="rte-wordstats-row"><span>词数（估）</span><strong>{{ wordCount }}</strong></div>
              <div class="rte-wordstats-row"><span>阅读约</span><strong>{{ readingMinutes }} 分钟</strong></div>
              <div class="rte-wordstats-divider" />
              <div class="rte-wordstats-row"><span>段落</span><strong>{{ docExtraStats.paragraphs }}</strong></div>
              <div class="rte-wordstats-row"><span>行数</span><strong>{{ docExtraStats.lines }}</strong></div>
              <div class="rte-wordstats-row"><span>标题数</span><strong>{{ docExtraStats.headings }}</strong></div>
              <div class="rte-wordstats-row"><span>汉字</span><strong>{{ docExtraStats.cjk }}</strong></div>
              <div class="rte-wordstats-row"><span>英文词</span><strong>{{ docExtraStats.asciiWords }}</strong></div>
              <div class="rte-wordstats-divider" />
              <div class="rte-wordstats-row">
                <span>选区字符</span>
                <strong>{{ selectionStats.hasSelection ? selectionStats.chars : '—' }}</strong>
              </div>
              <div class="rte-wordstats-row">
                <span>选区词数</span>
                <strong>{{ selectionStats.hasSelection ? selectionStats.words : '—' }}</strong>
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'callout'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('callout')"
          @mouseleave="onToolMenuLeave($event, 'callout', () => (calloutOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('callout', el)"
            data-rte-anchor="callout"
            :class="{ active: calloutOpen || isActive('callout') }"
            title="告示框（提示/警告/成功/错误）"
            aria-label="告示框"
            @click.stop="markToolbarMenuOpening(); calloutOpen = !calloutOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('callout')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">告示<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="calloutOpen"
              class="rte-menu rte-callout-menu"
              v-rte-float="'callout'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('callout')"
              @mouseleave="onToolMenuLeave($event, 'callout', () => (calloutOpen = false))"
            >
              <div class="rte-menu-section-label">插入告示框</div>
              <button
                v-for="it in CALLOUT_MENU_ITEMS"
                :key="'co-' + it.variant"
                type="button"
                :class="{ active: isActive('callout', { variant: it.variant }) }"
                @click="insertCallout(it.variant)"
              >
                <span class="rte-callout-dot" :data-variant="it.variant" aria-hidden="true" />
                <span>{{ it.label }}</span>
                <span class="rte-menu-hint">{{ it.hint }}</span>
              </button>
              <div class="rte-menu-sep" aria-hidden="true" />
              <button
                type="button"
                :disabled="!isActive('callout')"
                @click="editor?.chain().focus().unsetCallout().run(); calloutOpen = false"
              >
                取消告示框
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'shortcuts'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('shortcuts')"
          @mouseleave="onToolMenuLeave($event, 'shortcuts', () => (shortcutsOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('shortcuts', el)"
            data-rte-anchor="shortcuts"
            :class="{ active: shortcutsOpen }"
            title="快捷键速查"
            aria-label="快捷键速查"
            @click.stop="toggleShortcutsPanel()"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('shortcuts')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">快捷键</span>
          </button>
          <Teleport to="body">
            <div
              v-if="shortcutsOpen && expanded"
              class="rte-shortcuts-panel"
              v-rte-float="'shortcuts'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('shortcuts')"
              @mouseleave="onToolMenuLeave($event, 'shortcuts', () => (shortcutsOpen = false))"
            >
              <div class="rte-shortcuts-title">快捷键速查</div>
              <div
                v-for="g in SHORTCUT_GROUPS"
                :key="'scg-' + g.title"
                class="rte-shortcuts-group"
              >
                <div class="rte-shortcuts-group-title">{{ g.title }}</div>
                <div
                  v-for="(it, i) in g.items"
                  :key="'sci-' + g.title + '-' + i"
                  class="rte-shortcuts-row"
                >
                  <kbd class="rte-kbd">{{ it.keys }}</kbd>
                  <span>{{ it.desc }}</span>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'hr'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('hr')"
          @mouseleave="onToolMenuLeave($event, 'hr', () => (hrOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('hr', el)"
            data-rte-anchor="hr"
            :class="{ active: hrOpen || isActive('horizontalRule') }"
            title="分割线"
            @click.stop="markToolbarMenuOpening(); hrOpen = !hrOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('hr')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">分割线<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div
          v-else-if="t.kind === 'blockOps'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('blockOps')"
          @mouseleave="onToolMenuLeave($event, 'blockOps', () => (blockOpsOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('blockOps', el)"
            data-rte-anchor="blockOps"
            :class="{ active: blockOpsOpen }"
            title="块操作"
            @click.stop="markToolbarMenuOpening(); blockOpsOpen = !blockOpsOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('more')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">块<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div
          v-else-if="t.kind === 'insertDate'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('insertDate')"
          @mouseleave="onToolMenuLeave($event, 'insertDate', () => (insertDateOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('insertDate', el)"
            data-rte-anchor="insertDate"
            :class="{ active: insertDateOpen }"
            title="插入日期"
            @click.stop="markToolbarMenuOpening(); insertDateOpen = !insertDateOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('note')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">日期<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div
          v-else-if="t.kind === 'caseTransform'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('caseTransform')"
          @mouseleave="onToolMenuLeave($event, 'caseTransform', () => (caseMenuOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('caseTransform', el)"
            data-rte-anchor="caseTransform"
            :class="{ active: caseMenuOpen }"
            title="大小写转换"
            @click.stop="markToolbarMenuOpening(); caseMenuOpen = !caseMenuOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">大小写<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="caseMenuOpen"
              class="rte-menu"
              v-rte-float="'caseTransform'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('caseTransform')"
              @mouseleave="onToolMenuLeave($event, 'caseTransform', () => (caseMenuOpen = false))"
            >
              <button type="button" @click="runCaseTransform('upper')">全大写</button>
              <button type="button" @click="runCaseTransform('lower')">全小写</button>
              <button type="button" @click="runCaseTransform('title')">词首大写</button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'zoom'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('zoom')"
          @mouseleave="onToolMenuLeave($event, 'zoom', () => (zoomMenuOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('zoom', el)"
            data-rte-anchor="zoom"
            :class="{ active: zoomMenuOpen || editorZoom !== 1 }"
            title="编辑区缩放"
            @click.stop="markToolbarMenuOpening(); zoomMenuOpen = !zoomMenuOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('wordStats')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">{{ Math.round(editorZoom * 100) }}%<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="zoomMenuOpen"
              class="rte-menu"
              v-rte-float="'zoom'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('zoom')"
              @mouseleave="onToolMenuLeave($event, 'zoom', () => (zoomMenuOpen = false))"
            >
              <button
                v-for="z in RTE_ZOOM_PRESETS"
                :key="'z-' + z.value"
                type="button"
                :class="{ active: editorZoom === z.value }"
                @click="setEditorZoom(z.value)"
              >
                {{ z.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div
          v-else-if="t.kind === 'viewExtras'"
          class="rte-tool-wrap"
          @mouseenter="onToolMenuEnter('viewExtras')"
          @mouseleave="onToolMenuLeave($event, 'viewExtras', () => (viewExtrasOpen = false))"
        >
          <button
            type="button"
            class="rte-tool"
            :ref="(el) => setFloatAnchor('viewExtras', el)"
            data-rte-anchor="viewExtras"
            :class="{ active: viewExtrasOpen || focusMode || darkEditor || paperGuide }"
            title="专注 / 暗色 / 纸张参考线"
            @click.stop="markToolbarMenuOpening(); viewExtrasOpen = !viewExtrasOpen"
          >
            <span class="rte-tool-icon">
              <component :is="t.iconComp || toolIcon('outline')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">视图<span class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div
              v-if="viewExtrasOpen"
              class="rte-menu"
              v-rte-float="'viewExtras'"
              @mousedown.prevent
              @mouseenter="onToolMenuEnter('viewExtras')"
              @mouseleave="onToolMenuLeave($event, 'viewExtras', () => (viewExtrasOpen = false))"
            >
              <button type="button" :class="{ active: focusMode }" @click="toggleFocusMode">专注模式</button>
              <button type="button" :class="{ active: darkEditor }" @click="toggleDarkEditor">暗色编辑区</button>
              <button type="button" :class="{ active: paperGuide }" @click="togglePaperGuide">纸张参考线</button>
            </div>
          </Teleport>
        </div>
        <button
          v-else
          type="button"
          class="rte-tool"
          :class="{ active: t.active?.(), 'is-disabled': t.disabled?.() }"
          :title="t.title || t.label"
          :aria-label="t.title || t.label"
          :aria-pressed="t.active ? !!t.active() : undefined"
          :disabled="t.disabled?.() || undefined"
          @click="t.run?.()"
          @dblclick.stop="t.key === 'formatPainter' && onFormatPainterDblClick()"
        >
          <span class="rte-tool-icon">
            <component
              v-if="t.iconComp"
              :is="t.iconComp"
              class="rte-ep-icon"
            />
            <template v-else>{{ t.icon }}</template>
          </span>
          <span class="rte-tool-label">{{ t.label }}</span>
        </button>
      </template>

      <!-- 紧跟工具流末尾（导入/导出之后）：编辑 / 预览 / 源码，不作右侧贴边 -->
      <template v-if="expanded">
        <button
          v-for="opt in VIEW_MODE_OPTIONS"
          :key="'vm-' + opt.id"
          type="button"
          role="tab"
          class="rte-tool rte-view-mode-tool"
          :class="{ active: viewMode === opt.id }"
          :title="opt.label"
          :aria-selected="viewMode === opt.id"
          @click="setViewMode(opt.id)"
        >
          <span class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">{{
            opt.icon
          }}</span>
          <span class="rte-tool-label">{{ opt.label }}</span>
        </button>
        <button
          v-if="viewMode === 'source' && sourceDirty"
          type="button"
          class="rte-tool rte-view-mode-tool rte-view-mode-apply"
          title="将源码应用到文档"
          @click="applySourceNow"
        >
          <span class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">↑</span>
          <span class="rte-tool-label">应用</span>
        </button>
      </template>

      <!-- 未最大化：其余工具收进「更多」 -->
      <div
        v-if="!expanded && moreTools.length"
        class="rte-tool-wrap rte-more-wrap"
        @mouseenter="onToolMenuEnter('more')"
        @mouseleave="onToolMenuLeave($event, 'more', closeMore)"
      >
        <button
          type="button"
          class="rte-tool is-labeled"
          :ref="(el) => setFloatAnchor('more', el)" data-rte-anchor="more"
          :class="{ active: moreOpen }"
          title="更多格式与插入"
          aria-label="更多格式与插入"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click.stop="markToolbarMenuOpening(); moreOpen = !moreOpen"
        >
          <span class="rte-tool-icon">
            <component :is="toolIcon('more')" class="rte-ep-icon" />
          </span>
          <span class="rte-tool-label">更多</span>
        </button>
        <Teleport to="body">
          <div
            v-if="moreOpen"
            class="rte-more-menu"
            v-rte-float="'more'"
            :class="{ 'has-flyout': moreColorOpen || moreHighlightOpen || moreFormOpen || moreTemplateOpen || moreFontSizeOpen || moreFontFamilyOpen || moreLineHeightOpen || moreCalloutOpen }"
            @mousedown.prevent
            @mouseenter="onToolMenuEnter('more')"
            @mouseleave="onToolMenuLeave($event, 'more', closeMore)"
          >
          <template v-for="mt in moreTools" :key="mt.key">
            <button
              type="button"
              class="rte-more-item"
              :class="{
                active:
                  mt.active?.() ||
                  (mt.kind === 'color' && moreColorOpen) ||
                  (mt.key === 'highlight' && moreHighlightOpen) ||
                  (mt.kind === 'form' && moreFormOpen) ||
                  (mt.kind === 'callout' && moreCalloutOpen) ||
                  (mt.kind === 'template' && moreTemplateOpen) ||
                  (mt.kind === 'fontSize' && moreFontSizeOpen) ||
                  (mt.kind === 'fontFamily' && moreFontFamilyOpen) ||
                  (mt.kind === 'lineHeight' && moreLineHeightOpen),
              }"
              @click="onMoreToolClick(mt)"
            >
              <span class="rte-more-icon">
                <component
                  v-if="mt.iconComp"
                  :is="mt.iconComp"
                  class="rte-ep-icon"
                />
                <template v-else>{{ mt.icon }}</template>
              </span>
              <span>{{ mt.title || mt.label }}</span>
              <span
                v-if="mt.kind === 'color' || mt.key === 'highlight' || mt.kind === 'attach' || mt.kind === 'form' || mt.kind === 'template' || mt.kind === 'fontSize' || mt.kind === 'fontFamily' || mt.kind === 'lineHeight' || mt.kind === 'callout' || mt.kind === 'caseTransform' || mt.kind === 'zoom' || mt.kind === 'viewExtras'"
                class="rte-more-caret"
              >{{ mt.kind === 'attach' || mt.kind === 'form' || mt.kind === 'template' ? '▾' : '▸' }}</span>
            </button>
            <div
              v-if="mt.kind === 'fontSize' && moreFontSizeOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button
                v-for="opt in FONT_SIZE_OPTIONS"
                :key="'mfs-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (currentFontSize() || '') }"
                @click="applyFontSize(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div
              v-if="mt.kind === 'fontFamily' && moreFontFamilyOpen"
              class="rte-menu rte-more-flyout rte-font-family-menu"
              @mousedown.prevent
            >
              <button
                v-for="opt in FONT_FAMILY_OPTIONS"
                :key="'mff-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (currentFontFamily() || '') }"
                :style="opt.value ? { fontFamily: opt.value } : undefined"
                @click="applyFontFamily(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div
              v-if="mt.kind === 'lineHeight' && moreLineHeightOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button
                v-for="opt in LINE_HEIGHT_OPTIONS"
                :key="'mlh-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (currentLineHeight() || '') }"
                @click="applyLineHeight(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div
              v-if="mt.kind === 'caseTransform' && caseMenuOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button type="button" @click="runCaseTransform('upper')">全大写</button>
              <button type="button" @click="runCaseTransform('lower')">全小写</button>
              <button type="button" @click="runCaseTransform('title')">词首大写</button>
            </div>
            <div
              v-if="mt.kind === 'zoom' && zoomMenuOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button
                v-for="z in RTE_ZOOM_PRESETS"
                :key="'mz-' + z.value"
                type="button"
                :class="{ active: editorZoom === z.value }"
                @click="setEditorZoom(z.value)"
              >
                {{ z.label }}
              </button>
            </div>
            <div
              v-if="mt.kind === 'viewExtras' && viewExtrasOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button type="button" :class="{ active: focusMode }" @click="toggleFocusMode">专注模式</button>
              <button type="button" :class="{ active: darkEditor }" @click="toggleDarkEditor">暗色编辑区</button>
              <button type="button" :class="{ active: paperGuide }" @click="togglePaperGuide">纸张参考线</button>
            </div>
            <div
              v-if="mt.kind === 'form' && moreFormOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button type="button" @click="insertFormRadio()">单选组</button>
              <button type="button" @click="insertFormCheckbox()">多选组</button>
              <button type="button" @click="insertFormText()">文本输入</button>
              <button type="button" @click="insertFormTextarea()">多行文本</button>
              <button type="button" @click="insertFormNumber()">数字输入</button>
              <button type="button" @click="insertFormSelect()">下拉选择</button>
              <button type="button" @click="insertFormDate()">日期</button>
              <button type="button" @click="insertFormDateTime()">日期时间</button>
              <button type="button" @click="insertFormSwitch()">开关</button>
              <div class="rte-menu-sep" aria-hidden="true" />
              <button
                type="button"
                @click="moreFormOpen = false; moreOpen = false; openTableDialog()"
              >
                表格
              </button>
            </div>
            <div
              v-if="mt.kind === 'template' && moreTemplateOpen"
              class="rte-menu rte-more-flyout rte-template-menu"
              @mousedown.prevent
            >
              <div class="rte-template-menu-body">
              <template v-for="g in RTE_DOC_TEMPLATE_GROUPS" :key="'m-' + g.id">
                <div class="rte-menu-section-label">{{ g.label }}</div>
                <div class="rte-template-grid">
                  <button
                    v-for="tpl in RTE_DOC_TEMPLATES.filter((x) => x.group === g.id)"
                    :key="tpl.id"
                    type="button"
                    class="rte-template-item"
                    :title="tpl.description || tpl.label"
                    @click.stop="insertDocTemplate(tpl.id)"
                  >
                    <span class="rte-template-item-label">{{ tpl.label }}</span>
                    <span v-if="tpl.description" class="rte-template-item-desc">{{
                      tpl.description
                    }}</span>
                  </button>
                </div>
              </template>
              </div>
            </div>
            <div
              v-if="mt.kind === 'color' && moreColorOpen"
              class="rte-menu rte-color-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button
                type="button"
                class="rte-color-action"
                :class="{ selected: !currentTextColor() }"
                @click="applyTextColor('')"
              >
                自动
              </button>
              <div class="rte-color-section-label">主题颜色</div>
              <div class="rte-theme-grid">
                <button
                  v-for="(c, i) in WORD_THEME_FLAT"
                  :key="'mth-' + i + '-' + c"
                  type="button"
                  class="rte-swatch"
                  :class="{
                    selected: colorsEqual(currentTextColor(), c),
                    'is-light': c === '#FFFFFF' || c.toLowerCase() === '#ffffff',
                  }"
                  :style="{ background: c }"
                  :title="c"
                  @click="applyTextColor(c)"
                />
              </div>
              <div class="rte-color-section-label">标准颜色</div>
              <div class="rte-standard-row" role="listbox" aria-label="标准文字颜色">
                <button
                  v-for="item in WORD_STANDARD_COLOR_ITEMS"
                  :key="'mst-' + item.color"
                  type="button"
                  role="option"
                  class="rte-swatch"
                  :class="{
                    selected: colorsEqual(currentTextColor(), item.color),
                    'is-light': isLightHighlight(item.color),
                  }"
                  :style="{ background: item.color }"
                  :title="item.label"
                  :aria-label="item.label"
                  :aria-selected="colorsEqual(currentTextColor(), item.color)"
                  @mouseenter="colorHoverLabel = item.label"
                  @mouseleave="colorHoverLabel = ''"
                  @click="applyTextColor(item.color)"
                />
              </div>
              <div class="rte-hl-hover-hint" aria-hidden="true">
                {{ colorHoverLabel || '悬停色块可预览名称' }}
              </div>
              <div class="rte-color-sep" />
              <button
                type="button"
                class="rte-color-action"
                @click.stop="customColorOpen = !customColorOpen"
              >
                其他颜色…
              </button>
              <div v-if="customColorOpen" class="rte-custom-color" @click.stop>
                <input
                  v-model="customColorHex"
                  type="color"
                  class="rte-custom-color-native"
                  title="选取颜色"
                  @input="onCustomColorNativeInput"
                />
                <input
                  v-model="customColorHex"
                  type="text"
                  class="rte-custom-color-hex"
                  maxlength="7"
                  placeholder="#165dff"
                  @keydown.enter.prevent="applyCustomColor"
                />
                <button
                  type="button"
                  class="rte-custom-color-ok"
                  @click="applyCustomColor"
                >
                  确定
                </button>
              </div>
            </div>
            <div
              v-if="mt.kind === 'callout' && moreCalloutOpen"
              class="rte-menu rte-callout-menu rte-more-flyout"
              @mousedown.prevent
            >
              <div class="rte-menu-section-label">插入告示框</div>
              <button
                v-for="it in CALLOUT_MENU_ITEMS"
                :key="'mco-' + it.variant"
                type="button"
                :class="{ active: isActive('callout', { variant: it.variant }) }"
                @click="insertCallout(it.variant)"
              >
                <span class="rte-callout-dot" :data-variant="it.variant" aria-hidden="true" />
                <span>{{ it.label }}</span>
                <span class="rte-menu-hint">{{ it.hint }}</span>
              </button>
            </div>
            <div
              v-if="mt.key === 'highlight' && moreHighlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu rte-more-flyout"
              role="dialog"
              aria-label="高亮颜色"
              @mousedown.prevent
            >
              <div class="rte-hl-current" aria-live="polite">
                当前：{{ currentHighlightLabel() }}
              </div>
              <button
                type="button"
                class="rte-color-action rte-hl-clear"
                :class="{ selected: !isActive('highlight') }"
                title="清除高亮"
                aria-label="清除高亮"
                @click="applyHighlightColor('')"
              >
                清除高亮
              </button>
              <div class="rte-color-section-label">常用底色</div>
              <div class="rte-highlight-swatches" role="listbox" aria-label="常用高亮底色">
                <button
                  v-for="h in WORD_HIGHLIGHT_SOFT"
                  :key="'mhl-s-' + h.color"
                  type="button"
                  role="option"
                  class="rte-swatch rte-hl-swatch"
                  :class="{
                    selected: colorsEqual(currentHighlightColor(), h.color),
                    'is-light': isLightHighlight(h.color),
                  }"
                  :style="{ background: h.color }"
                  :title="h.label"
                  :aria-label="h.label"
                  :aria-selected="colorsEqual(currentHighlightColor(), h.color)"
                  @mouseenter="highlightHoverLabel = h.label"
                  @mouseleave="highlightHoverLabel = ''"
                  @click="applyHighlightColor(h.color)"
                />
              </div>
              <div class="rte-color-section-label">荧光笔</div>
              <div class="rte-highlight-swatches" role="listbox" aria-label="荧光笔颜色">
                <button
                  v-for="h in WORD_HIGHLIGHT_VIVID"
                  :key="'mhl-v-' + h.color"
                  type="button"
                  role="option"
                  class="rte-swatch rte-hl-swatch"
                  :class="{
                    selected: colorsEqual(currentHighlightColor(), h.color),
                    'is-light': isLightHighlight(h.color),
                  }"
                  :style="{ background: h.color }"
                  :title="h.label"
                  :aria-label="h.label"
                  :aria-selected="colorsEqual(currentHighlightColor(), h.color)"
                  @mouseenter="highlightHoverLabel = h.label"
                  @mouseleave="highlightHoverLabel = ''"
                  @click="applyHighlightColor(h.color)"
                />
              </div>
              <div class="rte-color-sep" />
              <button
                type="button"
                class="rte-color-action"
                :aria-expanded="customHighlightOpen"
                @click.stop="customHighlightOpen = !customHighlightOpen"
              >
                自定义颜色…
              </button>
              <div v-if="customHighlightOpen" class="rte-custom-color" @click.stop>
                <input
                  v-model="customHighlightHex"
                  type="color"
                  class="rte-custom-color-native"
                  title="选取高亮色"
                  aria-label="选取高亮色"
                  @input="onCustomHighlightNativeInput"
                />
                <input
                  v-model="customHighlightHex"
                  type="text"
                  class="rte-custom-color-hex"
                  maxlength="7"
                  placeholder="#FFF3BF"
                  aria-label="高亮色十六进制"
                  @keydown.enter.prevent="applyCustomHighlight"
                />
                <button type="button" class="rte-custom-color-ok" @click="applyCustomHighlight">
                  确定
                </button>
              </div>
              <div class="rte-hl-hover-hint" aria-hidden="true">
                {{ highlightHoverLabel || '悬停色块可预览名称' }}
              </div>
            </div>
          </template>
          </div>
        </Teleport>
      </div>

      <!-- 紧凑「更多」打开的浮层面板（顶栏无对应按钮时，锚到「更多」） -->
      <Teleport to="body">
        <div
          v-if="!expanded && emojiOpen"
          class="rte-emoji-panel"
          v-rte-float="'emoji'"
          @mousedown.prevent
          @mouseenter="onToolMenuEnter('emoji')"
          @mouseleave="onToolMenuLeave($event, 'emoji', () => (emojiOpen = false))"
        >
          <div class="rte-picker-tabs" role="tablist" aria-label="表情分类">
            <button
              v-for="cat in RTE_EMOJI_CATEGORIES"
              :key="'c-em-tab-' + cat.id"
              type="button"
              role="tab"
              class="rte-picker-tab"
              :class="{ active: emojiTabId === cat.id }"
              :aria-selected="emojiTabId === cat.id"
              @click.stop="emojiTabId = cat.id"
            >{{ cat.label }}</button>
          </div>
          <div
            class="rte-picker-grid rte-emoji-grid"
            :class="{ 'rte-emoji-grid--large': isLargeEmojiTab, 'rte-emoji-grid--kaomoji': isKaomojiTab }"
            role="tabpanel"
          >
            <button
              v-for="em in activeEmojiList"
              :key="'c-em-' + emojiTabId + '-' + em"
              type="button"
              class="rte-emoji-btn"
              :class="{ 'rte-emoji-btn--kaomoji': isKaomojiTab || em.includes('(') || em.includes('¯') || em.includes('∠') }"
              :title="em"
              @click="insertEmoji(em)"
            >{{ em }}</button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div
          v-if="!expanded && specialCharsOpen"
          class="rte-specialchars-panel"
          v-rte-float="'specialChars'"
          @mousedown.prevent
          @mouseenter="onToolMenuEnter('specialChars')"
          @mouseleave="onToolMenuLeave($event, 'specialChars', () => (specialCharsOpen = false))"
        >
          <div class="rte-picker-tabs" role="tablist" aria-label="字符分类">
            <button
              v-for="cat in RTE_SPECIAL_CHAR_CATEGORIES"
              :key="'c-sc-tab-' + cat.id"
              type="button"
              role="tab"
              class="rte-picker-tab"
              :class="{ active: specialCharTabId === cat.id }"
              :aria-selected="specialCharTabId === cat.id"
              @click.stop="specialCharTabId = cat.id"
            >{{ cat.label }}</button>
          </div>
          <div class="rte-picker-grid rte-specialchars-grid" role="tabpanel">
            <button
              v-for="ch in activeSpecialCharList"
              :key="'c-sc-' + specialCharTabId + '-' + ch"
              type="button"
              class="rte-specialchars-btn"
              :title="ch"
              @click="insertSpecialChar(ch)"
            >{{ ch }}</button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div
          v-if="!expanded && spacingOpen"
          class="rte-spacing-panel"
          v-rte-float="'spacing'"
          @mousedown.prevent
          @mouseenter="onToolMenuEnter('spacing')"
          @mouseleave="onToolMenuLeave($event, 'spacing', () => (spacingOpen = false))"
        >
          <div class="rte-spacing-row">
            <span class="rte-spacing-label">段前</span>
            <select
              class="rte-spacing-select"
              :value="currentMarginTop()"
              @change="applyMarginTop(($event.target as HTMLSelectElement).value)"
            >
              <option value="">默认</option>
              <option value="0">0</option>
              <option value="0.5em">0.5em</option>
              <option value="1em">1em</option>
              <option value="1.5em">1.5em</option>
              <option value="2em">2em</option>
              <option value="3em">3em</option>
            </select>
          </div>
          <div class="rte-spacing-row">
            <span class="rte-spacing-label">段后</span>
            <select
              class="rte-spacing-select"
              :value="currentMarginBottom()"
              @change="applyMarginBottom(($event.target as HTMLSelectElement).value)"
            >
              <option value="">默认</option>
              <option value="0">0</option>
              <option value="0.5em">0.5em</option>
              <option value="1em">1em</option>
              <option value="1.5em">1.5em</option>
              <option value="2em">2em</option>
              <option value="3em">3em</option>
            </select>
          </div>
          <div class="rte-spacing-row">
            <span class="rte-spacing-label">字间距</span>
            <select
              class="rte-spacing-select"
              :value="currentLetterSpacing()"
              @change="applyLetterSpacing(($event.target as HTMLSelectElement).value)"
            >
              <option value="">默认</option>
              <option value="0">0</option>
              <option value="0.05em">0.05em</option>
              <option value="0.1em">0.1em</option>
              <option value="0.15em">0.15em</option>
              <option value="0.2em">0.2em</option>
              <option value="0.3em">0.3em</option>
            </select>
          </div>
          <div class="rte-spacing-row">
            <span class="rte-spacing-label">首行缩进</span>
            <select
              class="rte-spacing-select"
              :value="currentTextIndent()"
              @change="applyTextIndent(($event.target as HTMLSelectElement).value)"
            >
              <option value="">无</option>
              <option value="2em">2 字符</option>
              <option value="3em">3 字符</option>
              <option value="4em">4 字符</option>
            </select>
          </div>
          <div class="rte-spacing-row">
            <span class="rte-spacing-label">文字方向</span>
            <select
              class="rte-spacing-select"
              :value="currentTextDir()"
              @change="applyTextDir(($event.target as HTMLSelectElement).value as '' | 'ltr' | 'rtl')"
            >
              <option value="">默认</option>
              <option value="ltr">从左到右</option>
              <option value="rtl">从右到左</option>
            </select>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div
          v-if="!expanded && wordStatsOpen"
          class="rte-wordstats-panel"
          v-rte-float="'wordStats'"
          @mousedown.prevent
          @mouseenter="onToolMenuEnter('wordStats')"
          @mouseleave="onToolMenuLeave($event, 'wordStats', () => (wordStatsOpen = false))"
        >
          <div class="rte-wordstats-title">字数统计</div>
          <div class="rte-wordstats-row"><span>全文（去空白）</span><strong>{{ charCount }}</strong></div>
          <div class="rte-wordstats-row"><span>词数（估）</span><strong>{{ wordCount }}</strong></div>
          <div class="rte-wordstats-row"><span>阅读约</span><strong>{{ readingMinutes }} 分钟</strong></div>
          <div class="rte-wordstats-divider" />
          <div class="rte-wordstats-row"><span>段落</span><strong>{{ docExtraStats.paragraphs }}</strong></div>
          <div class="rte-wordstats-row"><span>行数</span><strong>{{ docExtraStats.lines }}</strong></div>
          <div class="rte-wordstats-row"><span>标题数</span><strong>{{ docExtraStats.headings }}</strong></div>
          <div class="rte-wordstats-row"><span>汉字</span><strong>{{ docExtraStats.cjk }}</strong></div>
          <div class="rte-wordstats-row"><span>英文词</span><strong>{{ docExtraStats.asciiWords }}</strong></div>
          <div class="rte-wordstats-divider" />
          <div class="rte-wordstats-row">
            <span>选区字符</span>
            <strong>{{ selectionStats.hasSelection ? selectionStats.chars : '—' }}</strong>
          </div>
          <div class="rte-wordstats-row">
            <span>选区词数</span>
            <strong>{{ selectionStats.hasSelection ? selectionStats.words : '—' }}</strong>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div
          v-if="!expanded && shortcutsOpen"
          class="rte-shortcuts-panel"
          v-rte-float="'shortcuts'"
          @mousedown.prevent
          @mouseenter="onToolMenuEnter('shortcuts')"
          @mouseleave="onToolMenuLeave($event, 'shortcuts', () => (shortcutsOpen = false))"
        >
          <div class="rte-shortcuts-title">快捷键速查</div>
          <div
            v-for="g in SHORTCUT_GROUPS"
            :key="'c-scg-' + g.title"
            class="rte-shortcuts-group"
          >
            <div class="rte-shortcuts-group-title">{{ g.title }}</div>
            <div
              v-for="(it, i) in g.items"
              :key="'c-sci-' + g.title + '-' + i"
              class="rte-shortcuts-row"
            >
              <kbd class="rte-kbd">{{ it.keys }}</kbd>
              <span>{{ it.desc }}</span>
            </div>
          </div>
        </div>
      </Teleport>

      </div>
    </div>

    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :should-show="bubbleShouldShow"
      :options="{ placement: 'top', offset: 8 }"
      class="rte-bubble"
      role="toolbar"
      aria-label="选区格式"
    >
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('bold') }"
        title="加粗 (Ctrl/⌘+B)"
        aria-label="加粗"
        :aria-pressed="isActive('bold')"
        @mousedown.prevent
        @click="toggleBold"
      >
        <component :is="toolIcon('bold')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('italic') }"
        title="斜体 (Ctrl/⌘+I)"
        aria-label="斜体"
        :aria-pressed="isActive('italic')"
        @mousedown.prevent
        @click="toggleItalic"
      >
        <component :is="toolIcon('italic')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('underline') }"
        title="下划线 (Ctrl/⌘+U)"
        aria-label="下划线"
        :aria-pressed="isActive('underline')"
        @mousedown.prevent
        @click="toggleUnderline"
      >
        <component :is="toolIcon('underline')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('strike') }"
        title="删除线 (Ctrl/⌘+Shift+X)"
        aria-label="删除线"
        :aria-pressed="isActive('strike')"
        @mousedown.prevent
        @click="toggleStrike"
      >
        <component :is="toolIcon('strike')" class="rte-ep-icon" />
      </button>
      <span class="rte-bubble-sep" aria-hidden="true" />
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('bulletList') }"
        title="无序列表"
        aria-label="无序列表"
        :aria-pressed="isActive('bulletList')"
        @mousedown.prevent
        @click="toggleBulletList"
      >
        <component :is="toolIcon('list')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('orderedList') }"
        title="有序列表"
        aria-label="有序列表"
        :aria-pressed="isActive('orderedList')"
        @mousedown.prevent
        @click="toggleOrderedList"
      >
        <component :is="toolIcon('listOrdered')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('taskList') }"
        title="任务列表"
        aria-label="任务列表"
        :aria-pressed="isActive('taskList')"
        @mousedown.prevent
        @click="toggleTaskList"
      >
        <component :is="toolIcon('listTask')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('blockquote') }"
        title="引用 (Ctrl/⌘+Shift+9)"
        aria-label="引用"
        :aria-pressed="isActive('blockquote')"
        @mousedown.prevent
        @click="toggleBlockquote"
      >
        <component :is="toolIcon('quote')" class="rte-ep-icon" />
      </button>
      <span class="rte-bubble-sep" aria-hidden="true" />
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('highlight') }"
        title="高亮"
        aria-label="高亮"
        :aria-pressed="isActive('highlight')"
        @mousedown.prevent
        @click="toggleHighlight"
      >
        <component :is="toolIcon('highlight')" class="rte-ep-icon" />
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('link') }"
        :title="isActive('link') ? '编辑链接 (Ctrl/⌘+K)' : '插入链接 (Ctrl/⌘+K)'"
        :aria-label="isActive('link') ? '编辑链接' : '插入链接'"
        :aria-pressed="isActive('link')"
        @mousedown.prevent
        @click="insertLink"
      >
        <component :is="toolIcon('link')" class="rte-ep-icon" />
      </button>
      <button
        v-if="isActive('link')"
        type="button"
        class="rte-bubble-btn"
        title="打开链接"
        aria-label="打开链接"
        @mousedown.prevent
        @click="openCurrentLink"
      >
        ↗
      </button>
      <button
        v-if="isActive('link')"
        type="button"
        class="rte-bubble-btn"
        title="复制链接地址"
        aria-label="复制链接地址"
        @mousedown.prevent
        @click="copyCurrentLinkUrl"
      >
        ⧉
      </button>
      <button
        v-if="isActive('link')"
        type="button"
        class="rte-bubble-btn rte-bubble-btn-danger"
        title="取消链接"
        aria-label="取消链接"
        @mousedown.prevent
        @click="unlinkSelection"
      >
        ✕
      </button>
    </BubbleMenu>


    <!-- 紧凑模式也可开：分割线 / 块操作 / 日期（锚点由 onMoreToolClick 或工具按钮设置） -->
    <Teleport to="body">
      <div
        v-if="hrOpen"
        class="rte-menu rte-float-menu"
        v-rte-float="'hr'"
        @mousedown.prevent
        @mouseenter="onToolMenuEnter('hr')"
        @mouseleave="onToolMenuLeave($event, 'hr', () => (hrOpen = false))"
      >
        <button
          v-for="opt in HR_VARIANT_OPTIONS"
          :key="'hr2-' + opt.value"
          type="button"
          @click="insertHrVariant(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="blockOpsOpen"
        class="rte-menu rte-float-menu"
        v-rte-float="'blockOps'"
        @mousedown.prevent
        @mouseenter="onToolMenuEnter('blockOps')"
        @mouseleave="onToolMenuLeave($event, 'blockOps', () => (blockOpsOpen = false))"
      >
        <button type="button" @click="selectCurrentBlock(); blockOpsOpen = false">全选当前块</button>
        <button type="button" @click="duplicateCurrentBlock(); blockOpsOpen = false">复制当前块</button>
        <div class="rte-menu-sep" aria-hidden="true" />
        <button type="button" @click="moveCurrentBlock(-1); blockOpsOpen = false">上移一块</button>
        <button type="button" @click="moveCurrentBlock(1); blockOpsOpen = false">下移一块</button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="insertDateOpen"
        class="rte-menu rte-float-menu"
        v-rte-float="'insertDate'"
        @mousedown.prevent
        @mouseenter="onToolMenuEnter('insertDate')"
        @mouseleave="onToolMenuLeave($event, 'insertDate', () => (insertDateOpen = false))"
      >
        <button type="button" @click="insertPlainDate(); insertDateOpen = false">今天日期</button>
        <button type="button" @click="insertPlainDateTime(); insertDateOpen = false">现在时间</button>
      </div>
    </Teleport>

    <!-- 图片选中：对齐 + 题注 -->
    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :should-show="imageBubbleShouldShow"
      :options="{ placement: 'bottom', offset: 10 }"
      class="rte-bubble rte-image-bubble"
    >
      <div class="rte-image-bubble-row">
        <button
          v-for="opt in IMAGE_ALIGN_OPTIONS"
          :key="'img-al-' + opt.value"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (editor?.getAttributes('image')?.align || '') === opt.value }"
          :title="'对齐：' + opt.label"
          @mousedown.prevent
          @click="setImageAlign(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="rte-image-bubble-row">
        <span class="rte-image-width-label">宽</span>
        <button
          v-for="opt in IMAGE_WIDTH_PRESETS"
          :key="'img-w-' + (opt.value || 'auto')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (editor?.getAttributes('image')?.displayWidth || '') === opt.value }"
          :title="'宽度：' + opt.label"
          @mousedown.prevent
          @click="setImageDisplayWidth(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="rte-image-bubble-row rte-image-caption-row">
        <input
          v-model="imageBubbleCaption"
          class="rte-image-caption-input"
          type="text"
          maxlength="120"
          placeholder="题注（写入图片标题）"
          @mousedown.stop
          @keydown.enter.prevent="applyImageCaption"
        />
        <button
          type="button"
          class="rte-bubble-btn"
          title="应用题注"
          @mousedown.prevent
          @click="applyImageCaption"
        >
          题注
        </button>
      </div>
      <div class="rte-image-bubble-row">
        <span class="rte-image-width-label">圆角</span>
        <button
          v-for="opt in IMAGE_RADIUS_PRESETS"
          :key="'img-r-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (editor?.getAttributes('image')?.borderRadius || '') === opt.value }"
          @mousedown.prevent
          @click="setImageBorderRadius(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="rte-image-bubble-row">
        <span class="rte-image-width-label">阴影</span>
        <button
          v-for="opt in IMAGE_SHADOW_PRESETS"
          :key="'img-s-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (editor?.getAttributes('image')?.boxShadow || '') === opt.value }"
          @mousedown.prevent
          @click="setImageBoxShadow(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="rte-image-bubble-row">
        <span class="rte-image-width-label">边框</span>
        <button
          v-for="opt in IMAGE_BORDER_PRESETS"
          :key="'img-b-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (editor?.getAttributes('image')?.borderStyle || '') === opt.value }"
          @mousedown.prevent
          @click="setImageBorderStyle(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="rte-image-bubble-row">
        <button
          type="button"
          class="rte-bubble-btn"
          :class="{ active: imageCompressOnInsert }"
          title="本地上传时压缩图片"
          @mousedown.prevent
          @click="imageCompressOnInsert = !imageCompressOnInsert"
        >
          {{ imageCompressOnInsert ? '插入压缩：开' : '插入压缩：关' }}
        </button>
      </div>
    </BubbleMenu>

    <div
      class="rte-workspace"
      :class="{
        'has-form-inspector': showFormInspector,
        'has-outline': outlineOpen && viewMode === 'edit',
      }"
    >
      <div
        v-if="viewMode === 'preview'"
        class="rte-preview-banner"
        role="status"
      >
        <span>只读预览中</span>
        <button type="button" class="rte-preview-back" @click="setViewMode('edit')">
          返回编辑
        </button>
      </div>
      <div
        v-show="viewMode !== 'source'"
        class="rte-canvas"
        :class="{
          'is-preview': viewMode === 'preview',
          'is-paper-guide': paperGuide,
        }"
        @click="onCanvasClick"
      >
        <input
          v-if="showTitle && viewMode === 'edit'"
          class="rte-title"
          type="text"
          maxlength="100"
          :value="localTitle"
          placeholder="请输入标题（最多 100 个字）"
          @input="onTitleInput"
          @click.stop
        />
        <div
          v-if="showTitle && viewMode === 'edit'"
          class="rte-title-sep"
        />
        <div
          v-if="showTitle && viewMode === 'preview' && localTitle"
          class="rte-title rte-title-preview"
        >
          {{ localTitle }}
        </div>
        <div
          v-if="showTitle && viewMode === 'preview' && localTitle"
          class="rte-title-sep"
        />
        <EditorContent
          :editor="editor"
          class="rte-body"
          :style="{ zoom: editorZoom }"
        />
      </div>

      <div v-if="viewMode === 'source'" class="rte-source-pane">
        <label class="rte-source-label" for="rte-source-editor">HTML 源码</label>
        <textarea
          id="rte-source-editor"
          class="rte-source-editor"
          spellcheck="false"
          :value="sourceHtml"
          @input="onSourceInput"
        />
      </div>

      <FormPropertyInspector
        v-if="showFormInspector && selectedFormType && selectedFormAttrs"
        :type="selectedFormType"
        :attrs="selectedFormAttrs"
        @patch="applySelectedFormPatch"
        @close="closeFormInspector"
        @mousedown="onFormInspectorMouseDown"
        @mouseup="onFormInspectorMouseUp"
        @mouseleave="onFormInspectorMouseUp"
      />

      <aside
        v-if="outlineOpen && viewMode === 'edit'"
        class="rte-outline-panel"
        aria-label="标题大纲"
      >
        <div class="rte-outline-head">
          <span class="rte-outline-title">大纲</span>
          <button
            type="button"
            class="rte-outline-close"
            title="关闭大纲"
            aria-label="关闭大纲"
            @click="outlineOpen = false"
          >
            ×
          </button>
        </div>
        <div v-if="!outlineHeadings.length" class="rte-outline-empty">
          暂无标题。输入「/」插入标题，或用工具栏「标题」。
        </div>
        <nav v-else class="rte-outline-list">
          <button
            v-for="h in outlineHeadings"
            :key="h.id"
            type="button"
            class="rte-outline-item"
            :data-level="h.level"
            :title="h.text"
            @click="jumpToOutlineHeading(h)"
          >
            {{ h.text }}
          </button>
        </nav>
      </aside>
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
        <span class="rte-wordcount" title="点击工具栏「字数」看详情">
          字数: {{ charCount }}
          <template v-if="selectionStats.hasSelection">
            · 选中 {{ selectionStats.chars }}
          </template>
          · 约 {{ readingMinutes }} 分钟
        </span>
        <span
          v-if="showMarkdownHint"
          class="rte-md-hint"
          title="Ctrl/⌘+B 加粗，Ctrl/⌘+K 链接，/ 插入段落。完整列表见工具栏「快捷键」。"
        >
          / 插入 · ⌘/Ctrl+K 链接
        </span>
      </div>
      <div class="rte-bottom-right">
        <span class="rte-draft" :class="syncTone" role="status" :title="syncHint">{{ syncLabel }}</span>
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

    <!-- 插入注释弹层（对照设计稿） -->
    <Teleport to="body">
      <div
        v-if="noteDialogOpen"
        class="rte-note-overlay"
        @mousedown.self="closeNoteDialog"
      >
        <div
          class="rte-note-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入注释"
          @mousedown.stop
        >
          <h3 class="rte-note-title">插入注释</h3>

          <div class="rte-note-row">
            <div class="rte-note-type-wrap">
              <button
                type="button"
                class="rte-note-type"
                @click.stop="noteTypeOpen = !noteTypeOpen"
              >
                <span class="rte-note-type-icon">[{{ noteTypeMeta.icon }}]</span>
                <span class="rte-note-type-label">{{ noteTypeMeta.label }}</span>
                <span class="rte-note-chevrons" aria-hidden="true">
                  <span>▴</span><span>▾</span>
                </span>
              </button>
              <div v-if="noteTypeOpen" class="rte-note-type-menu" @mousedown.prevent>
                <button
                  v-for="t in NOTE_TYPES"
                  :key="t.value"
                  type="button"
                  :class="{ active: noteType === t.value }"
                  @click="selectNoteType(t.value)"
                >
                  <span class="rte-note-type-icon">[{{ t.icon }}]</span>
                  <span>{{ t.label }}</span>
                </button>
              </div>
            </div>
            <div class="rte-note-field rte-note-text-field">
              <span class="rte-note-field-icon" aria-hidden="true">T</span>
              <input
                v-model="noteText"
                type="text"
                class="rte-note-input"
                placeholder="输入注释文本"
                maxlength="500"
                @keydown.enter.prevent="confirmInsertNote"
              />
            </div>
          </div>

          <div class="rte-note-field rte-note-link-field">
            <span class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input
              v-model="noteHref"
              type="url"
              class="rte-note-input"
              placeholder="输入链接地址"
              maxlength="2000"
              @keydown.enter.prevent="confirmInsertNote"
            />
          </div>

          <div class="rte-note-actions">
            <button type="button" class="rte-note-cancel" @click="closeNoteDialog">
              取消
            </button>
            <button type="button" class="rte-note-insert" @click="confirmInsertNote">
              插入
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Slash「/」命令菜单 -->
    <Teleport to="body">
      <div
        v-if="slashOpen"
        ref="slashMenuEl"
        class="rte-slash-menu rte-float-menu"
        data-rte-float-key="slash"
        :style="slashMenuStyle"
        @mousedown.prevent
      >
        <div class="rte-slash-head">
          <span class="rte-slash-title">插入</span>
          <span class="rte-slash-hint">/ 命令{{ slashQuery ? ` · ${slashQuery}` : '' }}</span>
        </div>
        <div v-if="!slashItems.length" class="rte-slash-empty">无匹配项</div>
        <div v-else class="rte-slash-list">
          <template v-for="(it, idx) in slashItems" :key="it.id">
            <div
              v-if="idx === 0 || rteSlashSectionLabel(it) !== rteSlashSectionLabel(slashItems[idx - 1])"
              class="rte-slash-section"
            >
              {{ rteSlashSectionLabel(it) }}
            </div>
            <button
              type="button"
              class="rte-slash-item"
              :class="{ 'is-active': idx === slashIndex }"
              @mouseenter="slashIndex = idx"
              @click="pickSlashItem(it)"
            >
              <span class="rte-slash-item-main">
                <span class="rte-slash-item-label">{{ it.label }}</span>
                <span v-if="it.description" class="rte-slash-item-desc">{{ it.description }}</span>
              </span>
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- @提及建议菜单 -->
    <Teleport to="body">
      <div
        v-if="mentionOpen"
        ref="mentionMenuEl"
        class="rte-mention-menu rte-float-menu"
        data-rte-float-key="mention"
        :style="mentionMenuStyle"
        @mousedown.prevent
      >
        <div class="rte-mention-head">
          <span class="rte-mention-title">提及</span>
          <span class="rte-mention-hint">@ 联系人{{ mentionQuery ? ` · ${mentionQuery}` : '' }}</span>
        </div>
        <div v-if="!mentionItems.length" class="rte-mention-empty">无匹配项</div>
        <div v-else class="rte-mention-list">
          <button
            v-for="(it, idx) in mentionItems"
            :key="it.id"
            type="button"
            class="rte-mention-item"
            :class="{ 'is-active': idx === mentionIndex }"
            @mouseenter="mentionIndex = idx"
            @click="pickMentionItem(it)"
          >
            <span class="rte-mention-item-avatar" aria-hidden="true">@</span>
            <span class="rte-mention-item-main">
              <span class="rte-mention-item-label">{{ it.label }}</span>
              <span v-if="it.role" class="rte-mention-item-role">{{ it.role }}</span>
            </span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 隐藏文件选择：导入文档 -->

    <input
      ref="importFileInputRef"
      type="file"
      class="rte-hidden-file"
      accept=".md,.markdown,.txt,.docx,.doc,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      @change="onImportFileChange"
    />

    <!-- 公式编辑器 -->
    <Teleport to="body">
      <div
        v-if="formulaDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeFormulaDialog"
      >
        <div
          class="rte-formula-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="公式编辑器"
          @mousedown.stop
        >
          <div class="rte-formula-header">
            <h3 class="rte-formula-title">公式编辑器</h3>
            <div class="rte-formula-modes">
              <span class="rte-formula-modes-label">公式排版</span>
              <button
                type="button"
                class="rte-formula-mode-btn"
                :class="{ active: formulaMode === 'inline' }"
                title="行内模式"
                @click="setFormulaMode('inline')"
              >
                <span class="rte-mode-glyph">行内</span>
              </button>
              <button
                type="button"
                class="rte-formula-mode-btn"
                :class="{ active: formulaMode === 'display' }"
                title="行间模式"
                @click="setFormulaMode('display')"
              >
                <span class="rte-mode-glyph">行间</span>
              </button>
            </div>
          </div>

          <div class="rte-formula-body">
            <div class="rte-formula-left">
              <div class="rte-formula-symbols">
                <div
                  v-for="g in FORMULA_SYMBOL_GROUPS"
                  :key="g.title"
                  class="rte-formula-group"
                >
                  <div class="rte-formula-group-title">{{ g.title }}</div>
                  <div class="rte-formula-group-items">
                    <button
                      v-for="it in g.items"
                      :key="it.tex + it.label"
                      type="button"
                      class="rte-formula-sym"
                      :title="it.tex"
                      @click="insertFormulaSymbol(it.tex)"
                    >
                      {{ it.label }}
                    </button>
                  </div>
                </div>
              </div>
              <textarea
                ref="formulaTexareaRef"
                v-model="formulaTex"
                class="rte-formula-tex"
                placeholder="输入 TeX 公式"
                spellcheck="false"
              />
            </div>
            <div
              class="rte-formula-right"
              :class="{ expanded: formulaPreviewExpanded }"
            >
              <button
                type="button"
                class="rte-formula-expand"
                title="放大预览"
                @click="formulaPreviewExpanded = !formulaPreviewExpanded"
              >
                ⛶
              </button>
              <div
                v-if="formulaPreviewHtml"
                class="rte-formula-preview"
                :class="{ display: formulaMode === 'display' }"
                v-html="formulaPreviewHtml"
              />
              <div v-else class="rte-formula-preview-ph">公式实时预览中...</div>
            </div>
          </div>

          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeFormulaDialog">
              取消
            </button>
            <button type="button" class="rte-modal-confirm" @click="confirmInsertFormula">
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 表格右键菜单 -->
    <Teleport to="body">
      <div
        v-if="tableCtx.open"
        class="rte-table-ctx-mask"
        @mousedown="closeTableCtx"
        @contextmenu.prevent="closeTableCtx"
      >
        <div
          class="rte-table-ctx"
          :style="{ left: tableCtx.x + 'px', top: tableCtx.y + 'px' }"
          @mousedown.stop.prevent
        >
          <template v-for="op in tableOpItems" :key="'ctx-' + op.key">
            <div v-if="op.sepBefore" class="rte-menu-sep" aria-hidden="true" />
            <button
              type="button"
              :class="{ danger: op.danger }"
              :disabled="op.disabled?.()"
              @click="op.run()"
            >
              {{ op.label }}
            </button>
          </template>
          <div class="rte-menu-sep" aria-hidden="true" />
          <div class="rte-table-cell-style-title" style="padding: 4px 10px">单元格背景</div>
          <div class="rte-table-swatches" style="padding: 0 10px 8px">
            <button
              v-for="p in TABLE_CELL_BG_PRESETS"
              :key="'ctx-bg-' + p.value"
              type="button"
              class="rte-table-swatch"
              :title="p.label"
              :style="p.value ? { background: p.value } : undefined"
              @click="setTableCellBg(p.value); closeTableCtx()"
            >{{ p.value ? '' : '无' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 紧凑「更多」进入的表格操作面板 -->
    <Teleport to="body">
      <div
        v-if="tableOpsSheetOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeTableOpsSheet"
      >
        <div
          class="rte-table-ops-sheet"
          role="dialog"
          aria-label="表格操作"
          @mousedown.stop
        >
          <h3 class="rte-table-title">表格操作</h3>
          <div class="rte-table-ops-list">
            <template v-for="op in tableOpItems" :key="'sheet-' + op.key">
              <div v-if="op.sepBefore" class="rte-menu-sep" aria-hidden="true" />
              <button
                type="button"
                class="rte-table-ops-item"
                :class="{ danger: op.danger }"
                :disabled="op.disabled?.()"
                @click="op.run()"
              >
                {{ op.label }}
              </button>
            </template>
            <div class="rte-menu-sep" aria-hidden="true" />
            <div class="rte-table-cell-style">
              <div class="rte-table-cell-style-title">单元格背景</div>
              <div class="rte-table-swatches">
                <button
                  v-for="p in TABLE_CELL_BG_PRESETS"
                  :key="'tbg-' + p.value"
                  type="button"
                  class="rte-table-swatch"
                  :title="p.label"
                  :style="p.value ? { background: p.value } : { background: 'transparent' }"
                  @click="setTableCellBg(p.value)"
                >
                  <span v-if="!p.value">无</span>
                </button>
              </div>
              <div class="rte-table-cell-style-title">边框样式</div>
              <div class="rte-table-border-styles">
                <button
                  v-for="p in TABLE_BORDER_STYLE_PRESETS"
                  :key="'tbs-' + p.value"
                  type="button"
                  class="rte-table-ops-item rte-table-border-btn"
                  @click="setTableCellBorderStyle(p.value)"
                >
                  {{ p.label }}
                </button>
              </div>
              <div class="rte-table-cell-style-title">边框颜色</div>
              <div class="rte-table-swatches">
                <button
                  type="button"
                  class="rte-table-swatch"
                  title="默认"
                  @click="setTableCellBorderColor('')"
                >无</button>
                <button
                  v-for="c in ['#d1d5db', '#9ca3af', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#111827']"
                  :key="'tbc-' + c"
                  type="button"
                  class="rte-table-swatch"
                  :style="{ background: c }"
                  :title="c"
                  @click="setTableCellBorderColor(c)"
                />
              </div>
            </div>
            <div class="rte-menu-sep" aria-hidden="true" />
            <button
              type="button"
              class="rte-table-ops-item"
              @click="closeTableOpsSheet(); openTableDialog()"
            >
              插入表格
            </button>
          </div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeTableOpsSheet">
              取消
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 插入表格 -->
    <Teleport to="body">
      <div
        v-if="tableDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeTableDialog"
      >
        <div
          class="rte-table-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入表格"
          @mousedown.stop
        >
          <h3 class="rte-table-title">插入表格</h3>

          <div
            class="rte-table-grid-picker"
            role="grid"
            aria-label="选择表格尺寸"
            @mouseleave="onTableGridLeave"
          >
            <div
              v-for="r in TABLE_GRID_MAX_ROWS"
              :key="'tg-r-' + r"
              class="rte-table-grid-row"
              role="row"
              :style="{ gridTemplateColumns: `repeat(${TABLE_GRID_MAX_COLS}, minmax(0, 1fr))` }"
            >
              <button
                v-for="c in TABLE_GRID_MAX_COLS"
                :key="'tg-' + r + '-' + c"
                type="button"
                class="rte-table-grid-cell"
                role="gridcell"
                :class="{
                  hot:
                    (tableGridHover.rows || tableRows) >= r &&
                    (tableGridHover.cols || tableCols) >= c,
                }"
                :title="r + ' × ' + c"
                :aria-label="r + ' 行 ' + c + ' 列'"
                @mouseenter="onTableGridHover(r, c)"
                @click="pickTableGridSize(r, c)"
              />
            </div>
            <div class="rte-table-grid-label" aria-live="polite">
              {{
                tableGridHover.rows
                  ? tableGridHover.rows + ' × ' + tableGridHover.cols
                  : tableRows + ' × ' + tableCols
              }}
            </div>
          </div>

          <div class="rte-table-field">
            <span class="rte-table-field-icon" aria-hidden="true">
              <component :is="IconTableRows" class="rte-table-field-svg" />
            </span>
            <input
              class="rte-table-input"
              type="number"
              min="1"
              max="100"
              :value="tableRows"
              placeholder="输入表格行数（最大 100 行）"
              @input="onTableRowsInput"
            />
            <div class="rte-table-stepper">
              <button type="button" @click="stepTableRows(1)">▴</button>
              <button type="button" @click="stepTableRows(-1)">▾</button>
            </div>
          </div>

          <div class="rte-table-field">
            <span class="rte-table-field-icon" aria-hidden="true">
              <component :is="IconTableCols" class="rte-table-field-svg" />
            </span>
            <input
              class="rte-table-input"
              type="number"
              min="1"
              :max="TABLE_GRID_MAX_COLS"
              :value="tableCols"
              placeholder="输入表格列数（最大 16 列）"
              @input="onTableColsInput"
            />
            <div class="rte-table-stepper">
              <button type="button" @click="stepTableCols(1)">▴</button>
              <button type="button" @click="stepTableCols(-1)">▾</button>
            </div>
          </div>

          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeTableDialog">
              取消
            </button>
            <button type="button" class="rte-modal-confirm" @click="confirmInsertTable">
              插入
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 导入链接（公众号） -->
    <Teleport to="body">
      <div
        v-if="linkImportOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeImportLinkDialog"
      >
        <div
          class="rte-link-import-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="导入链接"
          @mousedown.stop
        >
          <h3 class="rte-table-title">导入链接</h3>
          <p class="rte-link-import-hint">
            粘贴公众号文章 URL。若浏览器跨域无法抓取正文，将插入可点击链接占位。
          </p>
          <div class="rte-note-field rte-note-link-field" style="margin-bottom: 16px">
            <span class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input
              v-model="linkImportUrl"
              type="url"
              class="rte-note-input"
              placeholder="输入公众号文章链接"
              maxlength="2000"
              @keydown.enter.prevent="confirmImportLink"
            />
          </div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeImportLinkDialog">
              取消
            </button>
            <button
              type="button"
              class="rte-modal-confirm"
              :disabled="linkImportBusy"
              @click="confirmImportLink"
            >
              {{ linkImportBusy ? '导入中…' : '导入' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 查找 / 替换 -->
    <Teleport to="body">
      <div
        v-if="findDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeFindDialog"
      >
        <div
          class="rte-link-dialog rte-find-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="查找与替换"
          @mousedown.stop
        >
          <h3 class="rte-table-title">查找与替换</h3>
          <div class="rte-note-field rte-note-text-field" style="width: 100%; margin-bottom: 10px">
            <span class="rte-note-field-icon" aria-hidden="true">🔍</span>
            <input
              v-model="findQuery"
              type="text"
              class="rte-note-input rte-find-query"
              placeholder="查找"
              maxlength="200"
              @input="onFindQueryInput"
              @keydown.enter.prevent="findGo(1)"
            />
          </div>
          <div class="rte-note-field rte-note-text-field" style="width: 100%; margin-bottom: 10px">
            <span class="rte-note-field-icon" aria-hidden="true">⇄</span>
            <input
              v-model="findReplaceText"
              type="text"
              class="rte-note-input"
              placeholder="替换为"
              maxlength="200"
              @keydown.enter.prevent="doReplaceOne"
            />
          </div>
          <div class="rte-find-opts">
            <label class="rte-find-case">
              <input v-model="findCaseSensitive" type="checkbox" @change="refreshFindMatches(true)" />
              <span>区分大小写</span>
            </label>
            <label class="rte-find-case">
              <input v-model="findWholeWord" type="checkbox" @change="refreshFindMatches(true)" />
              <span>全词匹配</span>
            </label>
            <span class="rte-find-status" role="status" aria-live="polite">{{ findStatusText }}</span>
          </div>
          <div class="rte-modal-actions rte-find-actions">
            <button type="button" class="rte-modal-cancel" @click="findGo(-1)">上一个</button>
            <button type="button" class="rte-modal-cancel" @click="findGo(1)">下一个</button>
            <button type="button" class="rte-modal-cancel" @click="doReplaceOne">替换</button>
            <button type="button" class="rte-modal-confirm" @click="doReplaceAll">全部替换</button>
            <button type="button" class="rte-modal-cancel" @click="closeFindDialog">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 打印预览 -->
    <Teleport to="body">
      <div
        v-if="printPreviewOpen"
        class="rte-modal-overlay rte-print-preview-overlay"
        @mousedown.self="closePrintPreview"
      >
        <div
          class="rte-print-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="打印预览"
          @mousedown.stop
        >
          <div class="rte-print-preview-bar">
            <h3 class="rte-table-title">打印预览</h3>
            <div class="rte-print-preview-actions">
              <button type="button" class="rte-modal-cancel" @click="closePrintPreview">取消</button>
              <button type="button" class="rte-modal-confirm" @click="confirmPrintFromPreview">打印</button>
            </div>
          </div>
          <div class="rte-print-preview-paper" v-html="printPreviewHtml"></div>
        </div>
      </div>
    </Teleport>

    <!-- 书签列表（工具栏书签可双击打开；此处随 bookmarkPanelOpen） -->
    <Teleport to="body">
      <div
        v-if="bookmarkPanelOpen"
        class="rte-modal-overlay"
        @mousedown.self="bookmarkPanelOpen = false"
      >
        <div class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="书签" @mousedown.stop>
          <h3 class="rte-table-title">文档书签</h3>
          <div v-if="!listBookmarks().length" class="rte-find-status">暂无书签，选中文字后点「书签」插入</div>
          <button
            v-for="b in listBookmarks()"
            :key="b.id"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px"
            @click="jumpToBookmark(b.id); bookmarkPanelOpen = false"
          >
            <span>{{ b.label }}</span>
            <span class="rte-import-pill">#{{ b.id.slice(0, 10) }}</span>
          </button>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="insertBookmark">新建书签</button>
            <button type="button" class="rte-modal-confirm" @click="bookmarkPanelOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 脚注汇总 -->
    <Teleport to="body">
      <div
        v-if="footnotePanelOpen"
        class="rte-modal-overlay"
        @mousedown.self="footnotePanelOpen = false"
      >
        <div class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="脚注" @mousedown.stop>
          <h3 class="rte-table-title">脚注</h3>
          <div v-if="!(editor && collectFootnotes(editor).length)" class="rte-find-status">
            暂无脚注
          </div>
          <button
            v-for="fn in editor ? collectFootnotes(editor) : []"
            :key="fn.id"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px; text-align: left"
            @click="jumpToPos(editor!, fn.from)"
          >
            <span>[{{ fn.n }}] {{ fn.text }}</span>
          </button>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="insertFootnoteAtCursor">新建</button>
            <button
              type="button"
              class="rte-modal-cancel"
              @click="editor && renumberFootnotes(editor)"
            >
              重编号
            </button>
            <button type="button" class="rte-modal-confirm" @click="footnotePanelOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Wave21 检查报告 -->
    <Teleport to="body">
      <div
        v-if="wave21ReportOpen"
        class="rte-modal-overlay"
        @mousedown.self="wave21ReportOpen = false"
      >
        <div class="rte-link-dialog" role="dialog" aria-modal="true" @mousedown.stop>
          <h3 class="rte-table-title">{{ wave21ReportTitle }}</h3>
          <div class="rte-wave21-report-list">
            <button
              v-for="(line, idx) in wave21ReportLines"
              :key="'w21r-' + idx"
              type="button"
              class="rte-import-item"
              style="width: 100%; margin-bottom: 6px; text-align: left"
              @click="jumpWave21Report(line.pos)"
            >
              {{ line.text }}
            </button>
          </div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-confirm" @click="wave21ReportOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 交叉引用 -->
    <Teleport to="body">
      <div
        v-if="xrefDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="xrefDialogOpen = false"
      >
        <div class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="交叉引用" @mousedown.stop>
          <h3 class="rte-table-title">插入交叉引用</h3>
          <p class="rte-ask-message">选择标题、图或表作为引用目标</p>
          <div v-if="!xrefTargets.length" class="rte-ask-message">暂无可用目标，请先添加标题或带题注的图/表。</div>
          <button
            v-for="tg in xrefTargets"
            :key="tg.id + '-' + tg.pos"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px; text-align: left"
            @click="confirmInsertXref(tg)"
          >
            <span>{{ tg.kind === 'heading' ? '标题' : tg.kind === 'figure' ? '图' : '表' }} · {{ tg.label }}</span>
          </button>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="xrefDialogOpen = false">取消</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 阅读时长 -->
    <Teleport to="body">
      <div
        v-if="readTimeDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="readTimeDialogOpen = false"
      >
        <div class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="阅读时长" @mousedown.stop>
          <h3 class="rte-table-title">阅读时长估算</h3>
          <p class="rte-ask-message">基于全文去空白字数 {{ charCount }}</p>
          <div class="rte-wordstats-row"><span>慢读（约 250 字/分）</span><strong>{{ estimateReadingMinutes(charCount, 250) }} 分钟</strong></div>
          <div class="rte-wordstats-row"><span>常速（约 400 字/分）</span><strong>{{ estimateReadingMinutes(charCount, 400) }} 分钟</strong></div>
          <div class="rte-wordstats-row"><span>快读（约 600 字/分）</span><strong>{{ estimateReadingMinutes(charCount, 600) }} 分钟</strong></div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-confirm" @click="readTimeDialogOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 文本片段 Snippets -->
    <Teleport to="body">
      <div
        v-if="snippetDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="snippetDialogOpen = false"
      >
        <div class="rte-link-dialog rte-snippet-dialog" role="dialog" aria-modal="true" aria-label="文本片段" @mousedown.stop>
          <h3 class="rte-table-title">文本片段</h3>
          <button
            v-for="sn in snippetList"
            :key="sn.id"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px; text-align: left"
            @click="insertSnippet(sn)"
          >
            <strong>{{ sn.title }}</strong>
            <div class="rte-ask-message" style="margin: 4px 0 0">{{ sn.body.slice(0, 80) }}{{ sn.body.length > 80 ? '…' : '' }}</div>
          </button>
          <div class="rte-menu-sep" style="margin: 10px 0" />
          <p class="rte-ask-message">{{ snippetEditing ? '编辑片段' : '新建片段' }}</p>
          <div class="rte-note-field" style="width: 100%; margin-bottom: 8px">
            <input v-model="snippetTitle" class="rte-note-input" type="text" maxlength="40" placeholder="片段标题" />
          </div>
          <textarea
            v-model="snippetBody"
            class="rte-note-input"
            rows="4"
            maxlength="2000"
            placeholder="片段正文"
            style="width: 100%; margin-bottom: 8px; resize: vertical"
          />
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="snippetDialogOpen = false">关闭</button>
            <button
              v-if="snippetEditing"
              type="button"
              class="rte-modal-cancel"
              @click="deleteSnippet(snippetEditing)"
            >
              删除
            </button>
            <button type="button" class="rte-modal-cancel" @click="startEditSnippet(null)">新建</button>
            <button type="button" class="rte-modal-confirm" @click="saveSnippetForm">保存</button>
          </div>
          <div style="margin-top: 8px">
            <button
              v-for="sn in snippetList"
              :key="'ed-' + sn.id"
              type="button"
              class="rte-bubble-btn"
              style="margin: 2px"
              @click="startEditSnippet(sn)"
            >
              编辑·{{ sn.title }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 统一询问：输入 / 确认（替代原生 prompt/confirm） -->
    <Teleport to="body">
      <div
        v-if="askOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeAskDialog('cancel')"
      >
        <div
          class="rte-link-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="askTitle"
          @mousedown.stop
        >
          <h3 class="rte-table-title">{{ askTitle }}</h3>
          <p v-if="askMessage" class="rte-ask-message">{{ askMessage }}</p>
          <div
            v-if="askKind === 'prompt'"
            class="rte-note-field rte-note-text-field"
            style="width: 100%; margin-bottom: 12px"
          >
            <span class="rte-note-field-icon" aria-hidden="true">✎</span>
            <input
              ref="askInputRef"
              v-model="askValue"
              type="text"
              class="rte-note-input"
              :placeholder="askPlaceholder"
              :maxlength="askMaxlength"
              @keydown.enter.prevent="closeAskDialog('ok')"
              @keydown.esc.prevent="closeAskDialog('cancel')"
            />
          </div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeAskDialog('cancel')">
              {{ askCancelLabel }}
            </button>
            <button type="button" class="rte-modal-confirm" @click="closeAskDialog('ok')">
              {{ askConfirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 网页卡片插入 -->
    <Teleport to="body">
      <div
        v-if="linkCardDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeLinkCardDialog"
      >
        <div
          class="rte-link-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入网页卡片"
          @mousedown.stop
        >
          <h3 class="rte-table-title">插入网页卡片</h3>
          <p class="rte-ask-message">仅支持 http/https；iframe 为 sandbox 受控嵌入，部分站点可能拒绝。</p>
          <div class="rte-note-field rte-note-link-field" style="width: 100%; margin-bottom: 12px">
            <span class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input
              v-model="linkCardHref"
              type="url"
              class="rte-note-input"
              placeholder="https://"
              maxlength="2000"
              @keydown.enter.prevent="confirmLinkCardDialog"
            />
          </div>
          <div class="rte-ask-mode-row" role="radiogroup" aria-label="展示方式">
            <button
              type="button"
              class="rte-bubble-btn"
              :class="{ active: linkCardMode === 'card' }"
              @click="linkCardMode = 'card'"
            >
              链接卡片（推荐）
            </button>
            <button
              type="button"
              class="rte-bubble-btn"
              :class="{ active: linkCardMode === 'iframe' }"
              @click="linkCardMode = 'iframe'"
            >
              受控 iframe
            </button>
          </div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeLinkCardDialog">取消</button>
            <button type="button" class="rte-modal-confirm" @click="confirmLinkCardDialog">插入</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 链接编辑弹层：贴在选区附近，点空白处关闭 -->
    <Teleport to="body">
      <div
        v-if="linkDialogOpen"
        class="rte-link-popover-layer"
        @mousedown.self="closeLinkDialog"
      >
        <div
          class="rte-link-dialog rte-link-popover"
          role="dialog"
          :style="linkPopoverStyle"
          :aria-label="linkDialogEditing ? '编辑链接' : '插入链接'"
          @mousedown.stop
          @keydown.esc.prevent="closeLinkDialog"
        >
          <h3 class="rte-link-popover-title">{{ linkDialogEditing ? '编辑链接' : '插入链接' }}</h3>
          <label class="rte-link-field">
            <span>文本</span>
            <input
              v-model="linkText"
              type="text"
              placeholder="显示文字"
              maxlength="500"
              @keydown.enter.prevent="confirmInsertLink"
            />
          </label>
          <label class="rte-link-field">
            <span>地址</span>
            <input
              ref="linkHrefInputRef"
              v-model="linkHref"
              type="url"
              placeholder="https://"
              maxlength="2000"
              @keydown.enter.prevent="confirmInsertLink"
            />
          </label>
          <div class="rte-link-actions">
            <button
              v-if="linkDialogEditing"
              type="button"
              class="rte-link-text-btn is-danger"
              @click="unlinkSelection"
            >
              取消链接
            </button>
            <button
              v-if="linkHref.trim()"
              type="button"
              class="rte-link-text-btn"
              @click="openCurrentLink"
            >
              打开
            </button>
            <button
              v-if="linkHref.trim()"
              type="button"
              class="rte-link-text-btn"
              @click="copyCurrentLinkUrl"
            >
              复制
            </button>
            <span class="rte-modal-actions-spacer" aria-hidden="true" />
            <button type="button" class="rte-link-text-btn" @click="closeLinkDialog">
              关闭
            </button>
            <button type="button" class="rte-link-primary" @click="confirmInsertLink">
              {{ linkDialogEditing ? '更新' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 选择附件：单栏分类素材（无外部链接） -->
    <Teleport to="body">
      <div
        v-if="attachDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeAttachDialog"
      >
        <div
          class="rte-image-dialog rte-attach-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="选择附件"
          @mousedown.stop
        >
          <div class="rte-attach-title-bar">
            <h3 class="rte-attach-title">选择附件</h3>
          </div>

          <div class="rte-image-personal">
            <aside class="rte-image-sidebar">
              <button
                type="button"
                class="rte-image-side-item"
                :class="{ active: attachSidebarKey === 'all' }"
                @click="attachSidebarKey = 'all'"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📎</span>
                <span class="rte-image-side-label">我的附件</span>
              </button>
              <button
                type="button"
                class="rte-image-side-item"
                :class="{ active: attachSidebarKey === 'uncategorized' }"
                @click="attachSidebarKey = 'uncategorized'"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span class="rte-image-side-label">未分类</span>
              </button>
              <button
                v-for="cat in attachCategories"
                :key="cat.id"
                type="button"
                class="rte-image-side-item"
                :class="{ active: attachSidebarKey === cat.id }"
                @click="attachSidebarKey = cat.id"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span class="rte-image-side-label">{{ cat.name }}</span>
              </button>
              <div class="rte-image-side-spacer" />
              <div v-if="attachAddingCategory" class="rte-image-add-cat-form">
                <input
                  v-model="attachNewCategoryName"
                  type="text"
                  class="rte-image-add-cat-input"
                  placeholder="分类名称"
                  maxlength="40"
                  @keydown.enter.prevent="confirmAddAttachCategory"
                  @keydown.esc.prevent="attachAddingCategory = false"
                />
                <button
                  type="button"
                  class="rte-image-add-cat-ok"
                  @click="confirmAddAttachCategory"
                >
                  确定
                </button>
              </div>
              <button
                v-else
                type="button"
                class="rte-image-side-item rte-image-add-cat"
                @click="startAddAttachCategory"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁+</span>
                <span class="rte-image-side-label">添加分类</span>
              </button>
            </aside>

            <div class="rte-image-main">
              <div class="rte-image-main-top">
                <label class="rte-image-select-all">
                  <input
                    type="checkbox"
                    :checked="attachSelectAll"
                    @change="onAttachSelectAllChange"
                  />
                  <span>本页全选</span>
                </label>
              </div>
              <div
                class="rte-image-grid"
                :class="{ empty: filteredAttachAssets.length === 0 }"
              >
                <button
                  type="button"
                  class="rte-image-upload-card"
                  title="本地附件上传"
                  @click="triggerLocalAttachPick"
                >
                  <span class="rte-image-upload-ico" aria-hidden="true">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect
                        x="10"
                        y="6"
                        width="28"
                        height="36"
                        rx="3"
                        stroke="#5b8cff"
                        stroke-width="2"
                      />
                      <path
                        d="M18 18h12M18 24h12M18 30h8"
                        stroke="#5b8cff"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                      <circle cx="36" cy="36" r="9" fill="#5b8cff" />
                      <path
                        d="M36 32v8M32 36h8"
                        stroke="#fff"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                  <span class="rte-image-upload-label">本地附件上传</span>
                </button>
                <button
                  v-for="asset in filteredAttachAssets"
                  :key="asset.id"
                  type="button"
                  class="rte-image-thumb rte-attach-thumb"
                  :class="{ selected: attachSelectedIds.has(asset.id) }"
                  :title="asset.name"
                  @click="toggleAttachSelect(asset.id)"
                >
                  <span class="rte-attach-thumb-ext">{{ attachExtIcon(asset.name) }}</span>
                  <span class="rte-attach-thumb-name">{{ asset.name }}</span>
                  <span class="rte-attach-thumb-size">{{ formatAttachSize(asset.size) }}</span>
                  <span
                    class="rte-image-thumb-check"
                    :class="{ on: attachSelectedIds.has(asset.id) }"
                  />
                </button>
              </div>
            </div>
          </div>

          <div class="rte-modal-actions rte-image-actions">
            <button type="button" class="rte-modal-cancel" @click="closeAttachDialog">
              取消
            </button>
            <button
              type="button"
              class="rte-modal-confirm"
              @click="confirmInsertAttaches"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 插入图片：个人素材 / 外部链接 -->
    <Teleport to="body">
      <div
        v-if="imageDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeImageDialog"
      >
        <div
          class="rte-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入图片"
          @mousedown.stop
        >
          <div class="rte-image-tabs">
            <button
              type="button"
              class="rte-image-tab"
              :class="{ active: imageDialogTab === 'personal' }"
              @click="imageDialogTab = 'personal'"
            >
              个人素材
            </button>
            <button
              type="button"
              class="rte-image-tab"
              :class="{ active: imageDialogTab === 'external' }"
              @click="imageDialogTab = 'external'"
            >
              外部链接
            </button>
          </div>

          <div v-if="imageDialogTab === 'personal'" class="rte-image-personal">
            <aside class="rte-image-sidebar">
              <button
                type="button"
                class="rte-image-side-item"
                :class="{ active: imageSidebarKey === 'all' }"
                @click="imageSidebarKey = 'all'"
              >
                <span class="rte-image-side-ico" aria-hidden="true">👤</span>
                <span class="rte-image-side-label">我的图片</span>
              </button>
              <button
                type="button"
                class="rte-image-side-item"
                :class="{ active: imageSidebarKey === 'uncategorized' }"
                @click="imageSidebarKey = 'uncategorized'"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span class="rte-image-side-label">未分类</span>
              </button>
              <button
                v-for="cat in imageCategories"
                :key="cat.id"
                type="button"
                class="rte-image-side-item"
                :class="{ active: imageSidebarKey === cat.id }"
                @click="imageSidebarKey = cat.id"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span class="rte-image-side-label">{{ cat.name }}</span>
              </button>
              <div class="rte-image-side-spacer" />
              <div v-if="addingCategory" class="rte-image-add-cat-form">
                <input
                  v-model="newCategoryName"
                  type="text"
                  class="rte-image-add-cat-input"
                  placeholder="分类名称"
                  maxlength="40"
                  @keydown.enter.prevent="confirmAddCategory"
                  @keydown.esc.prevent="addingCategory = false"
                />
                <button type="button" class="rte-image-add-cat-ok" @click="confirmAddCategory">
                  确定
                </button>
              </div>
              <button
                v-else
                type="button"
                class="rte-image-side-item rte-image-add-cat"
                @click="startAddCategory"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁+</span>
                <span class="rte-image-side-label">添加分类</span>
              </button>
            </aside>

            <div class="rte-image-main">
              <div class="rte-image-main-top">
                <label class="rte-image-select-all">
                  <input
                    type="checkbox"
                    :checked="imageSelectAll"
                    @change="onImageSelectAllChange"
                  />
                  <span>本页全选</span>
                </label>
              </div>
              <div
                class="rte-image-grid"
                :class="{ empty: filteredImageAssets.length === 0 }"
              >
                <button
                  type="button"
                  class="rte-image-upload-card"
                  title="本地图片上传"
                  @click="triggerLocalImagePick"
                >
                  <span class="rte-image-upload-ico" aria-hidden="true">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect x="6" y="10" width="36" height="28" rx="4" stroke="#5b8cff" stroke-width="2"/>
                      <path d="M14 30l7-8 5 6 4-4 8 6" stroke="#5b8cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="18" cy="18" r="2.5" fill="#5b8cff"/>
                      <circle cx="36" cy="12" r="8" fill="#5b8cff"/>
                      <path d="M36 8v8M32 12h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  </span>
                  <span class="rte-image-upload-label">本地图片上传</span>
                </button>
                <button
                  v-for="asset in filteredImageAssets"
                  :key="asset.id"
                  type="button"
                  class="rte-image-thumb"
                  :class="{ selected: imageSelectedIds.has(asset.id) }"
                  :title="asset.name"
                  @click="toggleImageSelect(asset.id)"
                >
                  <img :src="asset.src" :alt="asset.name" />
                  <span
                    class="rte-image-thumb-check"
                    :class="{ on: imageSelectedIds.has(asset.id) }"
                  />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="rte-image-external">
            <p class="rte-link-import-hint">每行一个图片 URL，支持一次插入多张。</p>
            <textarea
              v-model="imageExternalUrls"
              class="rte-image-url-textarea"
              placeholder="https://example.com/a.png&#10;https://example.com/b.jpg"
              spellcheck="false"
            />
          </div>

          <div class="rte-modal-actions rte-image-actions">
            <button type="button" class="rte-modal-cancel" @click="closeImageDialog">
              取消
            </button>
            <button type="button" class="rte-modal-confirm" @click="confirmInsertImages">
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 插入视频：个人素材 / 外部链接（布局复用图片弹窗样式） -->
    <Teleport to="body">
      <div
        v-if="videoDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeVideoDialog"
      >
        <div
          class="rte-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入视频"
          @mousedown.stop
        >
          <div class="rte-image-tabs">
            <button
              type="button"
              class="rte-image-tab"
              :class="{ active: videoDialogTab === 'personal' }"
              @click="videoDialogTab = 'personal'"
            >
              个人素材
            </button>
            <button
              type="button"
              class="rte-image-tab"
              :class="{ active: videoDialogTab === 'external' }"
              @click="videoDialogTab = 'external'"
            >
              外部链接
            </button>
          </div>

          <div v-if="videoDialogTab === 'personal'" class="rte-image-personal">
            <aside class="rte-image-sidebar">
              <button
                type="button"
                class="rte-image-side-item"
                :class="{ active: videoSidebarKey === 'all' }"
                @click="videoSidebarKey = 'all'"
              >
                <span class="rte-image-side-ico" aria-hidden="true">🎬</span>
                <span class="rte-image-side-label">我的视频</span>
              </button>
              <button
                type="button"
                class="rte-image-side-item"
                :class="{ active: videoSidebarKey === 'uncategorized' }"
                @click="videoSidebarKey = 'uncategorized'"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span class="rte-image-side-label">未分类</span>
              </button>
              <button
                v-for="cat in videoCategories"
                :key="cat.id"
                type="button"
                class="rte-image-side-item"
                :class="{ active: videoSidebarKey === cat.id }"
                @click="videoSidebarKey = cat.id"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span class="rte-image-side-label">{{ cat.name }}</span>
              </button>
              <div class="rte-image-side-spacer" />
              <div v-if="videoAddingCategory" class="rte-image-add-cat-form">
                <input
                  v-model="videoNewCategoryName"
                  type="text"
                  class="rte-image-add-cat-input"
                  placeholder="分类名称"
                  maxlength="40"
                  @keydown.enter.prevent="confirmAddVideoCategory"
                  @keydown.esc.prevent="videoAddingCategory = false"
                />
                <button type="button" class="rte-image-add-cat-ok" @click="confirmAddVideoCategory">
                  确定
                </button>
              </div>
              <button
                v-else
                type="button"
                class="rte-image-side-item rte-image-add-cat"
                @click="startAddVideoCategory"
              >
                <span class="rte-image-side-ico" aria-hidden="true">📁+</span>
                <span class="rte-image-side-label">添加分类</span>
              </button>
            </aside>

            <div class="rte-image-main">
              <div class="rte-image-main-top">
                <label class="rte-image-select-all">
                  <input
                    type="checkbox"
                    :checked="videoSelectAll"
                    @change="onVideoSelectAllChange"
                  />
                  <span>本页全选</span>
                </label>
              </div>
              <div
                class="rte-image-grid"
                :class="{ empty: filteredVideoAssets.length === 0 }"
              >
                <button
                  type="button"
                  class="rte-image-upload-card"
                  title="本地视频上传"
                  @click="triggerLocalVideoPick"
                >
                  <span class="rte-image-upload-ico" aria-hidden="true">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect x="6" y="10" width="36" height="28" rx="4" stroke="#5b8cff" stroke-width="2"/>
                      <path d="M20 18l12 6-12 6V18z" fill="#5b8cff"/>
                      <circle cx="36" cy="12" r="8" fill="#5b8cff"/>
                      <path d="M36 8v8M32 12h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  </span>
                  <span class="rte-image-upload-label">本地视频上传</span>
                </button>
                <button
                  v-for="asset in filteredVideoAssets"
                  :key="asset.id"
                  type="button"
                  class="rte-image-thumb rte-video-thumb"
                  :class="{ selected: videoSelectedIds.has(asset.id) }"
                  :title="asset.name"
                  @click="toggleVideoSelect(asset.id)"
                >
                  <video :src="asset.src" muted preload="metadata" />
                  <span class="rte-video-thumb-name">{{ asset.name }}</span>
                  <span
                    class="rte-image-thumb-check"
                    :class="{ on: videoSelectedIds.has(asset.id) }"
                  />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="rte-image-external">
            <p class="rte-link-import-hint">每行一个视频 URL，支持一次插入多个。</p>
            <textarea
              v-model="videoExternalUrls"
              class="rte-image-url-textarea"
              placeholder="https://example.com/a.mp4&#10;https://example.com/b.webm"
              spellcheck="false"
            />
          </div>

          <div class="rte-modal-actions rte-image-actions">
            <button type="button" class="rte-modal-cancel" @click="closeVideoDialog">
              取消
            </button>
            <button
              type="button"
              class="rte-modal-confirm"
              @click="confirmInsertVideos"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

        <input
      ref="attachFileInputRef"
      type="file"
      multiple
      class="rte-hidden-file"
      @change="onLocalAttachFilesChange"
    />
<input
      ref="imageFileInputRef"
      type="file"
      class="rte-hidden-file"
      accept="image/*"
      multiple
      @change="onLocalImageFilesChange"
    />
    <input
      ref="videoFileInputRef"
      type="file"
      class="rte-hidden-file"
      accept="video/*,.mp4,.webm,.mov,.m4v,.ogg,.ogv"
      multiple
      @change="onLocalVideoFilesChange"
    />
  </div>
</template>

<style scoped>
.rte-boot {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  color: #5f6368;
  background: #f8f9fa;
  border-bottom: 1px solid #e8eaed;
}

.rte-boot.is-error {
  color: #d93025;
  background: #fce8e6;
}

.rte-draft.is-alert {
  color: #b06000;
}

.rte-draft.is-pending {
  color: #174ea6;
}

.rte-draft.is-ok {
  color: #188038;
}

.rte-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  background: var(--mm-surface, #fff);
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
  cursor: text;
}

.rte-toolbar-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 2px 4px;
  flex: 1 1 auto;
  min-width: 0;
}

/* 预览/源码：隐藏编辑工具，保留「编辑/预览/源码」模式按钮 */
.rte-root.mode-preview .rte-toolbar-tools > :not(.rte-view-mode-tool),
.rte-root.mode-source .rte-toolbar-tools > :not(.rte-view-mode-tool) {
  display: none !important;
}

.rte-view-mode-glyph {
  font-size: 14px !important;
  font-weight: 600;
  font-family: ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.rte-root.mode-preview {
  cursor: default;
}

.rte-root.mode-preview .rte-canvas.is-preview {
  background: #fafbfc;
}

.rte-root.mode-preview :deep(.ProseMirror) {
  caret-color: transparent;
}

.rte-root.mode-preview :deep(.ProseMirror-selectednode) {
  outline: none;
}

.rte-root.mode-preview :deep(input),
.rte-root.mode-preview :deep(textarea),
.rte-root.mode-preview :deep(select),
.rte-root.mode-preview :deep(.rte-form-switch-input) {
  pointer-events: none;
}

.rte-title-preview {
  cursor: default;
}

.rte-source-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 14px 12px;
  background: #1e1e1e;
}

.rte-source-label {
  font-size: 11px;
  color: #9cdcfe;
  margin-bottom: 6px;
}

.rte-source-editor {
  flex: 1;
  min-height: 180px;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 10px 12px;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  outline: none;
}

.rte-source-editor:focus {
  border-color: #1a73e8;
}

.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--mm-line, #e8eaed);
  background: var(--mm-surface, #fff);
  flex-shrink: 0;
  z-index: 2;
  position: sticky;
  top: 0;
}

.rte-tool-wrap {
  position: relative;
  overflow: visible;
  z-index: 1;
}
.rte-tool-wrap:has(.rte-menu),
.rte-tool-wrap:has(.rte-import-menu),
.rte-tool-wrap:has(.rte-table-menu),
.rte-tool-wrap:has(.rte-more-menu),
.rte-tool-wrap:has(.rte-color-menu),
.rte-tool-wrap:has(.rte-template-menu) {
  z-index: 50;
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

.rte-tool:hover {
  background: #f1f3f4;
  color: var(--mm-text, #202124);
}
.rte-tool.active {
  background: var(--mm-blue-soft, #e8f0fe);
  color: var(--mm-blue, #1a73e8);
}

.rte-tool:focus-visible {
  outline: 2px solid rgba(26, 115, 232, 0.45);
  outline-offset: 1px;
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
  z-index: 200;
  min-width: 108px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
}

/* Teleport + fixed：坐标由 JS inline+important 写入；禁止 top/left:auto !important */
.rte-float-menu {
  position: fixed !important;
  z-index: 5200 !important;
  margin: 0 !important;
  box-sizing: border-box;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(18, 18, 18, 0.12);
  border: 1px solid #ebebeb;
  background: #fff;
  max-height: var(--rte-float-max-h, min(70vh, 560px));
}
.rte-float-menu.rte-template-menu {
  display: flex;
  flex-direction: column;
  overflow: hidden !important;
  padding: 0;
}
.rte-float-menu.rte-template-menu .rte-template-menu-body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: var(--rte-float-max-h, min(70vh, 560px));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.rte-float-menu.rte-import-menu,
.rte-float-menu.rte-more-menu {
  /* 覆盖 absolute/right:0，位置由 JS 写入 */
}
.rte-float-menu.rte-more-menu.has-flyout {
  overflow: auto;
  max-height: var(--rte-float-max-h, min(72vh, 640px));
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
.rte-root :deep(.tiptap h4),
.rte-root :deep(.ProseMirror h4) {
  font-size: 1.02em;
  margin: 0.3em 0 0.2em;
  font-weight: 600;
}
.rte-root :deep(.tiptap h5),
.rte-root :deep(.ProseMirror h5) {
  font-size: 0.98em;
  margin: 0.28em 0 0.18em;
  font-weight: 600;
  color: #1d2129;
}
.rte-root :deep(.tiptap h6),
.rte-root :deep(.ProseMirror h6) {
  font-size: 0.92em;
  margin: 0.25em 0 0.15em;
  font-weight: 600;
  color: #4e5969;
}

.rte-root :deep(.tiptap ul),
.rte-root :deep(.ProseMirror ul),
.rte-root :deep(.tiptap ol),
.rte-root :deep(.ProseMirror ol) {
  padding-left: 1.4em;
  margin: 0.3em 0 0.55em;
}

/* 任务列表：与编辑器风格一致的可勾选框 */
.rte-root :deep(ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0.15em;
  margin: 0.3em 0 0.55em;
}
.rte-root :deep(ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 0.45em;
  margin: 0.15em 0;
}
.rte-root :deep(ul[data-type='taskList'] li > label) {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.2em;
  user-select: none;
}
.rte-root :deep(ul[data-type='taskList'] li > label input[type='checkbox']) {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #165dff;
  cursor: pointer;
}
.rte-root :deep(ul[data-type='taskList'] li > div) {
  flex: 1 1 auto;
  min-width: 0;
}
.rte-root :deep(ul[data-type='taskList'] li[data-checked='true'] > div) {
  color: #86909c;
  text-decoration: line-through;
}
.rte-root :deep(ul[data-type='taskList'] ul[data-type='taskList']) {
  margin: 0.15em 0 0.15em 0.2em;
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
  height: auto;
  border-radius: 4px;
  display: inline-block;
  vertical-align: bottom;
}

.rte-root :deep(.tiptap video.rte-video),
.rte-root :deep(.ProseMirror video.rte-video),
.rte-root :deep([data-resize-wrapper] > video.rte-video) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  display: block;
  background: #0f172a;
}

/* 飞书式：图片/视频均为 inline + ResizableNodeView，同行并排、可拖到其他行 */
.rte-root :deep(.tiptap p),
.rte-root :deep(.ProseMirror p) {
  line-height: 1.6;
}
.rte-root :deep([data-resize-container][data-node='image']),
.rte-root :deep([data-resize-container][data-node='video']) {
  display: inline-flex;
  vertical-align: bottom;
  max-width: calc(100% - 8px);
  margin: 0.25em 8px 0.25em 0;
  cursor: grab;
  overflow: visible;
  position: relative;
}
.rte-root :deep([data-resize-container][data-node='image']:active),
.rte-root :deep([data-resize-container][data-node='video']:active) {
  cursor: grabbing;
}
.rte-root :deep([data-resize-wrapper]) {
  max-width: 100%;
  width: max-content;
  line-height: 0;
  border-radius: 4px;
  /* 锚点用 translate 超出边缘，勿裁切 */
  overflow: visible;
}
.rte-root :deep([data-resize-wrapper] > img.rte-image) {
  max-width: 100%;
  height: auto;
  display: block;
}
.rte-root :deep([data-resize-container]:hover [data-resize-wrapper]),
.rte-root :deep([data-resize-container].ProseMirror-selectednode [data-resize-wrapper]),
.rte-root :deep([data-resize-container][data-resize-state='true'] [data-resize-wrapper]) {
  outline: 2px solid #5b8cff;
  outline-offset: 1px;
}
/* 统一 8 锚点外观。TipTap ResizableNodeView 对边中点会设 inline
   left:0;right:0 或 top:0;bottom:0 拉成整条边，需 !important 压回四边中间的方块锚点 */
.rte-root :deep([data-resize-handle]) {
  width: 10px !important;
  height: 10px !important;
  background: #fff;
  border: 2px solid #5b8cff;
  border-radius: 2px;
  box-sizing: border-box;
  z-index: 10;
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(91, 140, 255, 0.25);
}
.rte-root :deep([data-resize-handle='top-left']) {
  top: 0 !important;
  left: 0 !important;
  right: auto !important;
  bottom: auto !important;
  transform: translate(-50%, -50%);
  cursor: nwse-resize;
}
.rte-root :deep([data-resize-handle='top-right']) {
  top: 0 !important;
  right: 0 !important;
  left: auto !important;
  bottom: auto !important;
  transform: translate(50%, -50%);
  cursor: nesw-resize;
}
.rte-root :deep([data-resize-handle='bottom-left']) {
  bottom: 0 !important;
  left: 0 !important;
  top: auto !important;
  right: auto !important;
  transform: translate(-50%, 50%);
  cursor: nesw-resize;
}
.rte-root :deep([data-resize-handle='bottom-right']) {
  bottom: 0 !important;
  right: 0 !important;
  top: auto !important;
  left: auto !important;
  transform: translate(50%, 50%);
  cursor: nwse-resize;
}
/* 左右边中点：覆盖 TipTap inline top:0;bottom:0 全高拉伸 */
.rte-root :deep([data-resize-handle='left']),
.rte-root :deep([data-resize-handle='right']) {
  top: 50% !important;
  bottom: auto !important;
  cursor: ew-resize;
}
.rte-root :deep([data-resize-handle='left']) {
  left: 0 !important;
  right: auto !important;
  transform: translate(-50%, -50%);
}
.rte-root :deep([data-resize-handle='right']) {
  right: 0 !important;
  left: auto !important;
  transform: translate(50%, -50%);
}
/* 上下边中点：覆盖 TipTap inline left:0;right:0 全宽拉伸 */
.rte-root :deep([data-resize-handle='top']),
.rte-root :deep([data-resize-handle='bottom']) {
  left: 50% !important;
  right: auto !important;
  cursor: ns-resize;
}
.rte-root :deep([data-resize-handle='top']) {
  top: 0 !important;
  bottom: auto !important;
  transform: translate(-50%, -50%);
}
.rte-root :deep([data-resize-handle='bottom']) {
  bottom: 0 !important;
  top: auto !important;
  transform: translate(-50%, 50%);
}
.rte-root :deep([data-resize-container]:hover [data-resize-handle]),
.rte-root :deep([data-resize-container].ProseMirror-selectednode [data-resize-handle]),
.rte-root :deep([data-resize-container][data-resize-state='true'] [data-resize-handle]) {
  opacity: 1;
  pointer-events: auto;
}

/* 行间落点更易辨认（跨行拖拽） */
.rte-root :deep(.ProseMirror-dropcursor) {
  color: #5b8cff;
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

.rte-root :deep(.tiptap td.selectedCell),
.rte-root :deep(.ProseMirror td.selectedCell),
.rte-root :deep(.tiptap th.selectedCell),
.rte-root :deep(.ProseMirror th.selectedCell) {
  background: rgba(91, 140, 255, 0.16);
  /* 多选合并时可见的选区 */
  position: relative;
  z-index: 1;
}

/* 表格列宽拖拽（Table.configure resizable: true → colwidth / data-colwidth） */
.rte-root :deep(.tableWrapper) {
  overflow-x: auto;
  margin: 0.5em 0;
}
.rte-root :deep(.tableWrapper table) {
  margin: 0;
}
.rte-root :deep(.column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: -2px;
  width: 4px;
  background-color: #5b8cff;
  pointer-events: none;
  z-index: 20;
}
.rte-root :deep(.resize-cursor),
.rte-root :deep(.resize-cursor *) {
  cursor: col-resize !important;
}

.rte-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: #eef0f3;
}

.rte-menu-section-label {
  padding: 6px 10px 2px;
  font-size: 11px;
  font-weight: 600;
  color: #86909c;
  letter-spacing: 0.02em;
  user-select: none;
}

.rte-template-menu {
  min-width: 480px;
  max-width: 560px;
  padding: 0;
  /* 外层不裁切，避免挡住移入路径；滚动在 .rte-template-menu-body */
  overflow: visible;
}

.rte-template-menu-body {
  padding: 6px;
  max-height: min(70vh, 560px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.rte-template-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 0 0 8px;
}

.rte-template-menu .rte-menu-section-label {
  grid-column: 1 / -1;
  padding: 6px 8px 4px;
}

.rte-template-menu .rte-template-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 2px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  text-align: left;
  line-height: 1.35;
  white-space: normal;
  border: 1px solid transparent;
  border-radius: 6px;
}

.rte-template-menu .rte-template-item:hover {
  background: #f2f3f5;
  border-color: #e5e6eb;
}

.rte-template-item-label {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.rte-template-item-desc {
  font-size: 11px;
  font-weight: 400;
  color: #86909c;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rte-menu button:disabled,
.rte-table-ctx button:disabled,
.rte-table-ops-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rte-menu button.danger,
.rte-table-ctx button.danger,
.rte-table-ops-item.danger {
  color: #f53f3f;
}

.rte-table-menu {
  min-width: 148px;
  z-index: 60;
}

.rte-table-ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 5000;
}

.rte-table-ctx {
  position: fixed;
  z-index: 5001;
  min-width: 160px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
}

.rte-table-ctx button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 12px;
  font-size: 13px;
  color: #1d2129;
  border-radius: 4px;
  cursor: pointer;
}

.rte-table-ctx button:hover:not(:disabled) {
  background: #f2f3f5;
}

.rte-table-ops-sheet {
  width: min(320px, 92vw);
  background: #fff;
  border-radius: 10px;
  padding: 16px 16px 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16);
}

.rte-table-ops-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 0 12px;
  max-height: min(52vh, 420px);
  overflow: auto;
}

.rte-table-ops-item {
  border: none;
  background: transparent;
  text-align: left;
  padding: 9px 12px;
  font-size: 13px;
  color: #1d2129;
  border-radius: 6px;
  cursor: pointer;
}

.rte-table-ops-item:hover:not(:disabled) {
  background: #f2f3f5;
}

.rte-root :deep(.tiptap a.rte-link),
.rte-root :deep(.ProseMirror a.rte-link) {
  color: #1a73e8;
  text-decoration: underline;
}

.rte-root :deep(.tiptap p.is-editor-empty:first-child::before),
.rte-root :deep(.tiptap .is-empty::before),
.rte-root :deep(.ProseMirror p.is-editor-empty:first-child::before),
.rte-root :deep(.ProseMirror .is-empty::before) {
  color: var(--mm-faint, #9aa0a6);
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
  border-top: 1px solid var(--mm-line, #e8eaed);
  background: var(--mm-bg, #fafafa);
  flex-shrink: 0;
  font-size: 12px;
  color: var(--mm-muted, #5f6368);
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
  z-index: 200;
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


.rte-color-menu {
  min-width: 232px;
  width: 232px;
  padding: 8px;
  box-sizing: border-box;
  /* 覆盖 .rte-menu button 的左对齐大内边距，色块需紧凑 */
  gap: 0;
}
.rte-color-menu .rte-color-action {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  margin: 0 0 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  font-size: 12px;
  color: #1d2129;
  cursor: pointer;
  box-sizing: border-box;
}
.rte-color-menu .rte-color-action:hover {
  background: #f2f3f5;
}
.rte-color-menu .rte-color-action.selected {
  background: #e8f3ff;
  border-color: #94bfff;
}
.rte-color-section-label {
  margin: 6px 2px 4px;
  font-size: 11px;
  line-height: 1.2;
  color: #86909c;
  font-weight: 500;
  user-select: none;
}
.rte-theme-grid {
  display: grid;
  grid-template-columns: repeat(10, 18px);
  grid-template-rows: repeat(6, 18px);
  gap: 2px;
  justify-content: start;
  margin: 0 2px 4px;
}
.rte-standard-row,
.rte-highlight-swatches {
  display: grid;
  grid-template-columns: repeat(10, 18px);
  gap: 2px;
  justify-content: start;
  margin: 0 2px 4px;
}
.rte-highlight-swatches {
  grid-template-columns: repeat(5, 18px);
}
.rte-color-sep {
  height: 1px;
  background: #e5e6eb;
  margin: 6px 0 4px;
}
.rte-swatch {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0;
  margin: 0;
  cursor: pointer;
  box-sizing: border-box;
  flex-shrink: 0;
  position: relative;
  background-clip: padding-box;
}
.rte-color-menu .rte-swatch {
  /* 覆盖通用 .rte-menu button 样式 */
  text-align: center;
  padding: 0 !important;
  font-size: 0;
  border-radius: 2px;
  min-width: 18px;
  width: 18px;
  height: 18px;
}
.rte-swatch.is-light {
  border-color: rgba(0, 0, 0, 0.28);
}
.rte-swatch:hover {
  outline: 1px solid #1d2129;
  outline-offset: 1px;
  z-index: 1;
}
.rte-swatch.selected {
  outline: 1px solid #165dff;
  outline-offset: 1px;
  box-shadow: inset 0 0 0 1px #fff;
  z-index: 1;
}
.rte-swatch.selected::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 45%;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: translate(-50%, -55%) rotate(45deg);
  box-shadow: 1px 0 0 rgba(0, 0, 0, 0.15);
}
.rte-swatch.is-light.selected::after {
  border-color: #1d2129;
  box-shadow: none;
}
.rte-custom-color {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 2px 2px;
}
.rte-custom-color-native {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.rte-custom-color-hex {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 12px;
  color: #1d2129;
  box-sizing: border-box;
}
.rte-custom-color-hex:focus {
  outline: none;
  border-color: #165dff;
}
.rte-custom-color-ok {
  height: 28px;
  padding: 0 10px !important;
  border: 1px solid #e5e6eb !important;
  border-radius: 4px !important;
  background: #f7f8fa !important;
  font-size: 12px !important;
  color: #1d2129 !important;
  cursor: pointer;
  white-space: nowrap;
}
.rte-custom-color-ok:hover {
  background: #eef0f3 !important;
}
.rte-color-icon {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
  text-decoration-color: #1d2129;
}
.rte-font-family-menu {
  min-width: 168px;
  max-height: 320px;
  overflow-y: auto;
}
.rte-menu button.active {
  background: #eef3ff;
  color: #165dff;
}

/* —— 段落样式菜单（Word/飞书式预览） —— */
.rte-para-menu {
  min-width: 240px;
  max-width: min(320px, calc(100vw - 16px));
  max-height: var(--rte-float-max-h, min(70vh, 560px));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  gap: 1px;
}
.rte-para-menu .rte-menu-section-label {
  margin-top: 4px;
}
.rte-para-menu .rte-menu-section-label:first-child {
  margin-top: 0;
}
.rte-para-menu button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 6px;
  line-height: 1.25;
}
.rte-para-menu button.is-focused:not(.active) {
  background: #f2f3f5;
}
.rte-para-menu button.active {
  background: #e8f3ff;
  color: #165dff;
  box-shadow: inset 0 0 0 1px rgba(22, 93, 255, 0.22);
}
.rte-para-preview {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  color: inherit;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.rte-para-preview--h1 {
  letter-spacing: -0.02em;
}
.rte-para-preview--blockquote,
.rte-para-menu button.is-quote .rte-para-preview {
  border-left: 3px solid #c9cdd4;
  padding-left: 8px !important;
  color: #4e5969;
  font-style: italic;
}
.rte-para-menu button.active.is-quote .rte-para-preview {
  border-left-color: #165dff;
  color: #165dff;
}
.rte-para-shortcut {
  flex-shrink: 0;
  font-size: 10px;
  color: #c0c4cc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.rte-para-menu button.active .rte-para-shortcut {
  color: #94bfff;
}
.rte-float-menu.rte-para-menu {
  min-width: 240px;
}
.rte-more-caret {
  margin-left: auto;
  color: #c0c4cc;
  font-size: 11px;
}
.rte-more-wrap {
  position: relative;
}
.rte-more-menu.has-flyout {
  overflow-x: hidden;
  overflow-y: auto;
  max-height: min(420px, 70vh);
}
.rte-more-flyout {
  position: sticky;
  top: 0;
  left: 0;
  right: auto;
  margin: 4px 0 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 40;
  background: #fff;
}
.rte-root.expanded .rte-color-menu {
  /* 颜色面板较宽：优先左对齐；若贴右可由工具条 overflow:visible + bridge 兜底 */
  left: 0;
  right: auto;
}
.rte-root.expanded .rte-color-menu::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -8px;
  height: 8px;
}
.rte-bubble {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--mm-surface, #fff);
  color: var(--mm-text, #202124);
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(32, 33, 36, 0.12);
  z-index: 50;
}
.rte-bubble-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--mm-line-strong, #dadce0);
  flex: 0 0 auto;
}
.rte-bubble-btn {
  min-width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--mm-text, #202124);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.rte-bubble-btn :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}
.rte-bubble-btn:hover,
.rte-bubble-btn.active {
  background: var(--mm-blue-soft, #e8f0fe);
  color: var(--mm-blue, #1a73e8);
}
.rte-root :deep(.rte-prose mark),
.rte-root :deep(mark) {
  background-color: #ffe58f;
  border-radius: 2px;
  padding: 0 2px;
}
.rte-root :deep([style*='text-align: center']) {
  text-align: center;
}
.rte-root :deep([style*='text-align: right']) {
  text-align: right;
}
.rte-root :deep([style*='text-align: justify']) {
  text-align: justify;
}


.rte-tool-divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 4px;
  background: #e5e6eb;
  flex-shrink: 0;
}
:deep(.rte-ep-icon) {
  width: 16px;
  height: 16px;
  color: #4e5969;
  flex-shrink: 0;
}
.rte-tool.active :deep(.rte-ep-icon),
.rte-tool:hover :deep(.rte-ep-icon) {
  color: #1d2129;
}
.rte-tool-icon {
  gap: 1px;
}
.rte-caret {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 1px;
  position: relative;
  flex-shrink: 0;
  color: #86909c;
  font-size: 0;
  line-height: 0;
  vertical-align: middle;
}
.rte-caret::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-top: 4px solid currentColor;
  transform: translate(-50%, -40%);
}

/*
 * 最大化（expanded）工具栏：对齐知乎专栏写作页（live zhuanlan.zhihu.com/write）
 * 仅 .rte-root.expanded 生效；非最大化保持紧凑小按钮。
 */
/* 最大化：去掉嵌套边框，铺满面板最大化卡片 */
.rte-root.expanded {
  border: none;
  border-radius: 0;
  background: #fff;
  /* 工具栏下拉需画出工具条；滚动交给 .rte-canvas */
  overflow: visible;
}

.rte-root.expanded .rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: 0;
  row-gap: 4px;
  min-height: 64px;
  padding: 10px 0 10px 20px;
  border-bottom: none;
  /* 知乎：底部 0.5px 发丝线，而非粗 border */
  box-shadow: inset 0 -0.5px 0 rgba(235, 235, 235);
  background: #fff;
  overflow: visible;
  position: relative;
  /* 高于 .rte-workspace，避免下拉被正文层盖住 */
  z-index: 40;
}

/* 工具可换行顺延；模式按钮在流末（导入后） */
.rte-root.expanded .rte-toolbar-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  flex: 1 1 auto;
  min-width: 0;
  overflow: visible;
  column-gap: 0;
  row-gap: 6px;
}

/* 模式按钮：与普通工具同排同距，不贴右 */
.rte-root.expanded .rte-view-mode-tool {
  margin-right: 20px;
  min-width: 32px;
}

.rte-root.expanded .rte-view-mode-glyph {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px !important;
  line-height: 1;
  color: inherit;
}

.rte-root.expanded .rte-view-mode-tool.rte-view-mode-apply {
  color: #1772f6;
}

.rte-root.expanded .rte-tool-wrap {
  display: inline-flex;
  flex: 0 0 auto;
  margin-right: 20px;
  position: relative;
}

/* 组内工具间距 20px；下拉类约 45px 宽，双字约 32px，四字约 52px */
.rte-root.expanded .rte-tool {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  box-sizing: border-box;
  height: 44px;
  min-height: 44px;
  min-width: 32px;
  width: auto;
  max-width: none;
  padding: 2px 4px;
  margin-right: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #373a40;
  line-height: 1.2;
  transition: background 0.12s ease, color 0.12s ease;
}

/* wrap 已承担间距，避免双重 margin */
.rte-root.expanded .rte-tool-wrap > .rte-tool {
  margin-right: 0;
  min-width: 45px; /* 标题/列表/表格/导入等下拉 */
}

/* 带下拉三角的工具（含附件）≈45px */
.rte-root.expanded .rte-tool:has(.rte-caret) {
  min-width: 45px;
}

/* 附件等：图标右下角下拉下标（对齐知乎） */
.rte-tool-icon {
  position: relative;
}
.rte-caret-on-icon {
  position: absolute !important;
  right: -2px;
  bottom: -1px;
  width: 8px !important;
  height: 8px !important;
  margin: 0 !important;
  color: #86909c;
  pointer-events: none;
}
.rte-root.expanded .rte-caret-on-icon {
  right: -4px;
  bottom: -2px;
  width: 10px !important;
  height: 10px !important;
  color: inherit;
}
.rte-root.expanded .rte-caret-on-icon::before {
  border-left-width: 3px;
  border-right-width: 3px;
  border-top-width: 4px;
}
/* 非最大化勿裁切带 caret 的 label */
.rte-root:not(.expanded) .rte-tool:has(.rte-caret) .rte-tool-label {
  overflow: visible;
  text-overflow: clip;
  max-width: none;
}


.rte-root.expanded .rte-tool:hover {
  background: rgba(0, 0, 0, 0.04); /* GBK10A 近似 */
  color: #373a40;
  box-shadow: none;
}

.rte-root.expanded .rte-tool:active {
  background: transparent;
  transform: none;
}

/* 知乎：激活仅改色为 #1772F6，底仍为白（无蓝色底） */
.rte-root.expanded .rte-tool.active {
  background: transparent;
  color: #1772f6;
  box-shadow: none;
}

.rte-root.expanded .rte-tool:disabled,
.rte-root.expanded .rte-tool.is-disabled {
  color: #b2b3b6;
  background: transparent;
  cursor: default;
  pointer-events: none;
}

.rte-root.expanded .rte-tool:focus-visible {
  outline: 2px solid rgba(23, 114, 246, 0.35);
  outline-offset: 1px;
}

/* 图标槽 24×24；:deep 保证打到子组件根 SVG（scoped 下 class 落在组件 vnode 上） */
.rte-root.expanded .rte-tool-icon {
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  /* 勿用 font-size:0 — 若 SVG 仍以 1em 计宽会被坍成 0；固定 24 与知乎槽位一致 */
  font-size: 24px;
  line-height: 0;
  position: relative;
  flex-shrink: 0;
  overflow: visible;
}

.rte-root.expanded .rte-tool:hover .rte-tool-icon,
.rte-root.expanded .rte-tool.active .rte-tool-icon {
  background: transparent;
  border: none;
  box-shadow: none;
}

.rte-root.expanded :deep(.rte-ep-icon),
.rte-root.expanded :deep(.rte-tool-icon > svg),
.rte-root.expanded :deep(svg.rte-ep-icon) {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px;
  min-height: 24px;
  font-size: 24px;
  color: inherit;
  display: block;
  flex-shrink: 0;
  overflow: visible;
  box-sizing: content-box;
}

.rte-root.expanded :deep(.rte-ep-icon svg) {
  width: 24px !important;
  height: 24px !important;
  stroke-width: 1.7;
}

.rte-root.expanded .rte-tool:hover :deep(.rte-ep-icon) {
  color: #373a40;
}

.rte-root.expanded .rte-tool.active :deep(.rte-ep-icon) {
  color: #1772f6;
}

.rte-root.expanded .rte-tool:disabled :deep(.rte-ep-icon),
.rte-root.expanded .rte-tool.is-disabled :deep(.rte-ep-icon) {
  color: #b2b3b6;
}

/* 知乎 caption：11px / #373A40；激活同为蓝 */
.rte-root.expanded .rte-tool-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  font-size: 11px;
  font-weight: 400;
  color: #373a40;
  letter-spacing: 0;
  line-height: 16px;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
  max-width: none;
  transform: none;
  text-align: center;
  margin-top: 0;
}

.rte-root.expanded .rte-tool:hover .rte-tool-label {
  color: #373a40;
}

.rte-root.expanded .rte-tool.active .rte-tool-label {
  color: #1772f6;
  font-weight: 400;
}

.rte-root.expanded .rte-tool:disabled .rte-tool-label,
.rte-root.expanded .rte-tool.is-disabled .rte-tool-label {
  color: #b2b3b6;
}

/* 下拉三角：贴在 label 右下，16×16 槽位 */
.rte-root.expanded .rte-caret {
  display: inline-block;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  margin: 0 0 0 -2px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0;
  line-height: 0;
  position: relative;
  flex-shrink: 0;
  vertical-align: middle;
}

.rte-root.expanded .rte-caret::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
  transform: translate(-50%, -35%);
}

/* 分组发丝竖线 1×22 #EBECED；左右各 10px，企业工具栏更紧凑整齐 */
.rte-root.expanded .rte-tool-divider {
  width: 1px;
  height: 22px;
  min-height: 22px;
  align-self: center;
  flex: 0 0 auto;
  margin: 0 10px;
  background: #ebeced;
  border-radius: 0;
  pointer-events: none;
}

/* 飞书式主栏：图标成组、当前格式用浅底高亮；高级能力换行后仍保留短标签 */
.rte-root.expanded .rte-toolbar {
  min-height: 0;
  padding: 6px 10px;
  row-gap: 4px;
  border-bottom: 1px solid var(--mm-line, #e8eaed);
  box-shadow: none;
  position: sticky;
  top: 0;
  background: var(--mm-surface, #fff);
}

.rte-root.expanded .rte-toolbar-tools .rte-tool-wrap {
  margin-right: 2px;
}

.rte-root.expanded .rte-toolbar-tools .rte-tool {
  flex-direction: row;
  height: 30px;
  min-height: 30px;
  margin-right: 2px;
  padding: 0 6px;
  gap: 4px;
  border-radius: 6px;
}

.rte-root.expanded .rte-toolbar-tools .rte-tool-wrap > .rte-tool,
.rte-root.expanded .rte-toolbar-tools .rte-tool:has(.rte-caret) {
  min-width: 30px;
}

.rte-root.expanded .rte-toolbar-tools > .rte-tool:not(.is-labeled) .rte-tool-label,
.rte-root.expanded .rte-toolbar-tools > .rte-tool-wrap .rte-tool:not(.is-labeled) .rte-tool-label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.rte-root.expanded .rte-toolbar-tools > .rte-tool.is-labeled .rte-tool-label,
.rte-root.expanded .rte-toolbar-tools > .rte-tool-divider.is-tier ~ .rte-tool .rte-tool-label,
.rte-root.expanded .rte-toolbar-tools > .rte-tool-divider.is-tier ~ .rte-tool-wrap .rte-tool-label {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  padding: 0;
  overflow: hidden;
  clip: auto;
  max-width: 72px;
  text-overflow: ellipsis;
  font-size: 11px;
  line-height: 14px;
  color: inherit;
}

.rte-root.expanded .rte-tool-divider.is-tier ~ .rte-tool,
.rte-root.expanded .rte-tool-divider.is-tier ~ .rte-tool-wrap .rte-tool {
  flex-direction: column;
  height: auto;
  min-height: 36px;
  padding: 2px 6px 3px;
}

.rte-root.expanded .rte-tool-divider.is-tier {
  flex: 1 0 100%;
  width: 100%;
  height: 1px;
  min-height: 1px;
  margin: 4px 0 2px;
  background: var(--mm-line, #e8eaed);
}

.rte-root.expanded .rte-tool:hover {
  background: #f1f3f4;
  color: var(--mm-text, #202124);
}

.rte-root.expanded .rte-tool.active {
  background: var(--mm-blue-soft, #e8f0fe);
  color: var(--mm-blue, #1a73e8);
}

.rte-root.expanded .rte-tool.active :deep(.rte-ep-icon),
.rte-root.expanded .rte-tool.active .rte-tool-label {
  color: var(--mm-blue, #1a73e8);
}

/* 下拉已 Teleport 为 .rte-float-menu，不再依赖 absolute/右对齐兜底 */
.rte-root.expanded .rte-menu button {
  padding: 8px 12px;
  font-size: 13px;
}
.rte-float-menu.rte-menu button {
  padding: 8px 12px;
  font-size: 13px;
}

/* 最大化编辑区略增字号与留白 */
.rte-root.expanded .rte-canvas {
  padding: 20px 32px 28px;
  background: #fff;
}

.rte-root.expanded :deep(.tiptap),
.rte-root.expanded :deep(.ProseMirror) {
  font-size: 15px;
  line-height: 1.85;
  min-height: 160px;
}

/* 非最大化：单行图标主栏，横滑，不撑高画布面板 */
.rte-root:not(.expanded) .rte-toolbar {
  gap: 0;
  padding: 4px 6px;
  background: var(--mm-surface, #fff);
  overflow: visible;
}

.rte-root:not(.expanded) .rte-toolbar-tools {
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  align-items: center;
}

.rte-root:not(.expanded) .rte-more-wrap {
  position: sticky;
  right: 0;
  background: var(--mm-surface, #fff);
  box-shadow: -8px 0 8px var(--mm-surface, #fff);
}

.rte-root:not(.expanded) .rte-tool {
  flex-direction: row;
  min-width: 28px;
  max-width: none;
  width: auto;
  height: 28px;
  min-height: 28px;
  padding: 0 5px;
  gap: 4px;
  border-radius: 6px;
}

.rte-root:not(.expanded) .rte-tool-icon {
  width: auto;
  height: 16px;
  min-height: 16px;
}

.rte-root:not(.expanded) .rte-tool:not(.is-labeled) .rte-tool-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.rte-root:not(.expanded) .rte-tool.is-labeled .rte-tool-label {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  clip: auto;
  overflow: hidden;
  font-size: 12px;
  color: inherit;
  transform: none;
  max-width: 72px;
  text-overflow: ellipsis;
}

.rte-root:not(.expanded) :deep(.rte-ep-icon),
.rte-root:not(.expanded) :deep(.rte-tool-icon > svg) {
  width: 15px;
  height: 15px;
  min-width: 15px;
  min-height: 15px;
  font-size: 15px;
  display: block;
}

.rte-root:not(.expanded) :deep(.rte-ep-icon svg) {
  width: 15px;
  height: 15px;
}

.rte-root:not(.expanded) .rte-tool-divider {
  display: block;
  width: 1px;
  height: 16px;
  min-height: 16px;
  align-self: center;
  margin: 0 4px;
  background: var(--mm-line-strong, #dadce0);
}

.rte-import-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 200;
  min-width: 220px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rte-import-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: none;
  background: transparent;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: #4e5969;
  font-size: 13px;
}
.rte-import-item:hover {
  background: #f2f3f5;
  color: #1d2129;
}
.rte-import-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rte-import-pill {
  font-size: 11px;
  color: #86909c;
  background: #f2f3f5;
  border-radius: 999px;
  padding: 2px 8px;
  line-height: 1.4;
  flex-shrink: 0;
}
.rte-hidden-file {
  display: none !important;
}
.rte-root :deep(.rte-math) {
  color: #1d2129;
}
.rte-root :deep(.rte-math-inline) {
  display: inline-block;
  padding: 0 2px;
  vertical-align: middle;
  cursor: default;
}
.rte-root :deep(.rte-math-display) {
  display: block;
  margin: 0.6em 0;
  padding: 10px 12px;
  text-align: center;
  background: #fafbfc;
  border: 1px solid #eef0f3;
  border-radius: 6px;
  overflow-x: auto;
}
/* —— 行内注释标记 —— */
.rte-root :deep(.rte-annotation),
.rte-root :deep(span[data-annotation]) {
  background: linear-gradient(
    transparent 60%,
    rgba(141, 165, 255, 0.35) 60%
  );
  border-radius: 2px;
  padding: 0 1px;
  cursor: help;
  color: inherit;
}
.rte-root :deep(.rte-annotation[data-href]:not([data-href=''])),
.rte-root :deep(span[data-annotation][data-href]:not([data-href=''])) {
  cursor: pointer;
  color: #3b5bdb;
}
.rte-root :deep(.rte-annotation[data-note-type='重要']),
.rte-root :deep(span[data-annotation][data-note-type='重要']) {
  background: linear-gradient(
    transparent 60%,
    rgba(245, 63, 63, 0.28) 60%
  );
}
.rte-root :deep(.rte-annotation[data-note-type='待办']),
.rte-root :deep(span[data-annotation][data-note-type='待办']) {
  background: linear-gradient(
    transparent 60%,
    rgba(0, 180, 42, 0.28) 60%
  );
}

/* —— 表单控件节点 —— */
.rte-root :deep(.rte-form) {
  margin: 0.55em 0;
  padding: 10px 12px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fafbfc;
}
.rte-root :deep(.rte-form.ProseMirror-selectednode) {
  outline: 2px solid #5b8cff;
  outline-offset: 1px;
}
.rte-root :deep(.rte-form-label) {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8px;
}
.rte-root :deep(.rte-form-help) {
  font-size: 12px;
  line-height: 1.45;
  color: #86909c;
  margin: -4px 0 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.rte-root :deep(.rte-form-help[hidden]) {
  display: none;
}
.rte-root :deep(.rte-form.is-readonly),
.rte-root :deep(.rte-form.is-disabled) {
  opacity: 0.92;
}
.rte-root :deep(.rte-form.is-disabled) {
  opacity: 0.72;
}
.rte-root :deep(.rte-form-switch-row.is-locked) {
  cursor: default;
  opacity: 0.85;
}
.rte-root :deep(.rte-form-switch .rte-form-help) {
  margin-top: 6px;
  margin-bottom: 0;
}
.rte-root :deep(.rte-form-input) {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #c9cdd4;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  line-height: 1.4;
  background: #fff;
  color: #1d2129;
}
.rte-root :deep(.rte-form-input:focus) {
  outline: none;
  border-color: #5b8cff;
  box-shadow: 0 0 0 2px rgba(91, 140, 255, 0.2);
}
.rte-root :deep(.rte-form-options) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rte-root :deep(.rte-form[data-layout='row'] .rte-form-options) {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}
.rte-root :deep(.rte-form[data-layout='grid'] .rte-form-options) {
  display: grid;
  grid-template-columns: repeat(var(--rte-form-cols, 2), minmax(0, 1fr));
  align-items: start;
}
.rte-root :deep(.rte-form-option) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4e5969;
  cursor: pointer;
  user-select: none;
}
.rte-root :deep(.rte-form-option input) {
  margin: 0;
  accent-color: #1772f6;
}
.rte-root :deep(.rte-form-empty) {
  font-size: 12px;
  color: #86909c;
}
.rte-root :deep(.rte-form-required) {
  margin-left: 2px;
  color: #f53f3f;
  font-weight: 700;
}
.rte-root :deep(.rte-form-invalid) {
  border-color: #f53f3f;
  background: #fff7f7;
}
.rte-root :deep(.rte-form-invalid .rte-form-input),
.rte-root :deep(.rte-form-invalid .rte-form-select-control),
.rte-root :deep(.rte-form-invalid .rte-form-textarea-control) {
  border-color: #f53f3f;
  box-shadow: 0 0 0 2px rgba(245, 63, 63, 0.15);
}
.rte-root :deep(.rte-form-textarea-control) {
  min-height: 88px;
  resize: vertical;
  font-family: inherit;
}
.rte-root :deep(.rte-form-select-control) {
  appearance: auto;
  cursor: pointer;
}
.rte-root :deep(.rte-form-switch-row) {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  margin: 0;
}
.rte-root :deep(.rte-form-switch-label) {
  margin-bottom: 0;
  flex: 1;
}
.rte-root :deep(.rte-form-switch-input) {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
.rte-root :deep(.rte-form-switch-track) {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: #c9cdd4;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.rte-root :deep(.rte-form-switch-track.is-on),
.rte-root :deep(.rte-form-switch.is-on .rte-form-switch-track) {
  background: #1772f6;
}
.rte-root :deep(.rte-form-switch-thumb) {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}
.rte-root :deep(.rte-form-switch-track.is-on .rte-form-switch-thumb),
.rte-root :deep(.rte-form-switch.is-on .rte-form-switch-thumb) {
  transform: translateX(18px);
}
.rte-root :deep(.rte-form-number .rte-form-input),
.rte-root :deep(.rte-form-date .rte-form-input) {
  max-width: 280px;
}

/* —— 表单属性检查器：与正文并排（最大化浮层下尤佳） —— */
.rte-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.rte-workspace .rte-canvas {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.rte-workspace.has-form-inspector .rte-canvas {
  border-right: none;
}

.rte-root.has-form-inspector.expanded .rte-workspace .rte-canvas {
  padding-right: 20px;
}

.rte-root.has-form-inspector:not(.expanded) .rte-workspace {
  /* 紧凑单元格内仍并排，属性栏略窄 */
}
.rte-root.has-form-inspector:not(.expanded) :deep(.fpi) {
  width: 220px;
}

.rte-root.expanded :deep(.fpi) {
  width: 300px;
  position: relative;
  z-index: 20;
  overflow: visible;
}


/* —— 告示框 Callout —— */
.rte-root :deep(.rte-callout) {
  margin: 0.6em 0;
  padding: 10px 12px 10px 14px;
  border-radius: 8px;
  border-left: 4px solid #165dff;
  background: #e8f3ff;
  color: #1d2129;
  position: relative;
}
.rte-root :deep(.rte-callout::before) {
  content: attr(data-variant);
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
  opacity: 0.85;
}
.rte-root :deep(.rte-callout[data-variant='info']::before) { content: '提示'; color: #165dff; }
.rte-root :deep(.rte-callout[data-variant='warn']::before) { content: '警告'; color: #d46b08; }
.rte-root :deep(.rte-callout[data-variant='success']::before) { content: '成功'; color: #389e0d; }
.rte-root :deep(.rte-callout[data-variant='error']::before) { content: '错误'; color: #cf1322; }
.rte-root :deep(.rte-callout--info),
.rte-root :deep(.rte-callout[data-variant='info']) {
  border-left-color: #165dff;
  background: #e8f3ff;
}
.rte-root :deep(.rte-callout--warn),
.rte-root :deep(.rte-callout[data-variant='warn']) {
  border-left-color: #fa8c16;
  background: #fff7e6;
}
.rte-root :deep(.rte-callout--success),
.rte-root :deep(.rte-callout[data-variant='success']) {
  border-left-color: #52c41a;
  background: #f6ffed;
}
.rte-root :deep(.rte-callout--error),
.rte-root :deep(.rte-callout[data-variant='error']) {
  border-left-color: #ff4d4f;
  background: #fff2f0;
}
.rte-root :deep(.rte-callout > p) {
  margin: 0.25em 0;
}
.rte-root :deep(.rte-callout > p:first-child) {
  margin-top: 0;
}
.rte-root :deep(.rte-callout > p:last-child) {
  margin-bottom: 0;
}

/* 嵌套引用更清晰 */
.rte-root :deep(.tiptap blockquote blockquote),
.rte-root :deep(.ProseMirror blockquote blockquote) {
  margin-left: 0.35em;
  border-left-color: #86909c;
  background: #f2f3f5;
}

.rte-callout-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #165dff;
}
.rte-callout-dot[data-variant='warn'] { background: #fa8c16; }
.rte-callout-dot[data-variant='success'] { background: #52c41a; }
.rte-callout-dot[data-variant='error'] { background: #ff4d4f; }
.rte-menu-hint {
  margin-left: auto;
  font-size: 11px;
  color: #86909c;
}
.rte-callout-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* —— 快捷键面板 —— */
.rte-shortcuts-panel {
  min-width: 280px;
  max-width: 340px;
  max-height: min(420px, 70vh);
  overflow: auto;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 6000;
}
.rte-shortcuts-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8px;
}
.rte-shortcuts-group {
  margin-bottom: 10px;
}
.rte-shortcuts-group-title {
  font-size: 11px;
  font-weight: 600;
  color: #86909c;
  margin-bottom: 4px;
  text-transform: none;
}
.rte-shortcuts-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #4e5969;
  padding: 3px 0;
}
.rte-kbd {
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #e5e6eb;
  background: #f7f8fa;
  color: #1d2129;
  white-space: nowrap;
}

/* —— 大纲侧栏 —— */
.rte-workspace.has-outline .rte-canvas {
  border-right: none;
}
.rte-outline-panel {
  flex: 0 0 220px;
  width: 220px;
  min-width: 180px;
  max-width: 280px;
  border-left: 1px solid #eef0f3;
  background: #fafbfc;
  display: flex;
  flex-direction: column;
  min-height: 0;
  z-index: 15;
}
.rte-root:not(.expanded) .rte-outline-panel {
  width: 160px;
  flex-basis: 160px;
}
.rte-outline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #eef0f3;
  flex-shrink: 0;
}
.rte-outline-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.rte-outline-close {
  border: none;
  background: transparent;
  color: #86909c;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.rte-outline-close:hover {
  background: #e5e6eb;
  color: #1d2129;
}
.rte-outline-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: #86909c;
  line-height: 1.5;
}
.rte-outline-list {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 0 10px;
  flex: 1 1 auto;
}
.rte-outline-item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 5px 12px;
  font-size: 12px;
  color: #4e5969;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.rte-outline-item:hover {
  background: #e8f3ff;
  color: #165dff;
}
.rte-outline-item[data-level='1'] { font-weight: 600; padding-left: 12px; }
.rte-outline-item[data-level='2'] { padding-left: 22px; }
.rte-outline-item[data-level='3'] { padding-left: 32px; font-size: 11px; }
.rte-outline-item[data-level='4'] { padding-left: 42px; font-size: 11px; color: #86909c; }
.rte-outline-item[data-level='5'] { padding-left: 50px; font-size: 11px; color: #86909c; }
.rte-outline-item[data-level='6'] { padding-left: 58px; font-size: 11px; color: #a9aeb8; }

/* 工具栏吸顶：父级滚动时保持可见 */
.rte-toolbar {
  position: sticky;
  top: 0;
}
.rte-root.expanded .rte-toolbar {
  position: sticky;
  top: 0;
  box-shadow: inset 0 -0.5px 0 rgba(235, 235, 235), 0 1px 0 rgba(0, 0, 0, 0.02);
}


</style>

<style>
/* unscoped：Teleport 到 body 的工具条菜单兜底（避免 scoped 未命中时看不见） */
.rte-float-menu {
  position: fixed !important;
  z-index: 5200 !important;
  margin: 0 !important;
  box-sizing: border-box;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(18, 18, 18, 0.12);
  border: 1px solid #ebebeb;
  background: #fff;
}
.rte-float-menu.rte-menu,
.rte-float-menu.rte-import-menu,
.rte-float-menu.rte-more-menu {
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 108px;
  color: #1d2129;
}
.rte-float-menu.rte-import-menu {
  min-width: 220px;
  padding: 6px;
  gap: 2px;
}
.rte-float-menu.rte-template-menu {
  padding: 0;
  min-width: 480px;
  max-width: 560px;
  overflow: hidden !important;
}
.rte-float-menu .rte-template-menu-body {
  padding: 6px;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: var(--rte-float-max-h, min(70vh, 560px));
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.rte-float-menu button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  color: #1d2129;
  border-radius: 4px;
  cursor: pointer;
}
.rte-float-menu button:hover {
  background: #f2f3f5;
}

/* 盖过 .rte-modal-overlay(4100)，避免弹窗内 toast 被挡住变成「没反应」 */
.el-message {
  z-index: 5000 !important;
}
.rte-note-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.28);
  padding: 16px;
  box-sizing: border-box;
}
.rte-note-dialog {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  padding: 22px 24px 20px;
  box-sizing: border-box;
}
.rte-note-title {
  margin: 0 0 18px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: #1d2129;
  letter-spacing: 0.02em;
}
.rte-note-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
  margin-bottom: 12px;
}
.rte-note-type-wrap {
  position: relative;
  flex: 0 0 132px;
  min-width: 118px;
}
.rte-note-type {
  width: 100%;
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  color: #1d2129;
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
}
.rte-note-type:hover {
  border-color: #c9cdd4;
}
.rte-note-type-icon {
  font-weight: 700;
  color: #4e5969;
  font-family: ui-sans-serif, system-ui, sans-serif;
  flex-shrink: 0;
}
.rte-note-type-label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rte-note-chevrons {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  line-height: 0.7;
  font-size: 9px;
  color: #86909c;
  margin-left: 2px;
}
.rte-note-type-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 5;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.rte-note-type-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  font-size: 13px;
  color: #1d2129;
  border-radius: 4px;
  cursor: pointer;
}
.rte-note-type-menu button:hover,
.rte-note-type-menu button.active {
  background: #f2f3f5;
}
.rte-note-field {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  box-sizing: border-box;
}
.rte-note-text-field {
  flex: 1;
  min-width: 0;
}
.rte-note-link-field {
  width: 100%;
  margin-bottom: 20px;
}
.rte-note-field:focus-within {
  border-color: #8da5ff;
  box-shadow: 0 0 0 2px rgba(141, 165, 255, 0.2);
}
.rte-note-field-icon {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: #a9aeb8;
  font-family: ui-sans-serif, system-ui, sans-serif;
  width: 16px;
  text-align: center;
}
.rte-note-link-icon {
  font-weight: 400;
  font-size: 13px;
}
.rte-note-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #1d2129;
  height: 100%;
}
.rte-note-input::placeholder {
  color: #a9b4c8;
}
.rte-note-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.rte-note-cancel,
.rte-note-insert {
  height: 40px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.rte-note-cancel {
  border: 1px solid #e5e6eb;
  background: #fff;
  color: #4e5969;
}
.rte-note-cancel:hover {
  background: #f7f8fa;
}
.rte-note-insert {
  border: none;
  background: #8da5ff;
  color: #fff;
}
.rte-note-insert:hover {
  background: #7390f5;
}

.rte-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 4100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.28);
  padding: 16px;
  box-sizing: border-box;
}
.rte-modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 4px;
}
.rte-modal-cancel,
.rte-modal-confirm {
  height: 40px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.rte-modal-cancel {
  border: 1px solid #e5e6eb;
  background: #fff;
  color: #4e5969;
}
.rte-modal-cancel:hover {
  background: #f7f8fa;
}
.rte-modal-confirm {
  border: none;
  background: #8da5ff;
  color: #fff;
}
.rte-modal-confirm:hover {
  background: #7390f5;
}
.rte-modal-confirm:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* 公式编辑器 */
.rte-formula-dialog {
  width: min(920px, 96vw);
  height: min(620px, 92vh);
  max-height: min(620px, 92vh);
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  padding: 16px 18px 18px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
.rte-formula-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rte-formula-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1d2129;
}
.rte-formula-modes {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rte-formula-modes-label {
  font-size: 12px;
  color: #86909c;
}
.rte-formula-mode-btn {
  border: 1px solid #e5e6eb;
  background: #fff;
  color: #4e5969;
  border-radius: 6px;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}
.rte-formula-mode-btn.active {
  border-color: #8da5ff;
  color: #3b5bdb;
  background: #f3f6ff;
}
.rte-formula-body {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 12px;
  min-height: 0;
  flex: 1 1 auto;
  height: 0;
  min-width: 0;
}
.rte-formula-left,
.rte-formula-right {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fff;
  min-width: 0;
  min-height: 0;
}
.rte-formula-left {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rte-formula-symbols {
  padding: 8px 8px 4px;
  overflow: auto;
  max-height: 220px;
  flex-shrink: 0;
  border-bottom: 1px solid #eef0f3;
}
.rte-formula-group {
  margin-bottom: 6px;
}
.rte-formula-group-title {
  font-size: 11px;
  color: #86909c;
  margin-bottom: 4px;
}
.rte-formula-group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.rte-formula-sym {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #eef0f3;
  border-radius: 4px;
  background: #fafbfc;
  color: #1d2129;
  cursor: pointer;
  font-size: 13px;
}
.rte-formula-sym:hover {
  border-color: #8da5ff;
  background: #f3f6ff;
}
.rte-formula-tex {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: #1d2129;
  min-height: 200px;
}
.rte-formula-tex::placeholder {
  color: #a9b4c8;
}
.rte-formula-right {
  position: relative;
  padding: 28px 12px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #fafbfc;
}
.rte-formula-right.expanded {
  position: fixed;
  inset: 8vh 8vw;
  z-index: 4200;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.2);
}
.rte-formula-expand {
  position: absolute;
  top: 6px;
  right: 6px;
  border: none;
  background: transparent;
  color: #86909c;
  cursor: pointer;
  font-size: 14px;
}
.rte-formula-preview {
  max-width: 100%;
  overflow-x: auto;
  color: #1d2129;
}
.rte-formula-preview.display {
  text-align: center;
  width: 100%;
}
.rte-formula-preview-ph {
  color: #a9b4c8;
  font-size: 13px;
}

/* 插入表格 */
.rte-table-dialog,
.rte-link-import-dialog {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  padding: 22px 24px 20px;
  box-sizing: border-box;
}
.rte-table-title {
  margin: 0 0 18px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: #1d2129;
}
.rte-table-field {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 10px 0 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  margin-bottom: 12px;
  background: #fff;
  box-sizing: border-box;
}
.rte-table-field:focus-within {
  border-color: #8da5ff;
  box-shadow: 0 0 0 2px rgba(141, 165, 255, 0.2);
}
.rte-table-field-icon {
  color: #a9aeb8;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rte-table-field-svg {
  width: 18px;
  height: 18px;
  display: block;
}
.rte-table-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #1d2129;
  height: 100%;
}
.rte-table-input::placeholder {
  color: #a9b4c8;
}
.rte-table-input::-webkit-outer-spin-button,
.rte-table-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.rte-table-input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
.rte-table-stepper {
  display: inline-flex;
  flex-direction: column;
  gap: 0;
}
.rte-table-stepper button {
  border: none;
  background: transparent;
  color: #86909c;
  font-size: 10px;
  line-height: 1;
  padding: 1px 4px;
  cursor: pointer;
}
.rte-table-stepper button:hover {
  color: #1d2129;
}
.rte-link-import-hint {
  margin: -6px 0 14px;
  font-size: 12px;
  color: #86909c;
  line-height: 1.5;
}


/* 插入链接 */
.rte-find-dialog {
  min-width: 380px;
  max-width: min(480px, 94vw);
}
.rte-find-case {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4e5969;
  margin: 0 0 14px;
  user-select: none;
}
.rte-find-case input {
  margin: 0;
}
.rte-find-opts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 8px;
}
.rte-find-status {
  margin-left: auto;
  color: #86909c;
  font-variant-numeric: tabular-nums;
}
.rte-find-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.rte-code-tool-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rte-code-lang-select {
  height: 28px;
  max-width: 110px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  color: #1d2129;
  font-size: 12px;
  padding: 0 6px;
  outline: none;
}
.rte-code-lang-select:focus {
  border-color: #5b8cff;
}
.rte-root .tiptap pre code.hljs,
.rte-root .ProseMirror pre code.hljs,
.rte-root .tiptap pre .hljs,
.rte-root .ProseMirror pre .hljs {
  background: transparent;
  padding: 0;
}
.rte-root sub,
.rte-root sup {
  font-size: 0.75em;
  line-height: 0;
}
.rte-ask-message {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.55;
  color: #86909c;
  white-space: pre-wrap;
}
.rte-ask-mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.rte-link-dialog {
  width: min(420px, 100%);
  background: var(--mm-surface, #fff);
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  padding: 22px 24px 20px;
  box-sizing: border-box;
}
.rte-link-popover-layer {
  position: fixed;
  inset: 0;
  z-index: 4100;
  background: transparent;
}
.rte-link-popover {
  position: fixed;
  width: min(360px, calc(100vw - 16px));
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(32, 33, 36, 0.14);
}
.rte-link-popover-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mm-text, #202124);
}
.rte-link-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--mm-muted, #5f6368);
}
.rte-link-field span {
  flex: 0 0 28px;
}
.rte-link-field input {
  flex: 1 1 auto;
  min-width: 0;
  height: 32px;
  border: 1px solid var(--mm-line-strong, #dadce0);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--mm-text, #202124);
  background: var(--mm-surface, #fff);
}
.rte-link-field input:focus {
  outline: none;
  border-color: var(--mm-blue, #1a73e8);
  box-shadow: var(--mm-focus, 0 0 0 3px rgba(26, 115, 232, 0.35));
}
.rte-link-text-btn,
.rte-link-primary {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--mm-text, #202124);
  font-size: 12px;
  cursor: pointer;
}
.rte-link-text-btn:hover {
  background: #f1f3f4;
}
.rte-link-text-btn.is-danger {
  color: var(--mm-red, #d93025);
}
.rte-link-primary {
  background: var(--mm-blue, #1a73e8);
  color: #fff;
}
.rte-link-primary:hover {
  background: var(--mm-blue-deep, #174ea6);
}
.rte-link-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.rte-modal-actions-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}
.rte-link-unlink {
  color: #c62828 !important;
  border-color: #f5c6cb !important;
}
.rte-bubble-btn-danger:hover,
.rte-bubble-btn-danger.active {
  background: var(--mm-red-soft, #fce8e6);
  color: var(--mm-red, #d93025);
}
.rte-code-copy-btn {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  color: #4e5969;
  font-size: 12px;
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
}
.rte-code-copy-btn:hover {
  background: #f2f3f5;
  color: #1d2129;
  border-color: #c9cdd4;
}
.rte-table-dialog {
  width: min(460px, 100%);
}
.rte-table-grid-picker {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin: 0 0 14px;
  /* equal L/R padding — no leftover empty strip on the right */
  padding: 10px;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fafbfc;
  box-sizing: border-box;
  width: 100%;
}
.rte-table-grid-row {
  display: grid;
  /* columns set via inline style from TABLE_GRID_MAX_COLS (1fr each) */
  gap: 3px;
  width: 100%;
}
.rte-table-grid-cell {
  width: 100%;
  min-width: 0;
  aspect-ratio: 1 / 1;
  height: auto;
  padding: 0;
  margin: 0;
  border: 1px solid #c9cdd4;
  border-radius: 2px;
  background: #fff;
  cursor: pointer;
  box-sizing: border-box;
}
.rte-table-grid-cell.hot {
  background: #e8f3ff;
  border-color: #94bfff;
}
.rte-table-grid-cell:hover {
  outline: 1px solid #165dff;
  outline-offset: 0;
}
.rte-table-grid-label {
  font-size: 12px;
  color: #4e5969;
  font-variant-numeric: tabular-nums;
  min-height: 18px;
  user-select: none;
}

/* 插入图片 — 固定宽高，避免空/满库时跳动 */

/* 选择附件（复用图片弹窗骨架，单栏标题） */
.rte-attach-dialog .rte-attach-title-bar {
  flex-shrink: 0;
  padding: 14px 20px 10px;
  border-bottom: 1px solid #eef0f3;
}
.rte-attach-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1d2129;
  text-align: center;
}
.rte-attach-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px 10px;
  background: #f7f8fa;
  overflow: hidden;
}
.rte-attach-thumb-ext {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 28px;
  padding: 0 8px;
  border-radius: 4px;
  background: #5b8cff;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.rte-attach-thumb-name {
  width: 100%;
  font-size: 12px;
  color: #1d2129;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
  box-sizing: border-box;
}
.rte-attach-thumb-size {
  font-size: 11px;
  color: #86909c;
}
.rte-root .rte-attachment-link,
.rte-root a.rte-attachment-link {
  color: #3b5bdb;
  text-decoration: underline;
  word-break: break-all;
}

.rte-image-dialog {
  width: 720px;
  height: 520px;
  max-width: 96vw;
  max-height: 92vh;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  padding: 0 0 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rte-image-tabs {
  display: flex;
  gap: 28px;
  padding: 14px 20px 0;
  border-bottom: 1px solid #eef0f3;
  flex-shrink: 0;
}
.rte-image-tab {
  position: relative;
  border: none;
  background: transparent;
  padding: 0 2px 12px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
}
.rte-image-tab.active {
  color: #1d2129;
  font-weight: 600;
}
.rte-image-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: #5b8cff;
  border-radius: 1px;
}
.rte-image-personal {
  display: grid;
  grid-template-columns: 200px 1fr; /* 加宽左侧分类，避免中文换行 */
  flex: 1 1 auto;
  min-height: 0;
  height: 0; /* fill remaining fixed dialog body */
  overflow: hidden;
}
.rte-image-sidebar {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  border-right: 1px solid #eef0f3;
  background: #fafbfc;
  overflow-x: hidden;
  overflow-y: auto;
  min-width: 0;
}
.rte-image-side-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #4e5969;
  cursor: pointer;
  white-space: nowrap; /* 图标+文字单行 */
  min-width: 0;
  box-sizing: border-box;
}
.rte-image-side-item:hover,
.rte-image-side-item.active {
  background: #eef3ff;
  color: #3b5bdb;
}
.rte-image-side-ico {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
}
.rte-image-side-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rte-image-side-spacer {
  flex: 1;
  min-height: 12px;
}
.rte-image-add-cat {
  color: #86909c;
}
.rte-image-add-cat-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
}
.rte-image-add-cat-input {
  height: 32px;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
}
.rte-image-add-cat-input:focus {
  border-color: #8da5ff;
}
.rte-image-add-cat-ok {
  height: 28px;
  border: none;
  border-radius: 4px;
  background: #8da5ff;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}
.rte-image-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 10px 14px 8px;
  overflow: hidden;
}
.rte-image-main-top {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.rte-image-select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #86909c;
  cursor: pointer;
  user-select: none;
}
.rte-image-grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  align-content: start;
  padding-bottom: 4px;
}
/* 空库：上传卡片在主内容区水平+垂直居中 */
.rte-image-grid.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  grid-template-columns: none;
}
.rte-image-upload-card {
  width: 148px;
  height: 148px;
  flex: 0 0 auto;
  border: 1px dashed #c9cdd4;
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  color: #4e5969;
  padding: 12px;
  box-sizing: border-box;
}
.rte-image-grid:not(.empty) .rte-image-upload-card {
  width: auto;
  height: auto;
  aspect-ratio: 1;
}
.rte-image-upload-card:hover {
  border-color: #5b8cff;
  background: #f7f9ff;
}
.rte-image-upload-label {
  font-size: 13px;
  color: #4e5969;
}
.rte-image-thumb {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
  background: #f2f3f5;
  cursor: pointer;
}
.rte-image-thumb.selected {
  border-color: #5b8cff;
}
.rte-image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.rte-video-thumb {
  display: flex;
  flex-direction: column;
  background: #0f172a;
}
.rte-video-thumb video {
  width: 100%;
  flex: 1;
  min-height: 0;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.rte-video-thumb-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 4px 6px;
  font-size: 11px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
.rte-image-thumb-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1.5px solid #fff;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.rte-image-thumb-check.on {
  background: #5b8cff;
  border-color: #5b8cff;
}
.rte-image-thumb-check.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.rte-image-external {
  padding: 16px 20px 8px;
  flex: 1 1 auto;
  min-height: 0;
  height: 0; /* same fixed body slot as personal tab */
  display: flex;
  flex-direction: column;
}
.rte-image-url-textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  color: #1d2129;
  resize: none; /* keep dialog height fixed */
  outline: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.5;
}
.rte-image-url-textarea:focus {
  border-color: #8da5ff;
  box-shadow: 0 0 0 2px rgba(141, 165, 255, 0.2);
}
.rte-image-url-textarea::placeholder {
  color: #a9b4c8;
}
.rte-image-actions {
  padding: 8px 20px 0;
  flex-shrink: 0;
}


/* —— Slash「/」命令菜单 —— */
.rte-slash-menu {
  min-width: 300px;
  max-width: min(420px, calc(100vw - 16px));
  padding: 0;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rte-slash-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 6px;
  border-bottom: 1px solid #f2f3f5;
  flex-shrink: 0;
}
.rte-slash-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.rte-slash-hint {
  font-size: 11px;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rte-slash-list {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 0 6px;
  flex: 1 1 auto;
}
.rte-slash-section {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #86909c;
  letter-spacing: 0.02em;
}
.rte-slash-item {
  display: flex;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
  color: #4e5969;
}
.rte-slash-item:hover,
.rte-slash-item.is-active {
  background: #f2f3f5;
  color: #1d2129;
}
.rte-slash-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rte-slash-item-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
}
.rte-slash-item-desc {
  font-size: 11px;
  color: #86909c;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rte-slash-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: #86909c;
  text-align: center;
}
.rte-root .rte-slash-decoration {
  background: rgba(22, 93, 255, 0.12);
  border-radius: 3px;
  box-decoration-break: clone;
}
.rte-import-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}


/* —— @提及 —— */
.rte-mention-menu {
  min-width: 260px;
  max-width: min(360px, calc(100vw - 16px));
  padding: 0;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rte-mention-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 6px;
  border-bottom: 1px solid #f2f3f5;
  flex-shrink: 0;
}
.rte-mention-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.rte-mention-hint {
  font-size: 11px;
  color: #86909c;
}
.rte-mention-list {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 0 6px;
  flex: 1 1 auto;
}
.rte-mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
  color: #4e5969;
}
.rte-mention-item:hover,
.rte-mention-item.is-active {
  background: #f2f3f5;
  color: #1d2129;
}
.rte-mention-item-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e8f3ff;
  color: #165dff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}
.rte-mention-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rte-mention-item-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
}
.rte-mention-item-role {
  font-size: 11px;
  color: #86909c;
}
.rte-mention-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: #86909c;
  text-align: center;
}
.rte-root .rte-mention {
  display: inline-flex;
  align-items: baseline;
  padding: 0 5px;
  margin: 0 1px;
  border-radius: 4px;
  background: #e8f3ff;
  color: #165dff;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  cursor: default;
}
.rte-root .rte-mention-decoration {
  background: rgba(22, 93, 255, 0.12);
  border-radius: 3px;
  box-decoration-break: clone;
}

/* —— 表单条件显示 —— */
.rte-root .rte-form-showif-badge {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 0 0 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff7e8;
  border: 1px solid #ffe4b8;
  color: #b26a00;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  user-select: none;
}
.rte-root .rte-form-showif-badge[hidden] {
  display: none !important;
}
.rte-root .rte-form.has-show-if {
  position: relative;
}
.rte-root .rte-form.rte-form-showif-would-hide {
  opacity: 0.55;
  outline: 1px dashed #ffb65c;
  outline-offset: 2px;
}
.rte-root .rte-form.rte-form-showif-hidden,
.rte-root .rte-form[hidden] {
  display: none !important;
}
.rte-root.mode-preview .rte-form-showif-badge {
  display: none !important;
}

/* —— Route C: 分页 / 分栏 / 表情 / 特殊字符 / 段距 / 字数 / 打印 —— */
.rte-root .rte-page-break {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 16px 0;
  border: none;
  height: 28px;
  background: repeating-linear-gradient(
    90deg,
    #c9cdd4 0 8px,
    transparent 8px 14px
  );
  background-position: center;
  background-size: 100% 2px;
  background-repeat: no-repeat;
  position: relative;
  user-select: none;
}
.rte-root .rte-page-break-label {
  background: #fff;
  color: #86909c;
  font-size: 12px;
  padding: 0 10px;
  letter-spacing: 0.08em;
}
.rte-root .rte-columns,
.rte-root .ProseMirror .rte-columns,
.rte-root .tiptap .rte-columns,
.rte-root div[data-type='columns'] {
  display: grid !important;
  gap: 16px !important;
  column-gap: 16px !important;
  row-gap: 16px !important;
  margin: 12px 0;
  padding: 10px;
  border: 1px dashed #c9cdd4 !important;
  border-radius: 8px;
  min-height: 88px !important;
  background: #fafbfc !important;
  box-sizing: border-box;
}
.rte-root .rte-columns-2,
.rte-root div[data-type='columns'][data-cols='2']:not([data-ratios]) {
  grid-template-columns: 1fr 1fr !important;
}
.rte-root .rte-columns-3,
.rte-root div[data-type='columns'][data-cols='3']:not([data-ratios]) {
  grid-template-columns: 1fr 1fr 1fr !important;
}
.rte-root .rte-columns-4,
.rte-root div[data-type='columns'][data-cols='4']:not([data-ratios]) {
  grid-template-columns: repeat(4, 1fr) !important;
}
.rte-root .rte-columns-5,
.rte-root div[data-type='columns'][data-cols='5']:not([data-ratios]) {
  grid-template-columns: repeat(5, 1fr) !important;
}
.rte-root .rte-columns-6,
.rte-root div[data-type='columns'][data-cols='6']:not([data-ratios]) {
  grid-template-columns: repeat(6, 1fr) !important;
}
.rte-columns-menu {
  min-width: 168px;
}
.rte-root .rte-column,
.rte-root .ProseMirror .rte-column,
.rte-root .tiptap .rte-column,
.rte-root div[data-type='column'] {
  min-width: 0;
  min-height: 72px !important;
  padding: 10px 12px;
  border: 1px dashed #91b3fa !important;
  border-radius: 6px;
  background: #f0f5ff !important;
  box-sizing: border-box;
  position: relative;
}
/* 空栏内段落也保留可见高度，便于点击落焦 */
.rte-root .rte-column > p,
.rte-root div[data-type='column'] > p {
  min-height: 1.65em;
  position: relative;
}
/* Placeholder 装饰 class + ProseMirror 空段（仅 trailingBreak）双通道占位 */
.rte-root .rte-column > p.is-empty::before,
.rte-root .rte-column > p.is-editor-empty::before,
.rte-root .rte-column > p[data-placeholder]::before,
.rte-root div[data-type='column'] > p.is-empty::before,
.rte-root div[data-type='column'] > p.is-editor-empty::before,
.rte-root .rte-column > p:has(> br.ProseMirror-trailingBreak:only-child)::before,
.rte-root div[data-type='column'] > p:has(> br.ProseMirror-trailingBreak:only-child)::before {
  color: #c0c4cc !important;
  content: '在此输入…' !important;
  float: left;
  height: 0;
  pointer-events: none;
  font-size: 13px;
  line-height: 1.65;
}
.rte-emoji-panel,
.rte-specialchars-panel {
  display: flex;
  flex-direction: column;
  /* 两者固定同高同宽，切换标签/面板时高度不变 */
  width: 380px;
  max-width: min(380px, calc(100vw - 24px));
  height: 340px;
  max-height: 340px;
  min-height: 340px;
  padding: 0;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 6000;
  overflow: hidden;
  box-sizing: border-box;
}
.rte-picker-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
  padding: 6px 8px 4px;
  border-bottom: 1px solid #e5e6eb;
  background: #fafafa;
  flex: 0 0 auto;
  height: 40px;
  min-height: 40px;
  max-height: 40px;
  overflow-x: auto;
  overflow-y: hidden;
  align-items: center;
  scrollbar-width: thin;
  box-sizing: border-box;
}
.rte-picker-tab {
  border: none;
  background: transparent;
  color: #4e5969;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.rte-picker-tab:hover {
  background: #f2f3f5;
  color: #1d2129;
}
.rte-picker-tab.active {
  background: #e8f3ff;
  color: #1772f6;
  font-weight: 600;
}
.rte-picker-grid {
  display: grid;
  gap: 2px;
  padding: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1 1 auto;
  min-height: 0; /* 固定面板高度下允许网格滚动 */
  height: auto;
  scrollbar-width: thin;
  align-content: start;
  box-sizing: border-box;
}
.rte-emoji-grid {
  grid-template-columns: repeat(10, minmax(0, 1fr));
}
.rte-emoji-grid--large {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}
.rte-emoji-grid--kaomoji {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}
.rte-emoji-grid--kaomoji .rte-emoji-btn--kaomoji {
  grid-column: span 1;
  min-height: 40px;
  font-size: 14px !important;
}
.rte-specialchars-grid {
  grid-template-columns: repeat(10, minmax(0, 1fr));
}
.rte-emoji-btn,
.rte-specialchars-btn {
  width: 100%;
  aspect-ratio: 1;
  min-height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #1d2129;
}
.rte-emoji-grid--large .rte-emoji-btn {
  font-size: 28px;
  min-height: 40px;
}
.rte-emoji-btn--kaomoji {
  aspect-ratio: auto;
  min-height: 36px;
  grid-column: span 2;
  font-size: 13px !important;
  padding: 4px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rte-specialchars-btn {
  font-size: 15px;
  font-family: "PingFang SC", "Helvetica Neue", Arial, "Segoe UI Symbol", "Noto Sans Symbols", sans-serif;
}
.rte-emoji-btn:hover,
.rte-specialchars-btn:hover {
  background: #f2f3f5;
}
.rte-spacing-panel {
  min-width: 200px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 6000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rte-spacing-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rte-spacing-label {
  font-size: 13px;
  color: #4e5969;
  white-space: nowrap;
}
.rte-spacing-select {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 13px;
  background: #fff;
}
.rte-wordstats-panel {
  min-width: 220px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 6000;
}
.rte-wordstats-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8px;
}
.rte-wordstats-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  color: #4e5969;
  padding: 4px 0;
}
.rte-wordstats-row strong {
  color: #1d2129;
  font-weight: 600;
}
.rte-wordstats-divider {
  height: 1px;
  background: #e5e6eb;
  margin: 6px 0;
}
.rte-tool.format-painter-on,
.rte-tool.active[title*='格式刷'] {
  color: #1772f6;
}

.rte-bookmark {
  border-bottom: 1px dashed #5b8cff;
  background: rgba(91, 140, 255, 0.08);
  border-radius: 2px;
  padding: 0 2px;
  scroll-margin-top: 80px;
}
.rte-bookmark-flash {
  outline: 2px solid #5b8cff;
  background: rgba(91, 140, 255, 0.2) !important;
  transition: background 0.3s ease;
}
.rte-quote--default {
  border-left: 3px solid #c9cdd4;
  padding-left: 12px;
  color: #4e5969;
}
.rte-quote--emphasis {
  border-left: 4px solid #5b8cff;
  background: rgba(91, 140, 255, 0.06);
  padding: 10px 14px;
  border-radius: 0 6px 6px 0;
}
.rte-quote--verse {
  border: none;
  text-align: center;
  font-style: italic;
  color: #4e5969;
  padding: 8px 24px;
}
.rte-quote-preview--default { border-left: 3px solid #c9cdd4; padding-left: 8px; }
.rte-quote-preview--emphasis { background: rgba(91, 140, 255, 0.1); padding: 2px 8px; border-radius: 4px; }
.rte-quote-preview--verse { font-style: italic; opacity: 0.85; }
.rte-image-width-label {
  font-size: 12px;
  color: #86909c;
  margin-right: 4px;
  align-self: center;
}
.rte-print-preview-overlay {
  z-index: 11000;
}
.rte-print-preview-dialog {
  width: min(860px, 94vw);
  max-height: 90vh;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rte-print-preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e6eb;
}
.rte-print-preview-actions {
  display: flex;
  gap: 8px;
}
.rte-print-preview-paper {
  padding: 28px 36px;
  overflow: auto;
  max-height: calc(90vh - 64px);
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.7;
  color: #1d2129;
}
.rte-print-preview-paper .rte-print-title {
  font-size: 1.6em;
  margin: 0 0 16px;
}
.rte-print-preview-paper img {
  max-width: 100%;
  height: auto;
}

/* —— Wave20 —— */
.rte-emphasis-dot {
  text-emphasis-style: filled dot;
  text-emphasis-position: under;
  -webkit-text-emphasis-style: filled dot;
  -webkit-text-emphasis-position: under;
}
.rte-toggle-block {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  margin: 8px 0;
  background: #fafbfc;
}
.rte-toggle-summary {
  cursor: pointer;
  padding: 8px 12px;
  font-weight: 600;
  user-select: none;
}
.rte-toggle-summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 6px;
  transition: transform 0.15s;
}
.rte-toggle-block.is-open .rte-toggle-summary::before {
  transform: rotate(90deg);
}
.rte-toggle-body {
  padding: 0 12px 10px;
}
.rte-audio {
  width: 100%;
  max-width: 480px;
  margin: 8px 0;
}
.rte-link-card {
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  margin: 10px 0;
  overflow: hidden;
  background: #fff;
}
.rte-link-card-anchor {
  display: block;
  padding: 12px 14px;
  text-decoration: none;
  color: inherit;
}
.rte-link-card-title {
  display: block;
  font-weight: 600;
  color: #1d2129;
}
.rte-link-card-url {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #86909c;
  word-break: break-all;
}
.rte-link-card-bar {
  padding: 8px 12px;
  border-bottom: 1px solid #e5e6eb;
  background: #f7f8fa;
}
.rte-link-card-frame {
  width: 100%;
  height: 320px;
  border: 0;
  background: #f2f3f5;
}
.rte-footnote {
  color: #5b8cff;
  cursor: help;
  font-size: 0.75em;
}
.rte-sensitive-hit {
  background: rgba(255, 77, 79, 0.18);
  border-bottom: 2px wavy #ff4d4f;
}
.rte-rev-changed {
  background: rgba(250, 173, 20, 0.12);
  box-shadow: inset 3px 0 0 #faad14;
}
.rte-rev-added {
  background: rgba(82, 196, 26, 0.1);
  box-shadow: inset 3px 0 0 #52c41a;
}
/* —— Wave21 —— */
.rte-root.is-heading-auto-num :deep(.ProseMirror) {
  counter-reset: h1;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h1) {
  counter-reset: h2;
  counter-increment: h1;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h1)::before {
  content: counter(h1) '. ';
  color: #86909c;
  font-weight: 600;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h2) {
  counter-reset: h3;
  counter-increment: h2;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h2)::before {
  content: counter(h1) '.' counter(h2) ' ';
  color: #86909c;
  font-weight: 600;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h3) {
  counter-reset: h4;
  counter-increment: h3;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h3)::before {
  content: counter(h1) '.' counter(h2) '.' counter(h3) ' ';
  color: #86909c;
  font-weight: 600;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h4) {
  counter-increment: h4;
}
.rte-root.is-heading-auto-num :deep(.ProseMirror h4)::before {
  content: counter(h1) '.' counter(h2) '.' counter(h3) '.' counter(h4) ' ';
  color: #86909c;
}
.rte-root.is-immersive {
  position: fixed !important;
  inset: 0;
  z-index: 4000;
  background: var(--rte-bg, #fff);
  border-radius: 0 !important;
  max-width: none !important;
}
.rte-root.is-immersive .rte-toolbar {
  border-radius: 0;
}
.rte-ruby {
  position: relative;
  display: inline-block;
  padding-top: 0.85em;
  line-height: 1.2;
}
.rte-ruby::before {
  content: attr(data-ruby);
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  font-size: 0.62em;
  line-height: 1;
  color: #86909c;
  white-space: nowrap;
  pointer-events: none;
}
.rte-status-chip {
  display: inline-block;
  padding: 1px 8px;
  margin: 0 2px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.6;
  vertical-align: middle;
  font-weight: 500;
}
.rte-status-chip--gray { background: #f2f3f5; color: #4e5969; }
.rte-status-chip--blue { background: #e8f3ff; color: #165dff; }
.rte-status-chip--green { background: #e8ffea; color: #00b42a; }
.rte-status-chip--orange { background: #fff7e8; color: #ff7d00; }
.rte-status-chip--red { background: #ffece8; color: #f53f3f; }
.rte-status-chip--purple { background: #f5e8ff; color: #722ed1; }
.rte-progress-bar {
  margin: 10px 0;
  padding: 10px 12px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fafbfc;
}
.rte-progress-bar-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 6px;
  color: #4e5969;
}
.rte-progress-bar-track {
  height: 8px;
  border-radius: 999px;
  background: #e5e6eb;
  overflow: hidden;
}
.rte-progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #5b8cff, #165dff);
  border-radius: 999px;
}
.rte-timeline {
  margin: 12px 0;
  padding-left: 14px;
  border-left: 2px solid #bedaff;
}
.rte-timeline-item {
  position: relative;
  margin: 0 0 14px 10px;
}
.rte-timeline-item::before {
  content: '';
  position: absolute;
  left: -21px;
  top: 6px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #165dff;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #bedaff;
}
.rte-timeline-item-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
}
.rte-timeline-time {
  font-size: 12px;
  color: #86909c;
  min-width: 72px;
}
.rte-timeline-title {
  font-weight: 600;
  color: #1d2129;
}
.rte-tabs-block {
  margin: 12px 0;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  overflow: hidden;
}
.rte-tabs-bar {
  display: flex;
  gap: 0;
  background: #f7f8fa;
  border-bottom: 1px solid #e5e6eb;
}
.rte-tabs-tab {
  border: 0;
  background: transparent;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #4e5969;
}
.rte-tabs-tab.is-active {
  background: #fff;
  color: #165dff;
  font-weight: 600;
  box-shadow: inset 0 -2px 0 #165dff;
}
.rte-tabs-body {
  padding: 12px;
  min-height: 48px;
}
.rte-mermaid-block {
  margin: 12px 0;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.rte-mermaid-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #f7f8fa;
  border-bottom: 1px solid #e5e6eb;
  font-size: 12px;
  color: #4e5969;
}
.rte-mermaid-toolbar button {
  border: 1px solid #e5e6eb;
  background: #fff;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}
.rte-mermaid-preview {
  padding: 12px;
  overflow-x: auto;
  text-align: center;
}
.rte-mermaid-source {
  width: 100%;
  min-height: 120px;
  border: 0;
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  box-sizing: border-box;
}
.rte-mermaid-error {
  color: #f53f3f;
  text-align: left;
  white-space: pre-wrap;
  font-size: 12px;
}
.rte-root :deep(img[data-radius='4px']) { border-radius: 4px; }
.rte-root :deep(img[data-radius='8px']) { border-radius: 8px; }
.rte-root :deep(img[data-radius='16px']) { border-radius: 16px; }
.rte-root :deep(img[data-radius='9999px']) { border-radius: 9999px; }
.rte-root :deep(img[data-shadow='0 2px 8px rgba(0,0,0,.12)']) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.rte-root :deep(img[data-shadow='0 8px 24px rgba(0,0,0,.18)']) {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.rte-root :deep(img[data-border='1px solid #e5e6eb']) {
  border: 1px solid #e5e6eb;
}
.rte-root :deep(img[data-border='2px solid #5b8cff']) {
  border: 2px solid #5b8cff;
}
.rte-cross-ref {
  color: #165dff;
  cursor: default;
  border-bottom: 1px dashed #94bfff;
  padding: 0 2px;
}
.rte-menu-desc {
  display: block;
  font-size: 11px;
  color: #86909c;
  font-weight: 400;
}
.rte-snippet-dialog {
  max-width: 520px;
  max-height: 80vh;
  overflow: auto;
}
.rte-root.is-focus-mode .rte-toolbar {
  display: none;
}
.rte-root.is-focus-mode .rte-workspace {
  max-width: 720px;
  margin: 0 auto;
}
.rte-root.is-dark-editor .rte-canvas,
.rte-root.is-dark-editor .rte-body,
.rte-root.is-dark-editor .ProseMirror {
  background: #1d2129 !important;
  color: #e5e6eb !important;
}
.rte-root.is-dark-editor .ProseMirror a {
  color: #7eb6ff;
}
.rte-canvas.is-paper-guide .rte-body,
.rte-canvas.is-paper-guide .ProseMirror {
  max-width: 794px; /* ~A4 @ 96dpi */
  margin-left: auto;
  margin-right: auto;
  box-shadow: 0 0 0 1px #e5e6eb, 0 8px 24px rgba(0, 0, 0, 0.06);
  padding: 48px 56px;
  min-height: 1123px;
  background: #fff;
}
.rte-root.is-table-sticky .tableWrapper {
  max-height: 420px;
  overflow: auto;
}
.rte-root.is-table-sticky .tableWrapper table thead th,
.rte-root.is-table-sticky .tableWrapper tr:first-child th,
.rte-root.is-table-sticky .tableWrapper tr:first-child td {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f7f8fa;
}
/* 轻量中文禁则 */
.rte-root.is-cjk-typography .ProseMirror {
  line-break: strict;
  word-break: break-word;
  hanging-punctuation: allow-end;
}
.rte-root.is-cjk-typography .ProseMirror p {
  text-spacing-trim: space-all;
}

@media print {
  body * {
    visibility: hidden !important;
  }
  .rte-root.rte-printing,
  .rte-root.rte-printing * {
    visibility: visible !important;
  }
  .rte-root.rte-printing {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: #fff !important;
  }
  .rte-root.rte-printing .rte-toolbar,
  .rte-root.rte-printing .rte-bottom,
  .rte-root.rte-printing .rte-title,
  .rte-root.rte-printing .rte-view-mode-tool,
  .rte-root.rte-printing .rte-form-inspector,
  .rte-root.rte-printing [class*='inspector'] {
    display: none !important;
  }
  .rte-root.rte-printing .rte-page-break {
    break-after: page;
    page-break-after: always;
    height: 0;
    margin: 0;
    background: none;
  }
  .rte-root.rte-printing .rte-page-break-label {
    display: none;
  }
  .rte-root.rte-printing .rte-columns {
    border: none;
    padding: 0;
  }
  .rte-root.rte-printing .rte-column {
    background: transparent;
  }
}


.rte-shortcuts-panel {
  position: fixed !important;
  z-index: 6000 !important;
}
.rte-callout-menu.rte-float-menu,
.rte-menu.rte-callout-menu {
  min-width: 180px;
}


/* —— 本轮：分割线变体 / 图片对齐 / 列表层级 / 预览条 / 表格色板 / 图片气泡 —— */
.rte-root :deep(hr.rte-hr),
.rte-root :deep(hr[data-variant]) {
  border: none;
  border-top: 1px solid #d1d5db;
  margin: 1.1em 0;
}
.rte-root :deep(hr.rte-hr--dashed),
.rte-root :deep(hr[data-variant='dashed']) {
  border-top-style: dashed;
}
.rte-root :deep(hr.rte-hr--double),
.rte-root :deep(hr[data-variant='double']) {
  border-top-width: 3px;
  border-top-style: double;
  border-top-color: #9ca3af;
}
.rte-root :deep(hr.rte-hr--thick),
.rte-root :deep(hr[data-variant='thick']) {
  border-top-width: 3px;
  border-top-color: #6b7280;
}

.rte-root :deep(img.rte-image[data-align='left']) {
  float: left;
  margin: 0.25em 1em 0.6em 0;
  display: block;
}
.rte-root :deep(img.rte-image[data-align='right']) {
  float: right;
  margin: 0.25em 0 0.6em 1em;
  display: block;
}
.rte-root :deep(img.rte-image[data-align='center']) {
  float: none;
  display: block;
  margin: 0.6em auto;
}
.rte-root :deep(img.rte-image[data-caption]:not([data-caption=''])) {
  outline: 1px solid transparent;
}
.rte-image-bubble {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 10px;
  min-width: 220px;
}
.rte-image-bubble-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.rte-image-caption-input {
  flex: 1;
  min-width: 120px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
}

.rte-root :deep(ul),
.rte-root :deep(ol) {
  border-left: 2px solid transparent;
  padding-left: 1.25em;
  margin-left: 0.15em;
}
.rte-root :deep(ul ul),
.rte-root :deep(ol ol),
.rte-root :deep(ul ol),
.rte-root :deep(ol ul) {
  border-left-color: #e5e7eb;
  margin-left: 0.15em;
}
.rte-root :deep(ul ul ul),
.rte-root :deep(ol ol ol),
.rte-root :deep(ul ul ol),
.rte-root :deep(ol ol ul) {
  border-left-color: #bfdbfe;
}
.rte-root :deep(ul ul ul ul),
.rte-root :deep(ol ol ol ol) {
  border-left-color: #93c5fd;
}
.rte-menu-hint {
  padding: 4px 12px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}

.rte-preview-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  margin: 0 0 8px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  color: #1e40af;
  font-size: 13px;
}
.rte-preview-back {
  border: 1px solid #93c5fd;
  background: #fff;
  color: #1d4ed8;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.rte-preview-back:hover {
  background: #dbeafe;
}

.rte-table-cell-style {
  padding: 4px 4px 8px;
}
.rte-table-cell-style-title {
  font-size: 12px;
  color: #6b7280;
  margin: 8px 0 6px;
}
.rte-table-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rte-table-swatch {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  padding: 0;
  font-size: 10px;
  cursor: pointer;
  line-height: 20px;
  text-align: center;
  color: #6b7280;
  background: #fff;
}
.rte-table-border-styles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rte-table-border-btn {
  text-align: left;
}

.rte-root :deep(td[data-border-style='none']),
.rte-root :deep(th[data-border-style='none']) {
  border-style: none !important;
}
.rte-root :deep(td[data-border-style='dashed']),
.rte-root :deep(th[data-border-style='dashed']) {
  border-style: dashed !important;
}
.rte-root :deep(td[data-border-style='dotted']),
.rte-root :deep(th[data-border-style='dotted']) {
  border-style: dotted !important;
}
.rte-root :deep(td[data-border-style='double']),
.rte-root :deep(th[data-border-style='double']) {
  border-style: double !important;
}


/* —— 高亮色板企业级打磨 —— */
.rte-float-menu.rte-highlight-menu,
.rte-highlight-menu {
  min-width: 232px;
  max-width: 280px;
  padding: 10px 12px 8px;
  overflow: visible;
  z-index: 4000;
}
.rte-hl-current {
  font-size: 12px;
  color: #4e5969;
  margin: 0 2px 8px;
  padding: 4px 8px;
  background: #f7f8fa;
  border-radius: 4px;
  line-height: 1.4;
}
.rte-hl-clear {
  font-weight: 500;
}
.rte-highlight-swatches {
  display: grid !important;
  grid-template-columns: repeat(5, 28px) !important;
  grid-auto-rows: 28px;
  gap: 6px !important;
  margin: 0 2px 8px !important;
  justify-content: start;
}
.rte-color-menu .rte-hl-swatch,
.rte-hl-swatch {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  border-radius: 4px !important;
}
.rte-hl-hover-hint {
  margin: 6px 2px 2px;
  min-height: 18px;
  font-size: 11px;
  color: #86909c;
  line-height: 18px;
}
.rte-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.rte-code-lang-wrap {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
}
.rte-code-lang-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #1d2129;
  cursor: pointer;
  max-width: 120px;
  white-space: nowrap;
}
.rte-code-lang-btn:hover,
.rte-code-lang-btn.active {
  border-color: #94bfff;
  color: #165dff;
}
.rte-code-lang-menu {
  max-height: 280px;
  overflow: auto;
  min-width: 140px;
}
.rte-tool.is-disabled,
.rte-tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

</style>
