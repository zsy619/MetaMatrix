import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useEditor } from '@tiptap/vue-3'
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
import { RteImage } from '../../../extensions/rteImage'
import { RteTableCell, RteTableHeader } from '../../../extensions/rteTableCells'
import { RteHorizontalRule } from '../../../extensions/rteHorizontalRule'
import { Annotation } from '../../../extensions/annotation'
import { CommentAnchor } from '../../../extensions/commentAnchor'
import { SuggestionInsert, SuggestionDelete } from '../../../extensions/suggestionMarks'
import { SuggestionMode } from '../../../extensions/suggestionMode'
import { syncCaretWhenEndIsNoop } from '../../../utils/rteCaret'
import { MathInline, MathDisplay } from '../../../extensions/math'
import { DateChip } from '../../../extensions/dateChip'
import { DocTitle } from '../../../extensions/docTitle'
import { Video } from '../../../extensions/video'
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
} from '../../../extensions/forms'
import { createRteMention } from '../../../extensions/mentionSuggestion'
import { RteCodeBlockLowlight } from '../../../extensions/codeHighlight'
import { SlashCommands } from '../../../extensions/slashCommands'
import { escapeHtml } from '../../../utils/itemsHtml'
import { FEISHU_HIGHLIGHT_COLORS, isBareHttpUrl, plainTextToPasteContent, sanitizePastedHtml } from '../../../utils/rtePasteClean'
import { clearEditorFormat } from '../../../utils/rteClearFormat'
import { pasteVolume, previewShortcutAllowed } from '../../../utils/rteRound8'
import { filesFromImageDataUrls, pasteCarriesText } from '../../../utils/rtePasteImage'
import {
  htmlHasTable,
  looksLikeTsvTable,
  togglePreviewMode,
  tsvToTableHtml,
} from '../../../utils/rteRound7'
import { rtePlaceholderText } from '../../../utils/rteContent'
import { jumpToPos } from '../../rteWave20'
import { LetterSpacing } from '../../../extensions/letterSpacing'
import { ParagraphAttrs } from '../../../extensions/paragraphAttrs'
import { PageBreak } from '../../../extensions/pageBreak'
import { Columns, Column } from '../../../extensions/columns'
import { ImageGroup } from '../../../extensions/imageGroup'
import { imageEdgeAtPoint } from '../../../extensions/rteImageDrag'
import { Callout } from '../../../extensions/callout'
import { Bookmark } from '../../../extensions/bookmark'
import { RteBlockquote } from '../../../extensions/rteBlockquote'
import { EmphasisDot } from '../../../extensions/emphasisDot'
import { Spoiler } from '../../../extensions/spoiler'
import { ToggleBlock } from '../../../extensions/toggleBlock'
import { Audio } from '../../../extensions/audio'
import { LinkCard } from '../../../extensions/linkCard'
import { Footnote } from '../../../extensions/footnote'
import { SensitiveHighlight } from '../../../extensions/sensitiveHighlight'
import { RevisionHighlight } from '../../../extensions/revisionHighlight'
import { Ruby } from '../../../extensions/ruby'
import { StatusChip } from '../../../extensions/statusChip'
import { ProgressBar } from '../../../extensions/progressBar'
import { Timeline, TimelineItem } from '../../../extensions/timeline'
import { TabsBlock, TabPane } from '../../../extensions/tabsBlock'
import { MermaidBlock } from '../../../extensions/mermaidBlock'
import { EchartsBlock } from '../../../extensions/echartsBlock'
import { CrossRef, findCrossRefPos } from '../../../extensions/crossRef'
import { ListStyleAttrs } from '../../../extensions/listStyleAttrs'
import { LinkButton } from '../../../extensions/linkButton'
import { SyncBlock } from '../../../extensions/syncBlock'
import { RteMarkdownInputRules } from '../../../extensions/rteMarkdownInputRules'
import { MediaHydrate } from '../../../extensions/mediaHydrate'

type LateFn = (...args: any[]) => any

function lateRef<T>(get: () => { value: T }): { value: T } {
  return {
    get value() {
      return get().value
    },
    set value(v: T) {
      get().value = v
    },
  }
}

/** TipTap 扩展与 editorProps。后声明的绑定用 getter，调用点仍在原来的 setup 位置。 */
export function useRteExtensions(deps: {
  closeTableCtx: LateFn
  closeTableMenu: LateFn
  editorReady: { value: boolean }
  isInTable: LateFn
  mentionUi: any
  /** 组织通讯录真人候选。宿主从通讯录接口取人并按文档权限过滤。 */
  mentionPeople?: () => Promise<any[]>
  openTableContextMenu: LateFn
  pastePlainTextMode: { value: boolean }
  shortcutsOpen: { value: boolean }
  slashUi: any
  tableAddColAfter: LateFn
  tableAddColBefore: LateFn
  tableAddRowAfter: LateFn
  tableAddRowBefore: LateFn
  tableCtx: { value: { open: boolean; x: number; y: number } }
  tableMenuOpen: { value: boolean }
  tableOpsSheetOpen: { value: boolean }
  tableQuickOpen: { value: boolean }
  undoPageMargin: LateFn
  undoPageSetup: LateFn
  redoPageSetup: LateFn
  applyFormatPainterIfNeeded: LateFn
  cancelFormatPainter: () => boolean
  initialEditorContent: LateFn
  insertFormula: LateFn
  looksLikeMarkdown: LateFn
  looksLikeRichHtml: LateFn
  openFormulaFromChip: LateFn
  openLinkDialog: LateFn
  /** 正文里的链接点击。返回后由编辑器决定打开、确认或拦截。 */
  onEditorLinkClick?: (href: string) => void
  /** 附件芯片：用链接打开预览，不把 data 地址写进文档。 */
  onAttachmentOpen?: (href: string, name: string) => void
  openPrintPreview: LateFn
  scheduleHtmlEmit: LateFn
  setHeading: LateFn
  syncSelectedFormFromEditor: LateFn
  toggleShortcutsPanel: LateFn
  props: { placeholder?: string }
  emit: (...args: any[]) => void
  blockMenuOpen: () => { value: boolean }
  findDialogOpen: () => { value: boolean }
  formSelectionTick: () => { value: number }
  pasteFormatMode: () => { value: string }
  selectedFormPos: () => { value: number | null }
  viewMode: () => { value: 'edit' | 'preview' | 'source' }
  closeFindDialog: LateFn
  duplicateCurrentBlock: LateFn
  exportAsMarkdown: LateFn
  imageFilesFromClipboard: LateFn
  insertDroppedBeside: LateFn
  insertUserImages: LateFn
  markdownToHtml: LateFn
  moveCurrentBlock: LateFn
  noteToolbarOrderEdited: LateFn
  openBlockMenuForSelection: LateFn
  openFindDialog: LateFn
  replaceOrInsertDroppedImages: LateFn
  scheduleDocChrome: LateFn
  selectCurrentBlock: LateFn
  setViewMode: LateFn
  syncImageBubbleCaption: LateFn
  /** 同步图片气泡里的裁剪比例与 alt。 */
  syncImageCropState?: LateFn
  toggleOutlinePanel: LateFn
  undoToolbarGroupOrder: LateFn
  suggestingEnabled: () => boolean
  suggestionAuthor: () => { id: string; name: string }
  bumpSuggestions: LateFn
  reapplyTableFilter?: (
    ed: { state: { doc: unknown } },
    transaction: { mapping: { map: (pos: number, assoc?: number) => number } },
    appended?: ReadonlyArray<{ mapping: { map: (pos: number, assoc?: number) => number } }>,
  ) => void
}) {
  const {
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
    undoPageSetup,
    redoPageSetup,
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
  } = deps
  const blockMenuOpen = lateRef(deps.blockMenuOpen)
  const findDialogOpen = lateRef(deps.findDialogOpen)
  const formSelectionTick = lateRef(deps.formSelectionTick)
  const pasteFormatMode = lateRef(deps.pasteFormatMode)
  const selectedFormPos = lateRef(deps.selectedFormPos)
  const viewMode = lateRef(deps.viewMode)
  const closeFindDialog = (...args: any[]) => deps.closeFindDialog(...args)
  const duplicateCurrentBlock = (...args: any[]) => deps.duplicateCurrentBlock(...args)
  const exportAsMarkdown = (...args: any[]) => deps.exportAsMarkdown(...args)
  const imageFilesFromClipboard = (...args: any[]) => deps.imageFilesFromClipboard(...args)
  const insertDroppedBeside = (...args: any[]) => deps.insertDroppedBeside(...args)
  const insertUserImages = (...args: any[]) => deps.insertUserImages(...args)
  const markdownToHtml = (...args: any[]) => deps.markdownToHtml(...args)
  const moveCurrentBlock = (...args: any[]) => deps.moveCurrentBlock(...args)
  const noteToolbarOrderEdited = (...args: any[]) => deps.noteToolbarOrderEdited(...args)
  const openBlockMenuForSelection = (...args: any[]) => deps.openBlockMenuForSelection(...args)
  const openFindDialog = (...args: any[]) => deps.openFindDialog(...args)
  const replaceOrInsertDroppedImages = (...args: any[]) => deps.replaceOrInsertDroppedImages(...args)
  const scheduleDocChrome = (...args: any[]) => deps.scheduleDocChrome(...args)
  const selectCurrentBlock = (...args: any[]) => deps.selectCurrentBlock(...args)
  const setViewMode = (...args: any[]) => deps.setViewMode(...args)
  const syncImageBubbleCaption = (...args: any[]) => deps.syncImageBubbleCaption(...args)
  const toggleOutlinePanel = (...args: any[]) => deps.toggleOutlinePanel(...args)
  const undoToolbarGroupOrder = (...args: any[]) => deps.undoToolbarGroupOrder(...args)
  const mentionPeople = deps.mentionPeople
  let wordPasteHinted = false

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
    // Markdown 输入规则（# / - / 1. / [ ] / > / ``` / ---），优先于各扩展内置规则
    RteMarkdownInputRules,
    MediaHydrate,
    TextStyle,
    FontSize,
    FontFamily,
    LineHeight,
    LetterSpacing,
    ParagraphAttrs,
    PageBreak,
    Columns,
    Column,
    ImageGroup,
    Callout,
    Bookmark,
    RteBlockquote,
    EmphasisDot,
    Spoiler,
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
    EchartsBlock,
    CrossRef,
    ListStyleAttrs,
    LinkButton,
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
        // 素材库稳定路径，不是磁盘路径，也不是带签名的临时地址
        if (/^\/media\/[0-9a-zA-Z-]+$/.test(url)) return true
        return ctx.defaultValidate(url)
      },
    }),
    RteImage.configure({
      // 块级图片才能在段落之间拖动；拖到另一张图的左右边缘会收成图片组
      inline: false,
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
    Table.configure({ resizable: true, handleWidth: 8 }),
    TableRow,
    RteTableHeader,
    RteTableCell,
    RteHorizontalRule,
    Placeholder.configure({
      placeholder: (args) => rtePlaceholderText(props.placeholder ?? '', args),
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
      includeChildren: true,
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
    }),
    Annotation,
    CommentAnchor,
    SuggestionInsert,
    SuggestionDelete,
    SuggestionMode.configure({
      enabled: deps.suggestingEnabled,
      author: deps.suggestionAuthor,
    }),
    MathInline,
    MathDisplay,
    DateChip,
    DocTitle,
    FormTextInput,
    FormRadioGroup,
    FormCheckboxGroup,
    FormSelect,
    FormTextarea,
    FormNumberInput,
    FormDateInput,
    FormSwitch,
    FormShowIf,
    SyncBlock,
    createRteMention({
      ui: mentionUi,
      people: mentionPeople,
    }),
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
      if (viewMode.value !== 'edit') {
        event.preventDefault()
        return true
      }
      const pastedImages = imageFilesFromClipboard(event.clipboardData)
      const plain = event.clipboardData?.getData('text/plain') || ''
      const html = event.clipboardData?.getData('text/html') || ''
      if (!pasteCarriesText(plain, html)) {
        const images = pastedImages.length ? pastedImages : filesFromImageDataUrls(html)
        if (images.length) {
          event.preventDefault()
          void insertUserImages(images)
          return true
        }
      }
      const volume = pasteVolume(Math.max(plain.length, html.length))
      if (volume === 'reject') {
        event.preventDefault()
        ElMessage.error('粘贴内容过大，请分段粘贴（约 120 万字符以内）')
        return true
      }
      if (volume === 'warn') {
        ElMessage.info('正在粘贴较大内容，编辑器可能短暂无响应')
      }
      if (
        plain &&
        pasteFormatMode.value === 'keep' &&
        looksLikeTsvTable(plain) &&
        !htmlHasTable(html)
      ) {
        event.preventDefault()
        const ed = editor.value
        if (!ed) return true
        ed.chain().focus().insertContent(tsvToTableHtml(plain)).run()
        return true
      }
      if (plain && isBareHttpUrl(plain) && !html.trim()) {
        event.preventDefault()
        const ed = editor.value
        if (!ed) return true
        const href = plain.trim()
        if (!ed.state.selection.empty) {
          ed.chain().focus().setLink({ href }).run()
        } else {
          ed.chain()
            .focus()
            .insertContent(
              `<a href="${href.replace(/"/g, '&quot;')}" class="rte-link">${escapeHtml(href)}</a>`,
            )
            .run()
        }
        return true
      }
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
        const chainCmd = ed.chain().focus()
        if (!ed.state.selection.empty) {
          chainCmd.deleteSelection()
        }
        chainCmd.insertContent(plainTextToPasteContent(plain)).run()
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
    handleDrop(view, event) {
      if (!view.editable || viewMode.value !== 'edit') {
        event.preventDefault()
        return true
      }
      const files = imageFilesFromClipboard(event.dataTransfer)
      if (!files.length) return false
      event.preventDefault()
      const edge = imageEdgeAtPoint(view, event.clientX, event.clientY)
      if (edge) {
        event.preventDefault()
        void insertDroppedBeside(edge.imagePos, edge.side, files)
        return true
      }
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
      const onImage = (event.target as HTMLElement | null)?.closest?.(
        '[data-resize-container][data-node="image"], img.rte-image',
      )
      if (onImage && files.length === 1) {
        void replaceOrInsertDroppedImages(view, files, coords?.pos)
      } else {
        void insertUserImages(files, coords?.pos)
      }
      return true
    },
    handleClick(_view, _pos, event) {
      const target = event.target as HTMLElement | null
      const math = target?.closest?.(
        '[data-type="math-inline"], [data-type="math-display"], .rte-math',
      ) as HTMLElement | null
      if (math) {
        event.preventDefault()
        openFormulaFromChip(math)
        return true
      }
      const xref = target?.closest?.('[data-type="cross-ref"]') as HTMLElement | null
      if (xref) {
        const ed = editor.value
        if (!ed) return true
        const pos = findCrossRefPos(
          ed.state.doc,
          xref.getAttribute('data-target') || '',
          xref.getAttribute('data-label') || xref.textContent || '',
        )
        if (pos != null) {
          event.preventDefault()
          jumpToPos(ed, pos)
        }
        return true
      }
      const ann = target?.closest?.('[data-annotation]') as HTMLElement | null
      if (ann) {
        const href = ann.getAttribute('data-href')?.trim()
        if (!href) return false
        event.preventDefault()
        deps.onEditorLinkClick?.(href)
        return true
      }
      const attach = target?.closest?.('a.rte-attachment-link[href]') as HTMLAnchorElement | null
      if (attach) {
        const href = attach.getAttribute('href')?.trim() || ''
        if (href) {
          event.preventDefault()
          const name = (attach.getAttribute('title') || attach.textContent || '').replace(/^📎\s*/, '').trim()
          deps.onAttachmentOpen?.(href, name)
          return true
        }
      }
      const anchor = target?.closest?.('a[href]') as HTMLElement | null
      if (!anchor || viewMode.value === 'edit') return false
      const href = anchor.getAttribute('href')?.trim()
      if (!href) return false
      event.preventDefault()
      deps.onEditorLinkClick?.(href)
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
        if (tableMenuOpen.value || tableQuickOpen.value) closeTableMenu()
        if (tableOpsSheetOpen.value) tableOpsSheetOpen.value = false
        if (tableCtx.value.open) closeTableCtx()
        return false
      },
    },
    handleKeyDown(view, event) {
      if (
        event.key === 'End' &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        syncCaretWhenEndIsNoop(view)
      ) {
        event.preventDefault()
        return true
      }
      if (event.key === 'Escape' && blockMenuOpen.value) {
        event.preventDefault()
        blockMenuOpen.value = false
        return true
      }
      if (event.key === 'Escape' && deps.cancelFormatPainter()) {
        event.preventDefault()
        return true
      }
      if (event.key === 'Escape' && findDialogOpen.value) {
        event.preventDefault()
        closeFindDialog()
        return true
      }
      // Extra shortcuts (StarterKit already covers Mod-b/i etc.)
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return false
      const ed = editor.value
      if (!ed) return false
      const key = event.key.toLowerCase()
      if (
        viewMode.value !== 'edit' &&
        !previewShortcutAllowed({ key, alt: event.altKey, shift: event.shiftKey })
      ) {
        event.preventDefault()
        return true
      }
      if (key === 'z' && event.shiftKey && !event.altKey && redoPageSetup()) {
        event.preventDefault()
        return true
      }
      if (key === 'z' && !event.shiftKey && !event.altKey && (undoPageSetup() || undoPageMargin() || undoToolbarGroupOrder())) {
        event.preventDefault()
        return true
      }
      if (key === '/' && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        const willOpen = !shortcutsOpen.value
        toggleShortcutsPanel()
        if (willOpen) {
          void nextTick(() => {
            const panel = document.querySelector('.rte-shortcuts-panel') as HTMLElement | null
            panel?.focus()
          })
        }
        return true
      }
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
        if (key === 'o') {
          event.preventDefault()
          toggleOutlinePanel()
          return true
        }
        if (key === 'm') {
          event.preventDefault()
          insertFormula()
          return true
        }
        if (key === 'e') {
          event.preventDefault()
          exportAsMarkdown()
          return true
        }
        if (key === 'p') {
          event.preventDefault()
          openPrintPreview()
          return true
        }
        if (key === '\\' || key === '|') {
          event.preventDefault()
          setViewMode(togglePreviewMode(viewMode.value))
          return true
        }
        if (key === 'h') {
          event.preventDefault()
          if (ed.isActive('highlight')) ed.chain().focus().unsetHighlight().run()
          else ed.chain().focus().setHighlight({ color: FEISHU_HIGHLIGHT_COLORS[0] }).run()
          return true
        }
        if (key === '.' || key === 'enter') {
          event.preventDefault()
          openBlockMenuForSelection()
          return true
        }
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
      if ((key === '\\' || key === '|') && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        clearEditorFormat(ed)
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
    scheduleDocChrome()
    noteToolbarOrderEdited()
    deps.bumpSuggestions()
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
    deps.syncImageCropState?.()
    deps.bumpSuggestions()
  },
  onTransaction: ({ editor: ed, transaction, appendedTransactions }) => {
    if (selectedFormPos.value != null) formSelectionTick.value += 1
    syncSelectedFormFromEditor(ed)
    deps.reapplyTableFilter?.(ed, transaction, appendedTransactions)
  },
})
  return editor
}
