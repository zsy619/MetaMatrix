<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
} from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useDocumentStore } from '../stores/document'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { TABLE_CELL_BG_PRESETS, TABLE_BORDER_STYLE_PRESETS } from '../extensions/rteTableCells'
import { HR_VARIANT_OPTIONS, type RteHrVariant } from '../extensions/rteHorizontalRule'
import { ElMessage } from 'element-plus'
import { looksLikeHtml, escapeHtml } from '../utils/itemsHtml'
import { renderKatex } from '../extensions/math'
import {
  isFormNodeName,
  type FormNodeName,
} from '../extensions/forms'
import { toolbarIconMap, IconTableRows, IconTableCols } from './rteToolbarIcons'
import { RTE_CODE_LANGUAGES } from '../extensions/codeHighlight'
import 'highlight.js/styles/github.css'
import {
  RTE_DOC_TEMPLATES,
  RTE_DOC_TEMPLATE_GROUPS,
  getRteDocTemplate,
  sanitizeRteJsonNodes,
} from './rteDocTemplates'
import type { Component } from 'vue'
import {
  rteSlashGlyph,
  rteSlashSectionLabel,
  type RteSlashItem,
} from './rteSlashItems'
import { mentionSectionLabel } from './rteMentionItems'
import {
  FEISHU_BATCH3_SHORTCUTS,
} from '../utils/rteBatch3'
import {
  FEISHU_HIGHLIGHT_COLORS,
  FEISHU_TEXT_COLORS,
} from '../utils/rtePasteClean'
import { todayIso } from '../utils/rteRound5'
import { RTE_PAGE_SIZES } from '../utils/rtePageSize'
import { PAGE_MARGIN_PRESETS } from '../utils/rtePageMargin'
import { focusDialogRoot } from '../utils/rteRound8'
import {
  embedIframeSrc,
} from '../utils/rteRound6'
import {
  filterLabeledTargets,
  mentionEmptyHint,
  shortcutSearchText,
  stepMenuIndex,
  textMatchesQuery,
  togglePreviewMode,
} from '../utils/rteRound7'
import { type CalloutVariant } from '../extensions/callout'
import { orderedListContinuation } from '../utils/rteListContinue'
import { planListRenumber } from '../utils/rteListRenumber'
import {
  FIRST_LINE_INDENT,
  LINK_BUTTON_TONES,
  safeLinkButtonHref,
  type LinkButtonTone,
} from '../utils/rtePracticalToolbar'
import { QUOTE_STYLE_OPTIONS, type QuoteStyle } from '../extensions/rteBlockquote'
import { collectCrossRefTargets } from '../extensions/crossRef'
import {
  applyParagraphStyle,
  PARA_STYLE_OPTIONS,
  ORDERED_LIST_STYLE_OPTIONS,
  checkHeadingHierarchy,
  checkDocumentLinks,
  estimateReadingMinutes,
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
  renumberCaptions,
  RTE_ZOOM_PRESETS,
  type CaseMode,
} from './rteWave20'
import { countWords, normalizeHtml, toEditorContent } from '../utils/rteContent'
import { htmlWithSuggestionsAccepted } from '../utils/rteSuggestions'
import { useCommentThreads } from './rte/composables/useCommentThreads'
import { useSuggestionMode } from './rte/composables/useSuggestionMode'
import { RTE_CTX, type RteEditorEmit, type RteEditorProps } from './rte/context'
import { provideRteBindings } from './rte/bindings'
import RteToolbar from './rte/RteToolbar.vue'
import RteDocumentBody from './rte/RteDocumentBody.vue'
import RtePortals from './rte/RtePortals.vue'
import { bindAskMore, useAskDialog } from './rte/composables/useAskDialog'
import { useRtePageLayout } from './rte/composables/useRtePageLayout'
import { usePageChrome } from './rte/composables/usePageChrome'
import { EMPTY_PAGE_CHROME, PAGE_NUMBER_OPTIONS, type PanelPageChrome } from '../utils/rtePageChrome'
import { useToolbarGroups } from './rte/composables/useToolbarGroups'
import { buildToolbarGroups } from '../utils/rteToolbarGroups'
import { useFindReplace } from './rte/composables/useFindReplace'
import { useExport } from './rte/composables/useExport'
import { useImport } from './rte/composables/useImport'
import { useMediaLibrary } from './rte/composables/useMediaLibrary'
import { useTableOps } from './rte/composables/useTableOps'
import { useSlashMenu } from './rte/composables/useSlashMenu'
import { useMentionMenu } from './rte/composables/useMentionMenu'
import { useFloatMenus } from './rte/composables/useFloatMenus'
import { useOverlayStack } from './rte/composables/useOverlayStack'
import { useViewMode } from './rte/composables/useViewMode'
import { useBlockHandle } from './rte/composables/useBlockHandle'
import { useImageTools } from './rte/composables/useImageTools'
import { useDocChrome } from './rte/composables/useDocChrome'
import { useRteExtensions } from './rte/composables/useRteExtensions'
import { useDirectoryPeople } from './rte/composables/useDirectoryPeople'
import { useCrossDoc } from './rte/composables/useCrossDoc'
import type { DirectoryPermission } from '../utils/rteDirectory'
import { RTE_EMOJI_CATEGORIES } from '../utils/rteEmojiList'
import { RTE_SPECIAL_CHAR_CATEGORIES } from '../utils/rteSpecialChars'
import {
  ECHARTS_CHART_TYPES,
  ECHARTS_MAX_PER_DOCUMENT,
  buildEchartsTemplateOption,
  buildTemplateOption,
  serializeEchartsOption,
  type EchartsChartType,
  type EchartsTableData,
} from '../utils/rteEchartsOption'
import {
  ECHARTS_CATEGORIES,
  ECHARTS_TEMPLATES,
  findEchartsTemplate,
} from '../utils/echarts/templates'
import { CHART_GROUPS } from '../utils/echarts/chartGroups'
import {
  RTE_AFTER_EXPORT_EVENT,
  RTE_BEFORE_EXPORT_EVENT,
} from '../extensions/echartsBlock'
import { useChartPanelBridge } from './rte/chart-panel/useChartPanelBridge'
import ChartPanel from './rte/chart-panel/ChartPanel.vue'

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
    /** 与最大化 key / 相关资料 panelId 对齐，页面大小写入画布 JSON。 */
    panelId?: string
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
    panelId: '',
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

/** 表格菜单状态（须在 useEditor 之前声明，供 contextmenu 回调闭包使用） */
const {
  tableMenuOpen,
  tableOpsSheetOpen,
  tableCtx,
  closeTableCtx,
  openTableContextMenu,
  tableHeaderSticky,
  copyCurrentTable,
  promptTableRowFilter,
  setTableCellBg,
  setTableCellBorderColor,
  setTableCellBorderStyle,
  tableDialogOpen,
  tableQuickOpen,
  tableQuickHover,
  tableQuickCells,
  tableRows,
  tableCols,
  tableGridHover,
  TABLE_GRID_MAX_ROWS,
  TABLE_GRID_MAX_COLS,
  onTableGridHover,
  onTableGridLeave,
  pickTableGridSize,
  openTableDialog,
  closeTableDialog,
  onTableRowsInput,
  onTableColsInput,
  stepTableRows,
  stepTableCols,
  confirmInsertTable,
  isInTable,
  closeTableMenu,
  insertQuickTable,
  onTableQuickKeydown,
  closeTableOpsSheet,
  tableAddRowBefore,
  tableAddRowAfter,
  tableAddColBefore,
  tableAddColAfter,
  tableOpItems,
  onTableToolClick,
  onTableToolbarButtonClick,
} = useTableOps({
  editor: () => editor,
  viewMode: () => viewMode,
  moreOpen: () => moreOpen,
  headingOpen: () => headingOpen,
  listOpen: () => listOpen,
  formOpen: () => formOpen,
  colorOpen: () => colorOpen,
  highlightOpen: () => highlightOpen,
  alignOpen: () => alignOpen,
  closeImportMenu: () => {
    closeImportMenu()
  },
  closeExportMenu: () => {
    closeExportMenu()
  },
  closeFontMenus: () => {
    closeFontMenus()
  },
  focusOpenDialog: () => {
    focusOpenDialog()
  },
  announceRte: (msg) => {
    announceRte(msg)
  },
  rteToast: (type, message) => {
    rteToast(type, message)
  },
  openRtePrompt: (opts) => openRtePrompt(opts),
})

/** —— Slash「/」命令菜单状态（须在 useEditor 前声明，供 Suggestion 闭包） —— */
const {
  slashOpen,
  slashItems,
  slashIndex,
  slashQuery,
  slashMenuStyle,
  slashMenuEl,
  slashUi,
  pickSlashItem,
} = useSlashMenu({
  editor: () => editor,
  applySlashCommandItem,
})
void slashMenuEl

/** —— @提及建议菜单（与 Slash 同定位模式；候选见 rteMentionItems） —— */
const {
  mentionOpen,
  mentionItems,
  mentionIndex,
  mentionQuery,
  mentionMenuStyle,
  mentionMenuEl,
  mentionUi,
  pickMentionItem,
} = useMentionMenu({
  editor: () => editor,
})
void mentionMenuEl

/**
 * 组织通讯录里的真人。
 * - 数据来自 api/directory.listDirectoryUsers，后端没实现时回退到本地示例。
 * - 权限钩子：画布 JSON 的 mentionPermissionByPanelId，按面板决定谁能被 @。
 */
const mentionPermission = computed<DirectoryPermission | null>(() =>
  props.panelId ? documentStore.getPanelMentionPermission(props.panelId) : null,
)
const directoryPeople = useDirectoryPeople({
  editor: () => editor,
  permission: () => mentionPermission.value,
})

/** —— 大纲右键菜单 —— */
const outlineMenuOpen = ref(false)
const outlineMenuIndex = ref(-1)
const outlineMenuStyle = ref<Record<string, string>>({ position: 'fixed', left: '0px', top: '0px' })

/** 点别处时收起大纲右键菜单 */
function onDocPointerDownOutlineMenu(event: PointerEvent) {
  if (!outlineMenuOpen.value) return
  const t = event.target as HTMLElement | null
  if (t?.closest?.('.rte-outline-item')) return
  if (t?.closest?.('.rte-outline-menu')) return
  closeOutlineMenu()
}

function openOutlineMenu(index: number, event: MouseEvent) {
  outlineMenuIndex.value = index
  outlineMenuOpen.value = true
  outlineMenuStyle.value = {
    position: 'fixed',
    left: `${Math.max(8, event.clientX)}px`,
    top: `${Math.max(8, event.clientY)}px`,
  }
}

function closeOutlineMenu() {
  outlineMenuOpen.value = false
  outlineMenuIndex.value = -1
}

/** 大纲里当前右键的那一项 */
function outlineMenuItem() {
  const idx = outlineMenuIndex.value
  if (idx < 0) return null
  return outlineHeadings.value[idx] || null
}

function outlineMenuJump() {
  const item = outlineMenuItem()
  closeOutlineMenu()
  if (item) jumpToOutlineHeading(item)
}

async function outlineMenuCopyTitle() {
  const item = outlineMenuItem()
  closeOutlineMenu()
  if (!item) return
  try {
    await navigator.clipboard.writeText(item.text)
    ElMessage.success('已复制标题')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function outlineMenuCopyLink() {
  const item = outlineMenuItem()
  closeOutlineMenu()
  if (!item) return
  const docId = document_id.value || ''
  const panel = props.panelId || ''
  const href = `#/canvas/${encodeURIComponent(docId)}${
    panel ? `?panel=${encodeURIComponent(panel)}` : ''
  }#${encodeURIComponent(item.text)}`
  try {
    await navigator.clipboard.writeText(href)
    ElMessage.success('已复制标题链接')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

/** —— 页面设置面板（页面大小 / 页边距 / 页眉 / 页脚 / 页码） —— */
const pageSetupOpen = ref(false)

function openPageSetup() {
  pageSetupOpen.value = true
}

/** —— @ 提及权限面板 —— */
const directoryLoading = computed(() => directoryPeople.directoryLoading.value)
const directoryError = computed(() => directoryPeople.directoryError.value)
const mentionPermOpen = ref(false)
const mentionPermDepartments = ref<string[]>([])
const mentionPermRoles = ref<string[]>([])

/** 通讯录里出现过的部门 / 角色，作为勾选清单。 */
const directoryDepartments = computed(() => {
  const set = new Set<string>()
  for (const u of directoryPeople.directoryUsers.value) {
    const dept = String(u.department || '').trim()
    if (dept) set.add(dept)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh'))
})
const directoryRoles = computed(() => {
  const set = new Set<string>()
  for (const u of directoryPeople.directoryUsers.value) {
    const role = String(u.role || '').trim()
    if (role) set.add(role)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh'))
})

function openMentionPermission() {
  const perm = mentionPermission.value
  mentionPermDepartments.value = [...(perm?.allowedDepartments || [])]
  mentionPermRoles.value = [...(perm?.allowedRoles || [])]
  mentionPermOpen.value = true
  void directoryPeople.loadDirectoryUsers()
}

function toggleMentionPermValue(list: string[], value: string) {
  const at = list.indexOf(value)
  if (at < 0) list.push(value)
  else list.splice(at, 1)
}

function saveMentionPermission() {
  const panelId = props.panelId
  if (!panelId) {
    ElMessage.warning('当前面板没有 id，无法保存 @ 权限')
    mentionPermOpen.value = false
    return
  }
  const departments = mentionPermDepartments.value.filter(Boolean)
  const roles = mentionPermRoles.value.filter(Boolean)
  const permission: DirectoryPermission | null =
    departments.length || roles.length
      ? {
          allowedDepartments: departments.length ? departments : undefined,
          allowedRoles: roles.length ? roles : undefined,
        }
      : null
  documentStore.setPanelMentionPermission(panelId, permission)
  mentionPermOpen.value = false
  ElMessage.success(permission ? '已保存 @ 提及权限' : '已恢复默认可提及所有人')
}

function resetMentionPermission() {
  mentionPermDepartments.value = []
  mentionPermRoles.value = []
}

/** 粘贴为纯文本（工具栏开关；影响后续粘贴） */
const pastePlainTextMode = ref(false)
/** 浏览器拼写检查（默认关；可工具栏开启） */
const spellcheckEnabled = ref(false)
/** 打印预览浮层 */
const printPreviewOpen = ref(false)
const printPreviewHtml = ref('')

/** 统一自定义询问弹层（替代 window.prompt / confirm）。moreOpen 在工具栏状态处声明，这里先留钩子。 */
const askMoreCloser = { close: () => {} }
const {
  askOpen,
  askKind,
  askTitle,
  askMessage,
  askPlaceholder,
  askValue,
  askConfirmLabel,
  askCancelLabel,
  askMaxlength,
  askInputRef,
  closeAskDialog,
  openRtePrompt,
  openRteConfirm,
} = useAskDialog({ closeMore: () => askMoreCloser.close() })
void askInputRef

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
  let mode = linkCardMode.value
  if (mode === 'iframe' && !embedIframeSrc(href)) {
    ElMessage.warning('该地址不在嵌入白名单，已改为链接卡片')
    mode = 'card'
  }
  const ok = editor.value?.chain().focus().insertLinkCard({ href, mode }).run()
  if (!ok) ElMessage.warning('链接无效（仅支持 http/https）')
  else ElMessage.success(mode === 'iframe' ? '已插入嵌入' : '已插入链接卡片')
  closeLinkCardDialog()
}
/** 视图：缩放 / 专注 / 暗色 / 纸张参考线 */
const editorZoom = ref(1)
const focusMode = ref(false)
const darkEditor = ref(false)
const paperGuide = ref(false)
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
const xrefQuery = ref('')
const xrefIndex = ref(0)
const filteredXrefTargets = computed(() => filterLabeledTargets(xrefTargets.value, xrefQuery.value))
watch(xrefQuery, () => {
  xrefIndex.value = 0
})
const readTimeDialogOpen = ref(false)
const imageCompressOnInsert = ref(true)
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
const wordCountDockOpen = ref(false)

function toggleWordCountDock() {
  wordCountDockOpen.value = !wordCountDockOpen.value
}
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

const editorReady = ref(false)
const editorBootError = ref('')

/** 粘贴清洗：去掉脚本、Office 垃圾和危险协议，保留段落/列表/标题/链接/表格等结构。 */

const auth = useAuthStore()
const documentStore = useDocumentStore()
const { saving, dirty, conflict, document_id, current_data } = storeToRefs(documentStore)
const toolbarUndoBridge = {
  disarm() {},
  isNewer(_stamp: number) {
    return false
  },
}
const pageChrome = ref<PanelPageChrome>({ ...EMPTY_PAGE_CHROME })
const {
  pageChromeActive,
  screenPageLabel,
  previewPageLabel,
  setPageHeader,
  setPageFooter,
  setPageNumber,
  scheduleMeasure,
  presentOpen,
  presentUnit,
  presentIndex,
  presentSlides,
  presentRoot,
  openPresent,
  closePresent,
  stepPresent,
  setPresentUnit,
  onPresentStageClick,
} = usePageChrome({
  pageChrome,
  panelId: () => props.panelId,
  chromeMap: () => current_data.value?.pageChromeByPanelId,
  setPanelPageChrome: (panelId, chrome) => documentStore.setPanelPageChrome(panelId, chrome),
  viewMode: () => viewMode.value,
  editor: () => editor.value,
  rootEl: rteRootEl,
  pageSize: () => pageSize.value,
  margin: () => pageScreenMargin.value,
  announce: (message) => announceRte(message),
})
const {
  pageSize,
  pageSizeMeta,
  pageMargin,
  pageScreenMargin,
  pageSheetStyle,
  printPreviewMarginStyle,
  applyPrintPageStyle,
  undoPageMargin,
  setMarginPreset,
  setMarginSide,
  setPageSize,
  marginUndoArmed,
  marginUndoStamp,
  disarmMarginUndo,
} = useRtePageLayout({
  panelId: () => props.panelId,
  pageSizeMap: () => current_data.value?.pageSizeByPanelId,
  pageMarginMap: () => current_data.value?.pageMarginByPanelId,
  setPanelPageSize: (panelId, size) => documentStore.setPanelPageSize(panelId, size),
  setPanelPageMargin: (panelId, margin, paper) => documentStore.setPanelPageMargin(panelId, margin, paper),
  viewMode: () => viewMode.value,
  closePageMenus: () => {
    viewExtrasOpen.value = false
    moreOpen.value = false
  },
  announce: (message) => announceRte(message),
  disarmToolbarUndo: () => toolbarUndoBridge.disarm(),
  toolbarUndoIsNewer: (stamp) => toolbarUndoBridge.isNewer(stamp),
  chrome: () => pageChrome.value,
})

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

function rteAuthor() {
  return {
    id: auth.user?.id || 'local',
    name: auth.user?.displayName || auth.user?.email || '我',
  }
}

const {
  suggesting,
  suggestionAuthor,
  suggestionColor,
  toggleSuggesting,
  bumpSuggestions,
  suggestionRanges,
  activeSuggestionId,
  acceptAllSuggestions,
  rejectAllSuggestions,
  acceptActiveSuggestion,
  rejectActiveSuggestion,
} = useSuggestionMode({
  editor: () => editor,
  author: rteAuthor,
})

const editor = useRteExtensions({
  closeTableCtx,
  closeTableMenu,
  editorReady,
  isInTable,
  mentionUi,
  openTableContextMenu,
  pastePlainTextMode,
  shortcutsOpen,
  slashUi,
  tableAddColAfter,
  tableAddColBefore,
  tableAddRowAfter,
  tableAddRowBefore,
  tableCtx,
  tableMenuOpen,
  tableOpsSheetOpen,
  tableQuickOpen,
  undoPageMargin,
  applyFormatPainterIfNeeded,
  initialEditorContent,
  insertFormula,
  looksLikeMarkdown,
  looksLikeRichHtml,
  openFormulaFromChip,
  openLinkDialog,
  openPrintPreview,
  scheduleHtmlEmit,
  setHeading,
  syncSelectedFormFromEditor,
  toggleShortcutsPanel,
  props,
  emit,
  blockMenuOpen: () => blockMenuOpen,
  findDialogOpen: () => findDialogOpen,
  formSelectionTick: () => formSelectionTick,
  pasteFormatMode: () => pasteFormatMode,
  selectedFormPos: () => selectedFormPos,
  viewMode: () => viewMode,
  closeFindDialog: () => {
    closeFindDialog()
  },
  duplicateCurrentBlock: () => {
    duplicateCurrentBlock()
  },
  exportAsMarkdown: () => {
    void exportAsMarkdown()
  },
  imageFilesFromClipboard: (data: any) => imageFilesFromClipboard(data),
  insertDroppedBeside: (imagePos: any, side: any, files: any) => {
    void insertDroppedBeside(imagePos, side, files)
  },
  insertUserImages: (files: any, at?: any) => {
    void insertUserImages(files, at)
  },
  markdownToHtml: (text: any) => markdownToHtml(text),
  moveCurrentBlock: (dir: any) => {
    moveCurrentBlock(dir)
  },
  noteToolbarOrderEdited: () => {
    noteToolbarOrderEdited()
  },
  openBlockMenuForSelection: () => {
    openBlockMenuForSelection()
  },
  openFindDialog: () => {
    openFindDialog()
  },
  replaceOrInsertDroppedImages: (view: any, files: any, at?: any) => {
    void replaceOrInsertDroppedImages(view, files, at)
  },
  scheduleDocChrome: () => {
    scheduleDocChrome()
  },
  selectCurrentBlock: () => {
    selectCurrentBlock()
  },
  setViewMode: (mode: any) => {
    setViewMode(mode)
  },
  syncImageBubbleCaption: () => {
    syncImageBubbleCaption()
  },
  syncImageCropState: () => {
    syncImageCropState()
  },
  toggleOutlinePanel: () => {
    toggleOutlinePanel()
  },
  undoToolbarGroupOrder: () => undoToolbarGroupOrder(),
  suggestingEnabled: () => suggesting.value,
  suggestionAuthor,
  bumpSuggestions: () => bumpSuggestions(),
  mentionPeople: () => directoryPeople.mentionPeople(),
})

// 图表属性面板：选中图表块即弹出（侧栏）
const chartPanelBridge = useChartPanelBridge(editor)

const {
  commentsOpen,
  showResolved,
  draft: commentDraft,
  replyDrafts,
  activeThreadId,
  shownThreads,
  unresolvedCount,
  beginComment,
  cancelDraft,
  submitDraft,
  submitReply,
  toggleResolved,
  removeMessage,
  jumpToThread,
} = useCommentThreads({
  editor: () => editor,
  panelId: () => props.panelId || '',
  getMap: () => current_data.value?.commentThreadsByPanelId,
  setThreads: (panelId, threads) => documentStore.setPanelCommentThreads(panelId, threads),
  author: rteAuthor,
  isEditable: () => viewMode.value === 'edit',
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

const {
  toggleOutlinePanel,
  closeOutlinePanel,
  outlineHeadings,
  noteRows,
  notesOpen,
  historyOpen,
  revisions,
  revisionNote,
  formatRevisionTime,
  scheduleDocChrome,
  jumpNote,
  removeNote,
  nameCurrentRevision,
  restoreRevision,
  insertDocTitleBlock,
  activeOutlineIndex,
  showEmptyGuide,
  jumpToOutlineHeading,
} = useDocChrome({
  editor,
  outlineOpen,
  editorReady,
  charCount,
  props,
  viewMode: () => viewMode,
  closeAllToolbarMenus: () => {
    closeAllToolbarMenus()
  },
  openRtePrompt,
  openRteConfirm,
  panelId: () => props.panelId || '',
  readRevisions: () => {
    const id = props.panelId
    if (!id) return []
    return current_data.value?.editorRevisionsByPanelId?.[id]
  },
  setRevisions: (panelId, revisions) => documentStore.setPanelRevisions(panelId, revisions),
})

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
      { keys: 'Tab / Shift + Tab', desc: '段落、引用与列表缩进；表格内切换单元格' },
      { keys: 'Ctrl/⌘ + Enter', desc: '折叠块展开或收起' },
      { keys: 'Ctrl/⌘ + Alt + \\', desc: '只读预览与编辑切换' },
      { keys: 'Ctrl/⌘ + /', desc: '打开快捷键说明' },
      ...FEISHU_BATCH3_SHORTCUTS,
      { keys: 'Ctrl/⌘ + Alt + H', desc: '高亮 / 取消高亮' },
      { keys: 'Ctrl/⌘ + Alt + Enter', desc: '打开当前块的操作菜单' },
      { keys: '悬停块 · ⋮', desc: '转成标题、列表、提示块，或复制、删除、上下移' },
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
      { keys: 'Alt + ↑/↓', desc: '选中图片后上移 / 下移，可移入或移出分栏' },
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

const shortcutQuery = ref('')
const filteredShortcutGroups = computed(() => {
  const q = shortcutQuery.value
  return SHORTCUT_GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter((item) =>
      textMatchesQuery(shortcutSearchText(item.keys, item.desc), q),
    ),
  })).filter((group) => group.items.length > 0)
})

function toggleShortcutsPanel() {
  markToolbarMenuOpening()
  const next = !shortcutsOpen.value
  closeAllToolbarMenus()
  shortcutQuery.value = ''
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
  listOpen.value = false
  moreOpen.value = false
}

function ensureOrderedList(): boolean {
  const ed = editor.value
  if (!ed) return false
  if (ed.isActive('orderedList')) return true
  return ed.chain().focus().toggleOrderedList().run() && ed.isActive('orderedList')
}

function continueOrderedNumbering() {
  const ed = editor.value
  if (!ed || !ensureOrderedList()) return
  const found = orderedListContinuation(ed.state.doc, ed.state.selection.from)
  listOpen.value = false
  if (!found) {
    ElMessage.info('前面没有可延续的有序列表')
    return
  }
  ed.chain().focus().setOrderedListStart(found.next).run()
}

function restartOrderedNumbering() {
  const ed = editor.value
  if (!ed || !ensureOrderedList()) return
  ed.chain().focus().setOrderedListStart(1).run()
  listOpen.value = false
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
  if (!ensureOrderedList()) return
  editor.value?.chain().focus().setOrderedListStart(n).run()
  listStyleOpen.value = false
  listOpen.value = false
}

/**
 * 「列表从此处重编号」：把有序列表在当前项处切成两段，
 * 当前项及之后从 1 重新编号，前半段保持原编号。
 */
function renumberListFromHere() {
  const ed = editor.value
  if (!ed) return
  const plan = planListRenumber(ed.state.doc, ed.state.selection.from)
  listOpen.value = false
  if (!plan) {
    ElMessage.info('这里已经是列表的第一项，且从 1 开始')
    return
  }
  const list = ed.state.doc.nodeAt(plan.listPos)
  if (!list) return
  const items: any[] = []
  list.forEach((item: any) => items.push(item))
  const tr = ed.state.tr
  if (plan.itemIndex <= 0) {
    tr.setNodeMarkup(plan.listPos, undefined, { ...list.attrs, start: 1 })
  } else {
    const head = list.type.create(list.attrs, items.slice(0, plan.itemIndex))
    const tail = list.type.create({ ...list.attrs, start: 1 }, items.slice(plan.itemIndex))
    tr.replaceWith(plan.listPos, plan.listPos + list.nodeSize, [head, tail])
  }
  ed.view.dispatch(tr)
  ElMessage.success('已从这一项重新编号')
}

function toggleFirstLineIndent() {
  applyTextIndent(currentTextIndent() ? '' : FIRST_LINE_INDENT)
}

function setFirstLineIndent(on: boolean) {
  applyTextIndent(on ? FIRST_LINE_INDENT : '')
}

const linkButtonOpen = ref(false)

function paintLinkButton(tone: LinkButtonTone) {
  const ed = editor.value
  if (!ed) return
  linkButtonOpen.value = false
  if (!ed.isActive('linkButton')) {
    void insertLinkButton(tone)
    return
  }
  ed.chain().focus().updateAttributes('linkButton', { tone }).run()
}

async function insertLinkButton(tone: LinkButtonTone = 'blue') {
  const ed = editor.value
  if (!ed) return
  linkButtonOpen.value = false
  moreOpen.value = false
  const editing = ed.isActive('linkButton')
  const current = editing ? ed.getAttributes('linkButton') : {}
  const label = await openRtePrompt({
    title: '按钮文字',
    message: '按钮会打开你填的网页。编辑时用 Ctrl 或 ⌘ 点击打开。',
    defaultValue: String(current.label || '打开链接'),
    maxlength: 40,
  })
  if (label == null) return
  const hrefRaw = await openRtePrompt({
    title: '打开的链接',
    placeholder: 'https://',
    defaultValue: String(current.href || ''),
    maxlength: 500,
  })
  if (hrefRaw == null) return
  const href = safeLinkButtonHref(hrefRaw)
  if (!href) {
    ElMessage.warning('请输入 http 或 https 链接')
    return
  }
  const attrs = { label: label.trim() || '打开链接', href, tone }
  if (editing) ed.chain().focus().updateAttributes('linkButton', attrs).run()
  else ed.chain().focus().insertLinkButton(attrs).run()
}

async function editLinkButton() {
  const ed = editor.value
  if (!ed || !ed.isActive('linkButton')) return
  linkButtonOpen.value = false
  const attrs = ed.getAttributes('linkButton')
  const label = await openRtePrompt({
    title: '按钮文字',
    defaultValue: String(attrs.label || '打开链接'),
    maxlength: 40,
  })
  if (label == null) return
  const hrefRaw = await openRtePrompt({
    title: '打开的链接',
    defaultValue: String(attrs.href || ''),
    maxlength: 500,
  })
  if (hrefRaw == null) return
  const href = safeLinkButtonHref(hrefRaw)
  if (!href) {
    ElMessage.warning('请输入 http 或 https 链接')
    return
  }
  ed.chain().focus().updateAttributes('linkButton', { label: label.trim() || '打开链接', href }).run()
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

/** 文档里的图表块数量（超过上限会提示）。 */
function countEchartsBlocks(): number {
  const ed = editor.value
  if (!ed) return 0
  let count = 0
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'echartsBlock') count += 1
  })
  return count
}

/** 光标所在表格的数据（表头 + 数据行），不在表格里返回 null。 */
function currentEchartsTableData(): EchartsTableData | null {
  const ed = editor.value
  if (!ed) return null
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'table') continue
    const rows: string[][] = []
    node.forEach((row) => {
      const cells: string[] = []
      row.forEach((cell) => {
        cells.push(cell.textContent.trim())
      })
      rows.push(cells)
    })
    if (rows.length < 2) return null
    return { headers: rows[0] || [], rows: rows.slice(1) }
  }
  return null
}

/** 当前展开的图表分类下拉（工具栏上的 9 个一级分类各一个）。null 表示都收起。 */
const echartsGroupMenuKey = ref<string | null>(null)
const echartsDialogOpen = ref(false)
const echartsDialogTable = ref<EchartsTableData | null>(null)
const echartsDialogType = ref<EchartsChartType>('bar')
const echartsDialogTemplateId = ref('')
const echartsDialogTitle = ref('')
const echartsDialogUseTable = ref(false)
/** 工具栏下拉里展开的类别（null 表示全折叠）。 */
const echartsOpenCategory = ref<string | null>(null)

function echartsTypeLabel(type: EchartsChartType): string {
  return ECHARTS_CHART_TYPES.find((item) => item.value === type)?.label || '图表'
}

/** 插入一个带示例数据的可用图表。 */
function insertEchartsBlockAtCursor(
  type: EchartsChartType,
  opts: { title?: string; table?: EchartsTableData | null } = {},
) {
  const ed = editor.value
  if (!ed) return
  const count = countEchartsBlocks()
  if (count >= ECHARTS_MAX_PER_DOCUMENT) {
    ElMessage.warning(
      `单文档图表已达 ${ECHARTS_MAX_PER_DOCUMENT} 个，继续插入会拖慢页面（建议拆分文档）`,
    )
  }
  const option = buildTemplateOption(type, {
    title: opts.title || '',
    table: opts.table ?? null,
  })
  ed.chain()
    .focus()
    .insertEchartsBlock({
      option: serializeEchartsOption(option),
      chartType: type,
      theme: 'light',
      renderer: 'svg',
    })
    .run()
  echartsGroupMenuKey.value = null
  moreOpen.value = false
  ElMessage.success(`已插入${echartsTypeLabel(type)}（选中图表可在属性面板改类型 / 改数据）`)
}

/** 按模板 id 插入（工具栏下拉 / 对话框共用）。 */
function insertEchartsTemplateById(
  templateId: string,
  opts: { title?: string; table?: EchartsTableData | null } = {},
) {
  const ed = editor.value
  if (!ed) return
  const template = findEchartsTemplate(templateId)
  if (!template) return
  const count = countEchartsBlocks()
  if (count >= ECHARTS_MAX_PER_DOCUMENT) {
    ElMessage.warning(
      `单文档图表已达 ${ECHARTS_MAX_PER_DOCUMENT} 个，继续插入会拖慢页面（建议拆分文档）`,
    )
  }
  const option = buildEchartsTemplateOption(templateId, {
    title: opts.title || '',
    table: opts.table ?? null,
  })
  if (!option) return
  ed.chain()
    .focus()
    .insertEchartsBlock({
      option: serializeEchartsOption(option),
      chartType: template.categoryId,
      theme: 'light',
      renderer: template.renderer,
    })
    .run()
  echartsGroupMenuKey.value = null
  echartsOpenCategory.value = null
  moreOpen.value = false
  ElMessage.success(`已插入${template.label}（选中图表可在属性面板改类型 / 改数据）`)
}

/** 下拉里展开 / 收起某个类别。 */
function toggleEchartsCategory(categoryId: string) {
  echartsOpenCategory.value = echartsOpenCategory.value === categoryId ? null : categoryId
}

/** 一键生成面板：选类型 + 可选标题 + 可选用表格数据。 */
function openEchartsDialog() {
  echartsDialogTable.value = currentEchartsTableData()
  echartsDialogType.value = 'bar'
  echartsDialogTemplateId.value = 'bar-basic'
  echartsDialogTitle.value = ''
  echartsDialogUseTable.value = !!echartsDialogTable.value
  echartsDialogOpen.value = true
  echartsGroupMenuKey.value = null
  moreOpen.value = false
}

/** 对话框里切换类别（同步选中该类别的第一个子类型）。 */
function selectEchartsDialogCategory(categoryId: string) {
  echartsDialogType.value = categoryId
  const category = ECHARTS_CATEGORIES.find((item) => item.id === categoryId)
  if (category?.templates[0]) echartsDialogTemplateId.value = category.templates[0].id
}

function applyEchartsDialog(payload: {
  type: EchartsChartType
  templateId: string
  title: string
  useTable: boolean
}) {
  const table = payload.useTable
    ? echartsDialogTable.value || currentEchartsTableData()
    : null
  const templateId = payload.templateId || ''
  if (templateId) {
    insertEchartsTemplateById(templateId, { title: payload.title, table })
  } else {
    insertEchartsBlockAtCursor(payload.type, { title: payload.title, table })
  }
  echartsDialogOpen.value = false
}


function openXrefDialog() {
  const ed = editor.value
  if (!ed) return
  xrefTargets.value = collectCrossRefTargets(ed)
  xrefQuery.value = ''
  xrefIndex.value = 0
  xrefDialogOpen.value = true
  moreOpen.value = false
  focusOpenDialog()
}

function onXrefDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    xrefDialogOpen.value = false
    return
  }
  const items = filteredXrefTargets.value
  const next = stepMenuIndex(xrefIndex.value, items.length, event.key)
  if (next != null) {
    event.preventDefault()
    xrefIndex.value = next
    return
  }
  if (event.key === 'Enter') {
    const target = items[xrefIndex.value]
    if (!target) return
    event.preventDefault()
    confirmInsertXref(target)
  }
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
  // 提前把通讯录拉回来，@ 菜单打开时直接是真人
  void directoryPeople.loadDirectoryUsers()
  ed.chain().focus().insertContent('@').run()
  moreOpen.value = false
  ElMessage.info('已插入 @，请继续选择提及对象')
}

/** —— 选区气泡：复制 / 转链接 / 转表格 / 改写 —— */
/** 选区气泡里展开的二级菜单（颜色、改写等）。 */
const bubbleRewrite = ref<string | null>(null)

function selectionRange(): { from: number; to: number; text: string } | null {
  const ed = editor.value
  if (!ed) return null
  const { from, to } = ed.state.selection
  if (from === to) return null
  const text = ed.state.doc.textBetween(from, to, '\n')
  return { from, to, text }
}

/** 复制选中的文字。 */
async function copySelectedText() {
  const range = selectionRange()
  if (!range) {
    ElMessage.info('先选中一段文字')
    return
  }
  if (!range.text.trim()) {
    ElMessage.info('选区里没有文字')
    return
  }
  try {
    await navigator.clipboard.writeText(range.text)
    ElMessage.success('已复制选中文字')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

/** 把选中的文字变成链接。 */
async function selectionToLink() {
  const range = selectionRange()
  if (!range) {
    ElMessage.info('先选中要加链接的文字')
    return
  }
  const href = await openRtePrompt({
    title: '把选中文字变成链接',
    message: '填一个 http(s) 地址。留空则取消。',
    placeholder: 'https://',
    confirmLabel: '设为链接',
  })
  const url = (href || '').trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url)) {
    ElMessage.warning('链接需要以 http:// 或 https:// 开头')
    return
  }
  editor.value?.chain().focus().setLink({ href: url }).run()
  ElMessage.success('已设为链接')
}

/** 把选中的文字转成表格：按行拆行，按制表符拆列。 */
function selectionToTable() {
  const ed = editor.value
  const range = selectionRange()
  if (!ed || !range) {
    ElMessage.info('先选中要转成表格的文字')
    return
  }
  const lines = range.text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0)
  if (!lines.length) {
    ElMessage.info('选区里没有可转换的文字')
    return
  }
  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
  const cols = Math.max(...rows.map((row) => row.length))
  const body = rows
    .map((row) => {
      const cells = Array.from({ length: cols }, (_, i) => row[i] ?? '')
      return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    })
    .join('')
  const html = `<table><tbody>${body}</tbody></table>`
  ed.chain().focus().insertContentAt({ from: range.from, to: range.to }, html).run()
  ElMessage.success('已转成表格')
}

/**
 * 改写选区。当前是本地规则（stub），不调用外部 AI 服务。
 * - trim：清理多余空格与空行
 * - space：中英文之间补空格
 * - merge：把连续短行合并成一段
 */
function rewriteSelection(mode: 'trim' | 'space' | 'merge') {
  const ed = editor.value
  const range = selectionRange()
  if (!ed || !range) {
    ElMessage.info('先选中要改写的文字')
    return
  }
  let next = range.text
  if (mode === 'trim') {
    next = next
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n')
  } else if (mode === 'space') {
    next = next.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2').replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
  } else {
    const parts = range.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    next = parts.join('')
  }
  if (next === range.text) {
    ElMessage.info('没有需要改写的内容')
    bubbleRewrite.value = null
    return
  }
  ed.chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, next)
    .run()
  bubbleRewrite.value = null
  ElMessage.success('已改写选区')
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
  const body = htmlWithSuggestionsAccepted(ed.getHTML() || '<p></p>')
  printPreviewHtml.value = title
    ? `<h1 class="rte-print-title">${escapeHtml(title)}</h1>${body}`
    : body
  scheduleMeasure()
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
  applyPrintPageStyle(pageSize.value)
  root.classList.add('rte-printing')
  // 打印前把图表换成白底静态快照，打印完还原
  window.dispatchEvent(new CustomEvent(RTE_BEFORE_EXPORT_EVENT))
  const cleanup = () => {
    root.classList.remove('rte-printing')
    window.dispatchEvent(new CustomEvent(RTE_AFTER_EXPORT_EVENT))
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

const {
  selectCurrentBlock,
  duplicateCurrentBlock,
  moveCurrentBlock,
  blockHandle,
  blockDropLine,
  blockMenuOpen,
  bubbleSwatch,
  onCanvasBlockHover,
  hideBlockHandle,
  toggleBlockMenu,
  openBlockMenuForSelection,
  onBlockMenuKeydown,
  turnHoveredBlock,
  copyHoveredBlock,
  deleteHoveredBlock,
  moveHoveredBlock,
  onBlockDragStart,
  onBlockDragEnd,
  onCanvasBlockDragOver,
  onCanvasBlockDrop,
} = useBlockHandle({
  editor,
  viewMode: () => viewMode,
  rteRootEl,
})

const codeChrome = ref<{ top: number; left: number } | null>(null)

function syncCodeChrome() {
  const ed = editor.value
  const canvas = rteRootEl.value?.querySelector('.rte-canvas') as HTMLElement | null
  if (!ed || ed.isDestroyed || !canvas || viewMode.value !== 'edit' || !ed.isActive('codeBlock')) {
    codeChrome.value = null
    return
  }
  const { $from } = ed.state.selection
  let depth = $from.depth
  while (depth > 0 && $from.node(depth).type.name !== 'codeBlock') depth -= 1
  if (depth <= 0) {
    codeChrome.value = null
    return
  }
  let dom: HTMLElement | null = null
  try {
    dom = ed.view.nodeDOM($from.before(depth)) as HTMLElement | null
  } catch {
    dom = null
  }
  if (!dom || typeof dom.getBoundingClientRect !== 'function') {
    codeChrome.value = null
    return
  }
  const canvasRect = canvas.getBoundingClientRect()
  const rect = dom.getBoundingClientRect()
  codeChrome.value = {
    top: rect.top - canvasRect.top + canvas.scrollTop + 6,
    left: Math.max(8, rect.right - canvasRect.left - 168),
  }
}

function onCanvasScroll() {
  syncCodeChrome()
  blockMenuOpen.value = false
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

const {
  imageBubbleCaption,
  IMAGE_LAYOUT_OPTIONS,
  isImageNodeSelected,
  syncImageBubbleCaption,
  setImagePlacement,
  imageLightboxSrc,
  deleteSelectedImage,
  downloadSelectedImage,
  openSelectedImage,
  applyImageCaption,
  imageBubbleShouldShow,
  CROP_PRESETS,
  imageAlt,
  imageCropPreset,
  imageCropState,
  applyCropPreset,
  replaceImageSource,
  setImageAlt,
  setImageCrop,
  syncImageCropState,
} = useImageTools({
  editor,
  viewMode: () => viewMode,
})

/** 图片气泡：换图（保留裁剪与题注）。 */
async function replaceImageByUrl() {
  const raw = await openRtePrompt({
    title: '换图',
    message: '填一个图片地址。裁剪比例与题注会一起带过去。',
    placeholder: 'https://',
    confirmLabel: '替换',
  })
  const url = (raw || '').trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image')) {
    ElMessage.warning('图片地址需要以 http:// 或 https:// 开头')
    return
  }
  replaceImageSource(url)
  ElMessage.success('已替换图片')
}

/** —— 跨文档：搜索跳转 + 同步块 —— */
const {
  crossDocOpen,
  crossDocQuery,
  crossDocHits,
  crossDocBusy,
  crossDocError,
  crossDocSyncing,
  openCrossDoc,
  closeCrossDoc,
  searchCrossDoc,
  jumpToCrossDoc,
  insertSyncBlock,
  syncBlockPreview,
} = useCrossDoc({
  editor: () => editor,
  announce: (message) => announceRte(message),
})

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
    case 'dateChip':
      void insertDateChip('date')
      break
    case 'dateRemind':
      void insertDateChip('remind')
      break
    case 'columns':
      insertColumns(action.cols)
      break
    case 'docTitle':
      void insertDocTitleBlock()
      break
    case 'table':
      openTableDialog()
      break
    case 'mention':
      insertMentionFromToolbar()
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
    case 'linkButton':
      void insertLinkButton('blue')
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
    case 'echarts':
      openEchartsDialog()
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

const {
  VIEW_MODE_OPTIONS,
  viewMode,
  sourceHtml,
  sourceDirty,
  applySourceHtmlToEditor,
  bubbleShouldShow,
  setViewMode,
  onSourceInput,
  setSourceHtml,
  applySourceNow,
} = useViewMode({
  editor,
  props,
  emit,
  isImageNodeSelected,
  syncCodeChrome,
  formInspectorPinned,
  setLastEmitted: (norm: string) => {
    lastEmittedHtmlNorm = norm
  },
})

onBeforeUnmount(() => {
  if (viewMode.value === 'source') {
    // 只有改过源码才写回正文；仅查看源码不改动画布内容
    if (sourceDirty.value) applySourceHtmlToEditor(sourceHtml.value, { focus: false })
  } else if (editor.value && !editor.value.isDestroyed) {
    scheduleHtmlEmit(editor.value, true)
  }
  if (htmlEmitTimer != null) {
    clearTimeout(htmlEmitTimer)
    htmlEmitTimer = null
  }
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
const {
  findDialogOpen,
  findQuery,
  findReplaceText,
  findCaseSensitive,
  findWholeWord,
  findRegex,
  findMultiline,
  refreshFindMatches,
  openFindDialog,
  closeFindDialog,
  onFindQueryInput,
  findGo,
  doReplaceOne,
  doReplaceAll,
  findStatusText,
  canReplaceFind,
} = useFindReplace({
  editor,
  closeMore: () => {
    moreOpen.value = false
  },
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
const {
  imageDialogOpen,
  imageDialogTab,
  imageSidebarKey,
  imageCategories,
  imageSelectedIds,
  imageSelectAll,
  imageExternalUrls,
  imageFileInputRef,
  addingCategory,
  newCategoryName,
  filteredImageAssets,
  closeImageDialog,
  insertImage,
  uid,
  rteToast,
  ATTACH_MAX_BYTES,
  toggleImageSelect,
  onImageSelectAllChange,
  startAddCategory,
  confirmAddCategory,
  triggerLocalImagePick,
  readFileAsDataURL,
  imageFilesFromClipboard,
  replaceOrInsertDroppedImages,
  insertDroppedBeside,
  insertUserImages,
  onLocalImageFilesChange,
  confirmInsertImages,
  videoDialogOpen,
  videoDialogTab,
  videoSidebarKey,
  videoCategories,
  videoSelectedIds,
  videoSelectAll,
  videoExternalUrls,
  videoFileInputRef,
  videoAddingCategory,
  videoNewCategoryName,
  filteredVideoAssets,
  closeVideoDialog,
  insertVideo,
  toggleVideoSelect,
  onVideoSelectAllChange,
  startAddVideoCategory,
  confirmAddVideoCategory,
  triggerLocalVideoPick,
  onLocalVideoFilesChange,
  confirmInsertVideos,
} = useMediaLibrary({
  editor,
  closeMore: () => {
    moreOpen.value = false
  },
  imageCompressOnInsert,
})
void imageFileInputRef
void videoFileInputRef

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

type FormulaMode = 'inline' | 'display'
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

function focusOpenDialog() {
  nextTick(() => {
    const nodes = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
    const last = nodes[nodes.length - 1]
    if (last instanceof HTMLElement) focusDialogRoot(last)
  })
}

useOverlayStack({
  askOpen: () => askOpen,
  linkImportOpen: () => linkImportOpen,
  imageDialogOpen: () => imageDialogOpen,
  videoDialogOpen: () => videoDialogOpen,
  formulaDialogOpen: () => formulaDialogOpen,
  tableDialogOpen: () => tableDialogOpen,
  noteDialogOpen: () => noteDialogOpen,
  attachDialogOpen: () => attachDialogOpen,
  snippetDialogOpen: () => snippetDialogOpen,
  xrefDialogOpen: () => xrefDialogOpen,
  readTimeDialogOpen: () => readTimeDialogOpen,
  linkCardDialogOpen: () => linkCardDialogOpen,
  wave21ReportOpen: () => wave21ReportOpen,
  findDialogOpen: () => findDialogOpen,
  linkDialogOpen: () => linkDialogOpen,
  printPreviewOpen: () => printPreviewOpen,
  wordCountDockOpen: () => wordCountDockOpen,
  shortcutsOpen: () => shortcutsOpen,
  blockMenuOpen: () => blockMenuOpen,
  notesOpen: () => notesOpen,
  historyOpen: () => historyOpen,
  closeAskDialog: (...args) => closeAskDialog(...args),
  closeImportLinkDialog: (...args) => closeImportLinkDialog(...args),
  closeImageDialog: (...args) => closeImageDialog(...args),
  closeVideoDialog: (...args) => closeVideoDialog(...args),
  closeFormulaDialog: (...args) => closeFormulaDialog(...args),
  closeTableDialog: (...args) => closeTableDialog(...args),
  closeNoteDialog: (...args) => closeNoteDialog(...args),
  closeAttachDialog: (...args) => closeAttachDialog(...args),
  closeLinkCardDialog: (...args) => closeLinkCardDialog(...args),
  closeFindDialog: (...args) => closeFindDialog(...args),
  closeLinkDialog: (...args) => closeLinkDialog(...args),
  closePrintPreview: (...args) => closePrintPreview(...args),
})

function openFormulaDialog() {
  resetFormulaDialog()
  formulaDialogOpen.value = true
  moreOpen.value = false
  focusOpenDialog()
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

function openFormulaFromChip(el: HTMLElement) {
  const ed = editor.value
  if (!ed) return
  const display =
    el.getAttribute('data-type') === 'math-display' || el.classList.contains('rte-math-display')
  const tex = el.getAttribute('data-tex') || ''
  try {
    const pos = ed.view.posAtDOM(el, 0)
    const node = ed.state.doc.nodeAt(pos)
    if (node && (node.type.name === 'mathInline' || node.type.name === 'mathDisplay')) {
      ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)))
    }
  } catch {
    /* 点在公式渲染节点内部时仍打开编辑 */
  }
  formulaMode.value = display ? 'display' : 'inline'
  formulaTex.value = tex
  formulaPreviewExpanded.value = false
  formulaDialogOpen.value = true
}

async function insertDateChip(kind: 'date' | 'remind' = 'date') {
  const ed = editor.value
  if (!ed) return
  const iso = todayIso()
  if (kind === 'remind') {
    const label = await openRtePrompt({
      title: '提醒',
      message: '写一句说明，留空则只插入日期。',
      placeholder: '例如：评审',
      confirmLabel: '插入',
      maxlength: 40,
    })
    if (label == null) return
    ed.chain().focus().insertDateChip({ iso, kind: 'remind', label }).run()
    return
  }
  ed.chain().focus().insertDateChip({ iso, kind: 'date', label: '' }).run()
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
  focusOpenDialog()
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
  focusOpenDialog()
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
      rteToast('warning', `${file.name} 超过 3MB，已跳过`)
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

const {
  importMenuOpen,
  importFileInputRef,
  linkImportOpen,
  linkImportUrl,
  linkImportBusy,
  closeImportMenu,
  onImport,
  pickImportDocument,
  openImportLinkDialog,
  closeImportLinkDialog,
  onImportFileChange,
  confirmImportLink,
  markdownToHtml,
} = useImport({
  editor,
  closeMore: () => {
    moreOpen.value = false
  },
})
void importFileInputRef
void presentRoot

const {
  exportMenuOpen,
  exportBusy,
  closeExportMenu,
  onExportMenu,
  copyAsFeishuHtml,
  exportAsHtml,
  exportAsPlainText,
  exportAsMarkdown,
  exportAsPng,
  exportAsPdf,
  exportAsDocx,
} = useExport({
  editor,
  title: localTitle,
  rootEl: rteRootEl,
  pageSize,
  pageSizeMeta,
  pageMargin,
  pageScreenMargin,
  pageChrome,
  closeMore: () => {
    moreOpen.value = false
  },
})

/** 工具栏分组内的按钮配置菜单（右键分组打开） */
const toolbarGroupButtonsOpen = ref(false)
const toolbarGroupButtonsGroupId = ref('')

function closeToolbarGroupButtons() {
  toolbarGroupButtonsOpen.value = false
}

function onToolbarGroupContextMenu(groupId: string, event: MouseEvent) {
  const el = event.currentTarget as HTMLElement | null
  if (el) setFloatAnchor('toolbarGroupButtons', el)
  toolbarGroupButtonsGroupId.value = groupId
  toolbarGroupButtonsOpen.value = true
}

const {
  floatAnchors,
  floatMenuEls,
  markToolbarMenuOpening,
  setFloatAnchor,
  onToolMenuEnter,
  onToolMenuLeave,
  closeAllToolbarMenus,
  vRteFloat,
} = useFloatMenus({
  closeToolbarGroupButtons: () => {
    closeToolbarGroupButtons()
  },
  headingOpen: () => headingOpen,
  listOpen: () => listOpen,
  formOpen: () => formOpen,
  templateOpen: () => templateOpen,
  alignOpen: () => alignOpen,
  tableMenuOpen: () => tableMenuOpen,
  importMenuOpen: () => importMenuOpen,
  exportMenuOpen: () => exportMenuOpen,
  pasteFormatOpen: () => pasteFormatOpen,
  bookmarkPanelOpen: () => bookmarkPanelOpen,
  caseMenuOpen: () => caseMenuOpen,
  zoomMenuOpen: () => zoomMenuOpen,
  viewExtrasOpen: () => viewExtrasOpen,
  emojiOpen: () => emojiOpen,
  specialCharsOpen: () => specialCharsOpen,
  columnsOpen: () => columnsOpen,
  spacingOpen: () => spacingOpen,
  wordStatsOpen: () => wordStatsOpen,
  shortcutsOpen: () => shortcutsOpen,
  calloutOpen: () => calloutOpen,
  moreCalloutOpen: () => moreCalloutOpen,
  hrOpen: () => hrOpen,
  blockOpsOpen: () => blockOpsOpen,
  insertDateOpen: () => insertDateOpen,
  codeLangOpen: () => codeLangOpen,
  closeFontMenus: () => {
    closeFontMenus()
  },
  closeColorMenus: () => {
    closeColorMenus()
  },
  closeHighlightMenus: () => {
    closeHighlightMenus()
  },
  closeMore: () => {
    closeMore()
  },
})

onMounted(() => {
  nextTick(() => {
    syncSpellcheckToDom()
    editor.value?.commands.captureRevisionBaseline()
  })
  document.addEventListener('pointerdown', onDocPointerDownOutlineMenu, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDownOutlineMenu, true)
})

watch(spellcheckEnabled, () => syncSpellcheckToDom())
watch(
  () => editor.value,
  (ed) => {
    if (ed) nextTick(() => syncSpellcheckToDom())
  },
)

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
bindAskMore(askMoreCloser, moreOpen)
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
  if (t.kind === 'echartsGroup') {
    // 紧凑模式（未最大化）没有分类下拉：走「一键生成」面板
    moreOpen.value = false
    openEchartsDialog()
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

type ToolItem = {
  disabled?: () => boolean
  key: string
  label: string
  /** 悬停完整说明；缺省用 label */
  title?: string
  icon: string
  iconComp?: Component
  kind?: 'heading' | 'list' | 'more' | 'btn' | 'color' | 'highlight' | 'align' | 'fontSize' | 'fontFamily' | 'lineHeight' | 'import' | 'export' | 'table' | 'attach' | 'form' | 'template' | 'code' | 'divider' | 'emoji' | 'specialChars' | 'columns' | 'spacing' | 'wordStats' | 'callout' | 'shortcuts' | 'hr' | 'blockOps' | 'insertDate' | 'pasteFormat' | 'caseTransform' | 'zoom' | 'viewExtras' | 'paraStyle' | 'listStyle' | 'linkButton' | 'echarts' | 'echartsGroup'
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
   * 最大化工具栏分组（企业级，方案 A）：
   * 编辑 | 字体与颜色 | 段落与列表 | 插入 | 图表 | 表格 | 块与结构 | 注释与引用 | 审阅 | 视图 | 文件与导出
   * （分组定义见 utils/rteToolbarGroups.ts 的 TOOLBAR_GROUPS）
   * 目录已按产品要求移除，勿恢复。分组靠发丝竖线；换行靠 flex-wrap。
   */
  return [
    // —— 编辑 ——
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
    // —— 字体与颜色 / 段落与列表 ——
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
    {
      key: 'firstIndent',
      label: '首行',
      title: '首行缩进 2 字',
      icon: '⇨',
      iconComp: ic('firstIndent'),
      active: () => !!currentTextIndent(),
      run: toggleFirstLineIndent,
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
    {
      key: 'linkButton',
      label: '按钮',
      title: '插入打开链接的按钮',
      icon: '钮',
      iconComp: ic('linkButton'),
      kind: 'linkButton',
      active: () => linkButtonOpen.value || isActive('linkButton'),
      run: () => { void insertLinkButton('blue') },
    },
    { key: 'formula', label: '公式', icon: 'Σ', iconComp: ic('formula'), run: insertFormula },
    // —— 图表：一级分类各一个下拉（基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL）——
    ...CHART_GROUPS.map((group) => ({
      key: `chart:${group.id}`,
      label: group.label,
      title: `插入${group.label}图表`,
      icon: group.icon,
      kind: 'echartsGroup' as const,
    })),
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
    {
      key: 'comment',
      label: '评论',
      title: '对选区添加评论',
      icon: '💬',
      iconComp: ic('note'),
      active: () => commentsOpen.value,
      run: beginComment,
    },
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
      key: 'suggest',
      label: '建议',
      title: '建议模式：插入和删除记成修订',
      icon: '改',
      iconComp: ic('highlight'),
      active: () => suggesting.value,
      run: toggleSuggesting,
    },
    {
      key: 'suggestAccept',
      label: '接受',
      title: '接受全部修订',
      icon: '✓',
      iconComp: ic('note'),
      disabled: () => suggestionRanges.value.length === 0,
      run: acceptAllSuggestions,
    },
    {
      key: 'suggestReject',
      label: '拒绝',
      title: '拒绝全部修订',
      icon: '✕',
      iconComp: ic('clear'),
      disabled: () => suggestionRanges.value.length === 0,
      run: rejectAllSuggestions,
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
      key: 'crossDoc',
      label: '跨文档',
      title: '搜索其它文档，可插入同步块',
      icon: '⇄',
      iconComp: ic('link'),
      run: openCrossDoc,
    },
    {
      key: 'mentionPerm',
      label: '@权限',
      title: '设置本文能 @ 到哪些人',
      icon: '@',
      iconComp: ic('note'),
      run: openMentionPermission,
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
const {
  toolbarOrder,
  toolbarGroups,
  toolbarGroupButtonConfigs,
  toolbarGroupButtonEntries,
  toggleToolbarGroupButton,
  moveToolbarGroupButton,
  toolbarDropIndex,
  toolbarDragSource,
  undoToolbarGroupOrder,
  noteToolbarOrderEdited,
  disarmToolbarUndo,
  toolbarUndoIsNewer,
  onToolbarHandlePointerDown,
  onToolbarHandlePointerMove,
  onToolbarHandlePointerUp,
  onToolbarGroupDragStart,
  onToolbarGroupDragOver,
  onToolbarGroupDrop,
  onToolbarGroupDragEnd,
  onToolbarGroupKeydown,
} = useToolbarGroups({
  panelId: () => props.panelId,
  expanded: () => props.expanded,
  orderMap: () => current_data.value?.toolbarGroupOrderByPanelId,
  setPanelToolbarOrder: (panelId, order) => documentStore.setPanelToolbarOrder(panelId, order),
  buttonConfigMap: () => current_data.value?.toolbarGroupButtonsByPanelId,
  setPanelGroupButtons: (panelId, groupId, config) =>
    documentStore.setPanelToolbarGroupButtons(panelId, groupId, config),
  tools: () => allTools.value,
  primaryKeys: PRIMARY_KEYS,
  viewMode: () => viewMode.value,
  announce: (message) => announceRte(message),
  rootEl: rteRootEl,
  marginUndoArmed,
  marginUndoStamp,
  undoPageMargin,
  disarmMarginUndo,
})
toolbarUndoBridge.disarm = disarmToolbarUndo
toolbarUndoBridge.isNewer = toolbarUndoIsNewer

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

/** 「更多」按工具栏同一套分组展示，每组胶囊可单独排序。 */
const moreGroups = computed(() => {
  if (props.expanded) return []
  return buildToolbarGroups(moreTools.value, toolbarOrder.value, toolbarGroupButtonConfigs.value)
})

function openMoreMenu() {
  moreOpen.value = true
}

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

provide(RTE_CTX, {
  editor,
  props: props as RteEditorProps,
  emit: emit as RteEditorEmit,
  ui: { rootEl: rteRootEl },
})

provideRteBindings({
  CALLOUT_MENU_ITEMS,
  ECHARTS_CHART_TYPES,
  ECHARTS_CATEGORIES,
  ECHARTS_TEMPLATES,
  CODE_LANG_OPTIONS,
  COLUMN_MENU_ITEMS,
  FEISHU_HIGHLIGHT_COLORS,
  FEISHU_TEXT_COLORS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FORMULA_SYMBOL_GROUPS,
  HR_VARIANT_OPTIONS,
  IMAGE_BORDER_PRESETS,
  IMAGE_LAYOUT_OPTIONS,
  IMAGE_RADIUS_PRESETS,
  IMAGE_SHADOW_PRESETS,
  IMAGE_WIDTH_PRESETS,
  IconTableCols,
  IconTableRows,
  LINE_HEIGHT_OPTIONS,
  NOTE_TYPES,
  ORDERED_LIST_STYLE_OPTIONS,
  PAGE_MARGIN_PRESETS,
  PARA_STYLE_ITEMS,
  PARA_STYLE_OPTIONS,
  QUOTE_STYLE_OPTIONS,
  RTE_DOC_TEMPLATES,
  RTE_DOC_TEMPLATE_GROUPS,
  RTE_EMOJI_CATEGORIES,
  RTE_PAGE_SIZES,
  RTE_SPECIAL_CHAR_CATEGORIES,
  RTE_ZOOM_PRESETS,
  TABLE_BORDER_STYLE_PRESETS,
  TABLE_CELL_BG_PRESETS,
  TABLE_GRID_MAX_COLS,
  TABLE_GRID_MAX_ROWS,
  VIEW_MODE_OPTIONS,
  WORD_HIGHLIGHT_SOFT,
  WORD_HIGHLIGHT_VIVID,
  WORD_STANDARD_COLOR_ITEMS,
  WORD_THEME_FLAT,
  activeEmojiList,
  activeOutlineIndex,
  activeSpecialCharList,
  addingCategory,
  alignOpen,
  applyCodeLanguage,
  applyCustomColor,
  applyCustomHighlight,
  applyFontFamily,
  applyFontSize,
  applyHighlightColor,
  applyImageCaption,
  applyLetterSpacing,
  applyLineHeight,
  applyListStart,
  applyListStyle,
  applyMarginBottom,
  applyMarginTop,
  applyParaStyle,
  applyParaStyleId,
  applyQuoteStyle,
  applySelectedFormPatch,
  applySourceNow,
  applyTextColor,
  applyTextDir,
  applyTextIndent,
  askCancelLabel,
  askConfirmLabel,
  askInputRef,
  askKind,
  askMaxlength,
  askMessage,
  askOpen,
  askPlaceholder,
  askTitle,
  askValue,
  attachAddingCategory,
  attachCategories,
  attachDialogOpen,
  attachExtIcon,
  attachNewCategoryName,
  attachSelectAll,
  attachSelectedIds,
  attachSidebarKey,
  blockDropLine,
  blockHandle,
  blockMenuOpen,
  blockOpsOpen,
  bookmarkPanelOpen,
  bubbleShouldShow,
  bubbleSwatch,
  crossDocOpen,
  crossDocQuery,
  crossDocHits,
  crossDocBusy,
  crossDocError,
  crossDocSyncing,
  openCrossDoc,
  closeCrossDoc,
  searchCrossDoc,
  jumpToCrossDoc,
  insertSyncBlock,
  syncBlockPreview,
  bubbleRewrite,
  copySelectedText,
  selectionToLink,
  selectionToTable,
  rewriteSelection,
  calloutOpen,
  canReplaceFind,
  caseMenuOpen,
  charCount,
  closeAskDialog,
  closeAttachDialog,
  closeColorMenus,
  closeExportMenu,
  echartsDialogOpen,
  echartsDialogTable,
  echartsDialogTemplateId,
  echartsDialogTitle,
  echartsDialogType,
  echartsDialogUseTable,
  echartsGroupMenuKey,
  echartsOpenCategory,
  applyEchartsDialog,
  insertEchartsBlockAtCursor,
  insertEchartsTemplateById,
  toggleEchartsCategory,
  selectEchartsDialogCategory,
  openEchartsDialog,
  closeFindDialog,
  closeFontMenus,
  closeFormInspector,
  closeFormulaDialog,
  closeHighlightMenus,
  closeImageDialog,
  closeImportLinkDialog,
  closeImportMenu,
  closeLinkCardDialog,
  closeLinkDialog,
  closeMore,
  closeNoteDialog,
  closeOutlinePanel,
  closePrintPreview,
  closeTableCtx,
  closeTableDialog,
  closeTableMenu,
  closeTableOpsSheet,
  closeVideoDialog,
  codeChrome,
  codeLangOpen,
  codeLanguageLabel,
  collectFootnotes,
  colorHoverLabel,
  colorOpen,
  colorsEqual,
  columnsOpen,
  confirmAddAttachCategory,
  confirmAddCategory,
  confirmAddVideoCategory,
  confirmImportLink,
  confirmInsertAttaches,
  confirmInsertFormula,
  confirmInsertImages,
  confirmInsertLink,
  confirmInsertNote,
  confirmInsertTable,
  confirmInsertVideos,
  confirmInsertXref,
  confirmLinkCardDialog,
  confirmPrintFromPreview,
  copyActiveCodeBlock,
  copyAsFeishuHtml,
  copyCurrentLinkUrl,
  copyHoveredBlock,
  currentCodeLanguage,
  currentFontFamily,
  currentFontSize,
  currentHighlightColor,
  currentHighlightLabel,
  currentLetterSpacing,
  currentLineHeight,
  currentMarginBottom,
  currentMarginTop,
  currentParaStyleLabel,
  currentQuoteStyle,
  currentTextColor,
  currentTextDir,
  currentTextIndent,
  customColorHex,
  customColorOpen,
  customHighlightHex,
  customHighlightOpen,
  darkEditor,
  deleteHoveredBlock,
  deleteSelectedImage,
  deleteSnippet,
  doReplaceAll,
  doReplaceOne,
  docExtraStats,
  downloadSelectedImage,
  duplicateCurrentBlock,
  editor,
  editorZoom,
  emojiOpen,
  emojiTabId,
  estimateReadingMinutes,
  get expanded() { return props.expanded },
  exportAsDocx,
  exportAsHtml,
  exportAsMarkdown,
  exportAsPdf,
  exportAsPlainText,
  exportAsPng,
  exportBusy,
  exportMenuOpen,
  filteredAttachAssets,
  filteredImageAssets,
  filteredShortcutGroups,
  filteredVideoAssets,
  filteredXrefTargets,
  findCaseSensitive,
  findDialogOpen,
  findGo,
  findQuery,
  findReplaceText,
  findRegex,
  findMultiline,
  findStatusText,
  findWholeWord,
  focusMode,
  fontFamilyOpen,
  fontSizeOpen,
  footnotePanelOpen,
  formOpen,
  formatAttachSize,
  formulaDialogOpen,
  formulaMode,
  formulaPreviewExpanded,
  formulaPreviewHtml,
  formulaTex,
  formulaTexareaRef,
  headingFocusIndex,
  headingOpen,
  hideBlockHandle,
  highlightHoverLabel,
  highlightOpen,
  historyOpen,
  hrOpen,
  imageBubbleCaption,
  imageBubbleShouldShow,
  CROP_PRESETS,
  imageAlt,
  imageCropPreset,
  imageCropState,
  applyCropPreset,
  replaceImageSource,
  setImageAlt,
  setImageCrop,
  syncImageCropState,
  replaceImageByUrl,
  imageCategories,
  imageCompressOnInsert,
  imageDialogOpen,
  imageDialogTab,
  imageExternalUrls,
  imageLightboxSrc,
  imageSelectAll,
  imageSelectedIds,
  imageSidebarKey,
  importMenuOpen,
  indentBlock,
  insertBookmark,
  insertCallout,
  insertColumns,
  insertDateChip,
  insertDateOpen,
  insertDocTemplate,
  insertEmoji,
  insertFootnoteAtCursor,
  insertFormCheckbox,
  insertFormDate,
  insertFormDateTime,
  insertFormNumber,
  insertFormRadio,
  insertFormSelect,
  insertFormSwitch,
  insertFormText,
  insertFormTextarea,
  insertFormula,
  insertFormulaSymbol,
  insertHrVariant,
  insertLink,
  insertLinkButton,
  paintLinkButton,
  editLinkButton,
  LINK_BUTTON_TONES,
  linkButtonOpen,
  insertPlainDate,
  insertPlainDateTime,
  insertQuickTable,
  insertSnippet,
  insertSpecialChar,
  isActive,
  isInTable,
  isKaomojiTab,
  isLargeEmojiTab,
  isLightHighlight,
  isParaStyleActive,
  jumpNote,
  jumpToBookmark,
  jumpToOutlineHeading,
  jumpToPos,
  jumpWave21Report,
  lineHeightOpen,
  linkCardDialogOpen,
  linkCardHref,
  linkCardMode,
  linkDialogEditing,
  linkDialogOpen,
  linkHref,
  linkHrefInputRef,
  linkImportBusy,
  linkImportOpen,
  linkImportUrl,
  linkPopoverStyle,
  linkText,
  listBookmarks,
  listDepthLabel,
  listOpen,
  listStyleOpen,
  localTitle,
  markToolbarMenuOpening,
  pageSetupOpen,
  openPageSetup,
  outlineMenuOpen,
  outlineMenuIndex,
  outlineMenuStyle,
  openOutlineMenu,
  closeOutlineMenu,
  outlineMenuJump,
  outlineMenuCopyTitle,
  outlineMenuCopyLink,
  mentionEmptyHint,
  mentionIndex,
  mentionItems,
  mentionMenuEl,
  mentionMenuStyle,
  mentionOpen,
  mentionPermDepartments,
  mentionPermOpen,
  mentionPermRoles,
  mentionPermission,
  mentionQuery,
  mentionSectionLabel,
  directoryDepartments,
  directoryError,
  directoryLoading,
  directoryRoles,
  openMentionPermission,
  resetMentionPermission,
  saveMentionPermission,
  toggleMentionPermValue,
  moreCalloutOpen,
  moreColorOpen,
  moreFontFamilyOpen,
  moreFontSizeOpen,
  moreFormOpen,
  moreGroups,
  moreHighlightOpen,
  moreLineHeightOpen,
  moreOpen,
  openMoreMenu,
  insertMentionFromToolbar,
  moreTemplateOpen,
  moreTools,
  moveCurrentBlock,
  moveHoveredBlock,
  newCategoryName,
  noteDialogOpen,
  noteHref,
  noteRows,
  noteText,
  noteType,
  noteTypeMeta,
  noteTypeOpen,
  notesOpen,
  onAttachSelectAllChange,
  onBlockDragEnd,
  onBlockDragStart,
  onBlockMenuKeydown,
  onCanvasBlockDragOver,
  onCanvasBlockDrop,
  onCanvasBlockHover,
  onCanvasClick,
  onCanvasScroll,
  onCustomColorNativeInput,
  onCustomHighlightNativeInput,
  onFindQueryInput,
  onFormInspectorMouseDown,
  onFormInspectorMouseUp,
  onFormatPainterDblClick,
  onHeadingMenuKeydown,
  onImageSelectAllChange,
  onMoreToolClick,
  onPreview,
  onPublish,
  onPublishSettings,
  onSourceInput,
  setSourceHtml,
  onTableColsInput,
  onTableGridHover,
  onTableGridLeave,
  onTableQuickKeydown,
  onTableRowsInput,
  onTableToolbarButtonClick,
  onTitleInput,
  onToolMenuEnter,
  onToolMenuLeave,
  onToolbarGroupDragEnd,
  onToolbarGroupDragOver,
  onToolbarGroupDragStart,
  onToolbarGroupDrop,
  onToolbarGroupKeydown,
  onToolbarHandlePointerDown,
  onToolbarHandlePointerMove,
  onToolbarHandlePointerUp,
  onVideoSelectAllChange,
  onXrefDialogKeydown,
  openCurrentLink,
  openHeadingMenu,
  openImportLinkDialog,
  openPrintPreview,
  openSelectedImage,
  openTableDialog,
  outdentBlock,
  outlineHeadings,
  outlineOpen,
  pageMargin,
  pageSize,
  pageSizeMeta,
  paperGuide,
  paraStyleOpen,
  pickImportDocument,
  pickMentionItem,
  pickSlashItem,
  pickTableGridSize,
  printPreviewHtml,
  printPreviewMarginStyle,
  printPreviewOpen,
  readTimeDialogOpen,
  readingMinutes,
  refreshFindMatches,
  removeNote,
  renumberFootnotes,
  restoreRevision,
  nameCurrentRevision,
  revisionNote,
  formatRevisionTime,
  rteAriaStatus,
  rteSlashGlyph,
  rteSlashSectionLabel,
  runCaseTransform,
  saveSnippetForm,
  selectCurrentBlock,
  selectNoteType,
  selectedFormAttrs,
  selectedFormType,
  selectionStats,
  revisions,
  setAlign,
  setCodeLanguage,
  setEditorZoom,
  setFloatAnchor,
  setFormulaMode,
  setHeading,
  setImageBorderRadius,
  setImageBorderStyle,
  setImageBoxShadow,
  setImageDisplayWidth,
  setImagePlacement,
  setMarginPreset,
  setMarginSide,
  setPageSize,
  setTableCellBg,
  setTableCellBorderColor,
  setTableCellBorderStyle,
  setViewMode,
  shortcutQuery,
  shortcutsOpen,
  get showBottomBar() { return props.showBottomBar },
  showEmptyGuide,
  showFormInspector,
  get showMarkdownHint() { return props.showMarkdownHint },
  get showPublishActions() { return props.showPublishActions },
  get showTitle() { return props.showTitle },
  slashIndex,
  slashItems,
  slashMenuEl,
  slashMenuStyle,
  slashOpen,
  slashQuery,
  snippetBody,
  snippetDialogOpen,
  snippetEditing,
  snippetList,
  snippetTitle,
  sourceDirty,
  sourceHtml,
  spacingOpen,
  specialCharTabId,
  specialCharsOpen,
  startAddAttachCategory,
  startAddCategory,
  startAddVideoCategory,
  startEditSnippet,
  stepTableCols,
  stepTableRows,
  syncHint,
  syncLabel,
  syncTone,
  tableCols,
  tableCtx,
  tableDialogOpen,
  tableGridHover,
  tableMenuOpen,
  tableOpItems,
  tableOpsSheetOpen,
  tableQuickCells,
  tableQuickHover,
  tableQuickOpen,
  tableRows,
  templateOpen,
  toggleAttachSelect,
  toggleBlockMenu,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleColorMenu,
  toggleDarkEditor,
  toggleFocusMode,
  toggleHighlightMenu,
  toggleImageSelect,
  toggleItalic,
  toggleOrderedList,
  continueOrderedNumbering,
  restartOrderedNumbering,
  renumberListFromHere,
  toggleFirstLineIndent,
  setFirstLineIndent,
  togglePaperGuide,
  togglePreviewMode,
  toggleShortcutsPanel,
  toggleStrike,
  toggleTaskList,
  toggleUnderline,
  toggleVideoSelect,
  toggleWordCountDock,
  toolIcon,
  toolbarDragSource,
  toolbarDropIndex,
  toolbarGroups,
  toolbarGroupButtonEntries,
  toolbarGroupButtonsGroupId,
  toolbarGroupButtonsOpen,
  toggleToolbarGroupButton,
  moveToolbarGroupButton,
  closeToolbarGroupButtons,
  onToolbarGroupContextMenu,
  toolbarOrder,
  triggerLocalAttachPick,
  triggerLocalImagePick,
  triggerLocalVideoPick,
  turnHoveredBlock,
  unlinkSelection,
  vRteFloat,
  videoAddingCategory,
  videoCategories,
  videoDialogOpen,
  videoDialogTab,
  videoExternalUrls,
  videoNewCategoryName,
  videoSelectAll,
  videoSelectedIds,
  videoSidebarKey,
  viewExtrasOpen,
  viewMode,
  wave21ReportLines,
  wave21ReportOpen,
  wave21ReportTitle,
  wordCount,
  wordCountDockOpen,
  wordStatsOpen,
  xrefDialogOpen,
  xrefIndex,
  xrefQuery,
  xrefTargets,
  zoomMenuOpen,
  PAGE_NUMBER_OPTIONS,
  closePresent,
  onPresentStageClick,
  openPresent,
  pageChrome,
  presentIndex,
  presentOpen,
  presentRoot,
  presentSlides,
  presentUnit,
  previewPageLabel,
  screenPageLabel,
  setPageFooter,
  setPageHeader,
  setPageNumber,
  setPresentUnit,
  stepPresent,
  suggesting,
  suggestionColor,
  suggestionRanges,
  activeSuggestionId,
  acceptAllSuggestions,
  rejectAllSuggestions,
  acceptActiveSuggestion,
  rejectActiveSuggestion,
  rteAuthor,
  commentsOpen,
  showResolved,
  commentDraft,
  replyDrafts,
  activeThreadId,
  shownThreads,
  unresolvedCount,
  beginComment,
  cancelDraft,
  submitDraft,
  submitReply,
  toggleResolved,
  removeMessage,
  jumpToThread,
})

defineExpose({ focusEditor, editor, onDraftBackup, openRtePrompt, openRteConfirm })
</script>

<template>
  <div
    ref="rteRootEl"
    class="rte-root"
    :data-page-size="pageSize"
    :data-margin="pageMargin.preset"
    :style="pageSheetStyle"
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
      'is-page-sheet': pageSizeMeta.paper,
      'has-page-chrome': pageChromeActive,
      'is-page-feishu': pageSize === 'feishu',
      'is-table-sticky': tableHeaderSticky,
      'is-cjk-typography': true,
    }"
    @mousedown="onRootMouseDown"
    @keydown="onImmersiveKeydown"
  >
    <p v-if="!editorReady" class="rte-boot" role="status">正在加载编辑器…</p>
    <p v-else-if="editorBootError" class="rte-boot is-error" role="alert">{{ editorBootError }}</p>
    <RteToolbar />
    <RteDocumentBody />
    <RtePortals />
    <ChartPanel :host="chartPanelBridge.host" />

    <!-- 隐藏文件选择：导入文档 -->
    <input
      ref="importFileInputRef"
      type="file"
      class="rte-hidden-file"
      accept=".md,.markdown,.txt,.docx,.doc,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      @change="onImportFileChange"
    />

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

<style scoped src="./rte/styles/editor.scoped.css"></style>
<style src="./rte/styles/editor.global.css"></style>
