<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { ElMessage } from 'element-plus'
import { looksLikeHtml, escapeHtml } from '../utils/itemsHtml'
import { Annotation } from '../extensions/annotation'
import { MathInline, MathDisplay, renderKatex } from '../extensions/math'
import { Video } from '../extensions/video'
import { toolbarIconMap, IconTableRows, IconTableCols } from './rteToolbarIcons'
import type { Component } from 'vue'
import JSZip from 'jszip'

const props = withDefaults(
  defineProps<{
    modelValue: string
    title?: string
    showTitle?: boolean
    placeholder?: string
    compact?: boolean
    /** 最大化时为 true：展示完整工具条；false 时仅标题/粗/斜/列表 + 更多 */
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
      // TipTap 3 StarterKit 自带 Link；关掉以免与下方 Link.configure 重复，
      // 否则 data:/blob: 附件链接会被默认协议校验剥掉 href
      link: false,
      // TipTap 3 StarterKit 也自带 Underline；关掉以免与下方 Underline 重复注册
      underline: false,
      // 拖拽图片到同行时更明显的落点指示（飞书式并排）
      dropcursor: { color: '#5b8cff', width: 2 },
    }),
    Underline,
    TextStyle,
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
    Image.configure({
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
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: props.placeholder,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),
    Annotation,
    MathInline,
    MathDisplay,
  ],
  editorProps: {
    attributes: {
      class: 'rte-prose',
      spellcheck: 'false',
    },
    transformPastedHTML(html) {
      // Paste cleanup: strip scripts/styles/event handlers & Microsoft junk wrappers
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/<(meta|link|xml|o:p)[^>]*>/gi, '')
        .replace(/<\/(xml|o:p)>/gi, '')
        .replace(/class=("Mso[^"]*"|'Mso[^']*')/gi, '')
        .replace(/style="[^"]*mso-[^"]*"/gi, '')
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
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault()
        ed.chain().focus().toggleUnderline().run()
        return true
      }
      if (event.key.toLowerCase() === 'e' && event.shiftKey) {
        event.preventDefault()
        ed.chain().focus().toggleCodeBlock().run()
        return true
      }
      return false
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
function toggleUnderline() {
  chain()?.toggleUnderline().run()
}
function toggleStrike() {
  chain()?.toggleStrike().run()
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
}
function applyHighlightColor(color: string) {
  setHighlightColor(color)
  highlightOpen.value = false
  moreHighlightOpen.value = false
  moreOpen.value = false
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
function toggleBlockquote() {
  chain()?.toggleBlockquote().run()
}
function setHorizontalRule() {
  chain()?.setHorizontalRule().run()
}
function toggleCodeBlock() {
  chain()?.toggleCodeBlock().run()
}

/** —— 插入链接 —— */
const linkDialogOpen = ref(false)
const linkText = ref('')
const linkHref = ref('')

function resetLinkDialog() {
  linkText.value = ''
  linkHref.value = ''
}

function openLinkDialog() {
  const ed = editor.value
  resetLinkDialog()
  if (ed) {
    const { from, to, empty } = ed.state.selection
    if (!empty) {
      linkText.value = ed.state.doc.textBetween(from, to, ' ')
    }
    const prev = ed.getAttributes('link').href as string | undefined
    if (prev) linkHref.value = prev
  }
  linkDialogOpen.value = true
  moreOpen.value = false
}

function closeLinkDialog() {
  linkDialogOpen.value = false
  resetLinkDialog()
}

function insertLink() {
  openLinkDialog()
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
      const src = await readFileAsDataURL(file)
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

function resetTableDialog() {
  tableRows.value = 3
  tableCols.value = 3
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
  tableCols.value = clampInt(Number.isNaN(n) ? 1 : n, 1, 8)
}

function stepTableRows(delta: number) {
  tableRows.value = clampInt(tableRows.value + delta, 1, 100)
}

function stepTableCols(delta: number) {
  tableCols.value = clampInt(tableCols.value + delta, 1, 8)
}

function confirmInsertTable() {
  const ed = editor.value
  if (!ed) return
  const rows = clampInt(tableRows.value, 1, 100)
  const cols = clampInt(tableCols.value, 1, 8)
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
function tableDeleteTable() {
  runTableCommand(() => editor.value!.chain().focus().deleteTable().run())
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
  colorOpen.value = false
  highlightOpen.value = false
  alignOpen.value = false
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
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
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
  ElMessage.info('预览即将支持')
}
function onPublish() {
  ElMessage.success('内容已写入文档（面板内无需单独发布）')
}

const headingOpen = ref(false)
const listOpen = ref(false)
const moreOpen = ref(false)
const colorOpen = ref(false)
const highlightOpen = ref(false)
const moreColorOpen = ref(false)
const moreHighlightOpen = ref(false)
const alignOpen = ref(false)
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

const WORD_STANDARD_COLORS = [
  '#C00000',
  '#FF0000',
  '#FFC000',
  '#FFFF00',
  '#92D050',
  '#00B050',
  '#00B0F0',
  '#0070C0',
  '#002060',
  '#7030A0',
]

/** Word 荧光笔常用色（无颜色单独按钮） */
const WORD_HIGHLIGHT_COLORS = [
  { color: '#FFFF00', label: '黄色' },
  { color: '#00FF00', label: '鲜绿' },
  { color: '#00FFFF', label: '青绿' },
  { color: '#FF00FF', label: '粉红' },
  { color: '#0000FF', label: '蓝色' },
  { color: '#FF0000', label: '红色' },
  { color: '#000080', label: '深蓝' },
  { color: '#008080', label: '青色' },
  { color: '#008000', label: '绿色' },
  { color: '#800080', label: '紫色' },
  { color: '#800000', label: '深红' },
  { color: '#808000', label: '深黄' },
  { color: '#808080', label: '灰色 50%' },
  { color: '#C0C0C0', label: '灰色 25%' },
  { color: '#000000', label: '黑色' },
]

function closeColorMenus() {
  colorOpen.value = false
  moreColorOpen.value = false
  customColorOpen.value = false
}

function closeHighlightMenus() {
  highlightOpen.value = false
  moreHighlightOpen.value = false
}

function toggleColorMenu() {
  closeHighlightMenus()
  headingOpen.value = false
  listOpen.value = false
  alignOpen.value = false
  customColorOpen.value = false
  colorOpen.value = !colorOpen.value
}

function toggleHighlightMenu() {
  closeColorMenus()
  headingOpen.value = false
  listOpen.value = false
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
    moreColorOpen.value = !moreColorOpen.value
    customColorOpen.value = false
    return
  }
  if (t.key === 'highlight') {
    moreColorOpen.value = false
    customColorOpen.value = false
    moreHighlightOpen.value = !moreHighlightOpen.value
    return
  }
  moreColorOpen.value = false
  moreHighlightOpen.value = false
  customColorOpen.value = false
  moreOpen.value = false
  t.run?.()
}

const PRIMARY_KEYS = new Set(['heading', 'bold', 'italic', 'list'])

type ToolItem = {
  key: string
  label: string
  /** 悬停完整说明；缺省用 label */
  title?: string
  icon: string
  iconComp?: Component
  kind?: 'heading' | 'list' | 'more' | 'btn' | 'color' | 'highlight' | 'align' | 'import' | 'table' | 'attach' | 'divider'
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
   * 最大化工具栏分组（对齐知乎专栏写作页）：
   * 操作 | 文字 | 段落高级 | 插入 | 其他
   * 目录已按产品要求移除，勿恢复。
   */
  return [
    // —— 操作 ——
    { key: 'undo', label: '撤销', icon: '↶', iconComp: ic('undo'), run: undo },
    { key: 'redo', label: '重做', icon: '↷', iconComp: ic('redo'), run: redo },
    {
      key: 'clear',
      label: '清除格式',
      title: '清除格式',
      icon: '⌫',
      iconComp: ic('clear'),
      run: clearFormat,
    },
    { key: 'div-ops', label: '', icon: '', kind: 'divider' },
    // —— 文字 ——
    { key: 'heading', label: '标题', icon: 'H▾', iconComp: ic('heading'), kind: 'heading' },
    {
      key: 'bold',
      label: '加粗',
      icon: 'B',
      iconComp: ic('bold'),
      active: () => isActive('bold'),
      run: toggleBold,
    },
    {
      key: 'italic',
      label: '斜体',
      icon: 'I',
      iconComp: ic('italic'),
      active: () => isActive('italic'),
      run: toggleItalic,
    },
    {
      key: 'underline',
      label: '下划线',
      icon: 'U',
      iconComp: ic('underline'),
      active: () => isActive('underline'),
      run: toggleUnderline,
    },
    {
      key: 'strike',
      label: '删除线',
      icon: 'S̶',
      iconComp: ic('strike'),
      active: () => isActive('strike'),
      run: toggleStrike,
    },
    {
      key: 'codeInline',
      label: '行内码',
      title: '行内代码',
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
    { key: 'align', label: '对齐', icon: '≡', iconComp: ic('align'), kind: 'align' },
    { key: 'list', label: '列表', icon: '☰▾', iconComp: ic('list'), kind: 'list' },
    { key: 'div-text', label: '', icon: '', kind: 'divider' },
    // —— 高级（段落）——
    {
      key: 'quote',
      label: '引用',
      icon: '❝',
      iconComp: ic('quote'),
      active: () => isActive('blockquote'),
      run: toggleBlockquote,
    },
    { key: 'hr', label: '分割线', icon: '┄', iconComp: ic('hr'), run: setHorizontalRule },
    {
      key: 'code',
      label: '代码块',
      icon: '</>',
      iconComp: ic('code'),
      active: () => isActive('codeBlock'),
      run: toggleCodeBlock,
    },
    { key: 'div-block', label: '', icon: '', kind: 'divider' },
    // —— 插入 ——
    { key: 'image', label: '图片', icon: '🖼', iconComp: ic('image'), run: insertImage },
    { key: 'video', label: '视频', icon: '▶', iconComp: ic('video'), run: insertVideo },
    {
      key: 'link',
      label: '链接',
      icon: '🔗',
      iconComp: ic('link'),
      active: () => isActive('link'),
      run: insertLink,
    },
    { key: 'formula', label: '公式', icon: 'Σ', iconComp: ic('formula'), run: insertFormula },
    { key: 'table', label: '表格', icon: '▦', iconComp: ic('table'), kind: 'table', active: () => isInTable(), run: onTableToolClick },
    { key: 'attach', label: '附件', icon: '☁▾', iconComp: ic('attach'), kind: 'attach', run: onAttachment },
    { key: 'note', label: '注释', icon: '[1]', iconComp: ic('note'), run: insertNote },
    { key: 'div-insert', label: '', icon: '', kind: 'divider' },
    // —— 其他 ——
    { key: 'import', label: '导入', icon: '⇪▾', iconComp: ic('import'), kind: 'import', run: onImport },
    // 草稿备份：按产品要求先隐藏入口（保留 onDraftBackup 逻辑）
    // { key: 'draft', label: '草稿备份', icon: '⏱', run: onDraftBackup },
  ]
})

/**
 * 仅最大化（expanded）时展示：不进紧凑顶栏，也不进「更多」。
 * 导入等同款；「更改」若后续加回工具条，请放入此集合。
 */
const EXPANDED_ONLY_KEYS = new Set(['import'])

/** 顶栏直接展示的工具 */
const visibleTools = computed(() => {
  const all = allTools.value
  if (props.expanded) return all
  // 非最大化：仅 标题/加粗/斜体/列表；其余进「更多」；隐藏导入/更改；无分隔线
  return all.filter(
    (t) => t.kind !== 'divider' && !EXPANDED_ONLY_KEYS.has(t.key) && PRIMARY_KEYS.has(t.key),
  )
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
  customColorOpen.value = false
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

defineExpose({ focusEditor, editor, onDraftBackup })
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
            @click.stop="closeColorMenus(); closeHighlightMenus(); listOpen = false; alignOpen = false; headingOpen = !headingOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('heading')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >标题<span class="rte-caret" aria-hidden="true"></span
            ></span>
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
            @click.stop="closeColorMenus(); closeHighlightMenus(); headingOpen = false; alignOpen = false; listOpen = !listOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('list')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label"
              >列表<span class="rte-caret" aria-hidden="true"></span
            ></span>
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
        <div
          v-else-if="t.kind === 'highlight'"
          class="rte-tool-wrap"
          @mouseleave="highlightOpen = false"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{ active: isActive('highlight') || highlightOpen }"
            title="突出显示"
            @click.stop="toggleHighlightMenu"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('highlight')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">高亮</span>
          </button>
          <div
            v-if="highlightOpen"
            class="rte-menu rte-color-menu rte-highlight-menu"
            @mousedown.prevent
          >
            <button
              type="button"
              class="rte-color-action"
              :class="{ selected: !isActive('highlight') }"
              @click="applyHighlightColor('')"
            >
              无颜色
            </button>
            <div class="rte-color-section-label">高亮颜色</div>
            <div class="rte-highlight-swatches">
              <button
                v-for="h in WORD_HIGHLIGHT_COLORS"
                :key="h.color"
                type="button"
                class="rte-swatch"
                :class="{
                  selected: colorsEqual(currentHighlightColor(), h.color),
                  'is-light': h.color === '#FFFF00' || h.color === '#00FF00' || h.color === '#00FFFF' || h.color === '#C0C0C0',
                }"
                :style="{ background: h.color }"
                :title="h.label"
                @click="applyHighlightColor(h.color)"
              />
            </div>
          </div>
        </div>
        <div
          v-else-if="t.kind === 'color'"
          class="rte-tool-wrap"
          @mouseleave="closeColorMenus"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{ active: colorOpen }"
            title="字体颜色"
            @click.stop="toggleColorMenu"
          >
            <span
              class="rte-tool-icon rte-color-icon"
              :style="{ textDecorationColor: currentTextColor() || '#1d2129' }"
            >
              <component :is="toolIcon('color')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">颜色</span>
          </button>
          <div
            v-if="colorOpen"
            class="rte-menu rte-color-menu"
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
            <div class="rte-standard-row">
              <button
                v-for="c in WORD_STANDARD_COLORS"
                :key="'st-' + c"
                type="button"
                class="rte-swatch"
                :class="{ selected: colorsEqual(currentTextColor(), c) }"
                :style="{ background: c }"
                :title="c"
                @click="applyTextColor(c)"
              />
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
        </div>
        <div
          v-else-if="t.kind === 'align'"
          class="rte-tool-wrap"
          @mouseleave="alignOpen = false"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{
              active:
                isActive({ textAlign: 'center' }) ||
                isActive({ textAlign: 'right' }) ||
                isActive({ textAlign: 'justify' }),
            }"
            title="对齐"
            @click.stop="closeColorMenus(); closeHighlightMenus(); headingOpen = false; listOpen = false; alignOpen = !alignOpen"
          >
            <span class="rte-tool-icon">
              <component :is="toolIcon('align')" class="rte-ep-icon" />
            </span>
            <span class="rte-tool-label">对齐</span>
          </button>
          <div v-if="alignOpen" class="rte-menu" @mousedown.prevent>
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
        </div>
        <div
          v-else-if="t.kind === 'divider'"
          class="rte-tool-divider"
          aria-hidden="true"
        />
        <div
          v-else-if="t.kind === 'table'"
          class="rte-tool-wrap"
          @mouseleave="closeTableMenu"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{ active: tableMenuOpen || tableDialogOpen || isInTable() }"
            :title="isInTable() ? '表格操作' : '插入表格'"
            :aria-haspopup="isInTable() ? 'menu' : 'dialog'"
            :aria-expanded="isInTable() ? tableMenuOpen : undefined"
            @click.stop="onTableToolbarButtonClick"
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
          <div
            v-if="tableMenuOpen && isInTable()"
            class="rte-menu rte-table-menu"
            role="menu"
            @mousedown.prevent
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
        </div>
        <div
          v-else-if="t.kind === 'import'"
          class="rte-tool-wrap"
          @mouseleave="closeImportMenu"
        >
          <button
            type="button"
            class="rte-tool"
            :class="{ active: importMenuOpen }"
            title="导入"
            @click.stop="importMenuOpen = !importMenuOpen"
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
          <div
            v-if="importMenuOpen"
            class="rte-import-menu"
            @mousedown.prevent
          >
            <button type="button" class="rte-import-item" @click="pickImportDocument">
              <span class="rte-import-left">
                <component :is="toolIcon('importDoc')" class="rte-ep-icon" />
                <span>导入文档</span>
              </span>
              <span class="rte-import-pill">MD/Doc</span>
            </button>
            <button type="button" class="rte-import-item" @click="openImportLinkDialog">
              <span class="rte-import-left">
                <component :is="toolIcon('importLink')" class="rte-ep-icon" />
                <span>导入链接</span>
              </span>
              <span class="rte-import-pill">公众号</span>
            </button>
          </div>
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
        <button
          v-else
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
          <span class="rte-tool-icon">
            <component :is="toolIcon('more')" class="rte-ep-icon" />
          </span>
          <span class="rte-tool-label">更多</span>
        </button>
        <div
          v-if="moreOpen"
          class="rte-more-menu"
          :class="{ 'has-flyout': moreColorOpen || moreHighlightOpen }"
          @mousedown.prevent
        >
          <template v-for="mt in moreTools" :key="mt.key">
            <button
              type="button"
              class="rte-more-item"
              :class="{
                active:
                  mt.active?.() ||
                  (mt.kind === 'color' && moreColorOpen) ||
                  (mt.key === 'highlight' && moreHighlightOpen),
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
                v-if="mt.kind === 'color' || mt.key === 'highlight' || mt.kind === 'attach'"
                class="rte-more-caret"
              >{{ mt.kind === 'attach' ? '▾' : '▸' }}</span>
            </button>
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
              <div class="rte-standard-row">
                <button
                  v-for="c in WORD_STANDARD_COLORS"
                  :key="'mst-' + c"
                  type="button"
                  class="rte-swatch"
                  :class="{ selected: colorsEqual(currentTextColor(), c) }"
                  :style="{ background: c }"
                  :title="c"
                  @click="applyTextColor(c)"
                />
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
              v-if="mt.key === 'highlight' && moreHighlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button
                type="button"
                class="rte-color-action"
                :class="{ selected: !isActive('highlight') }"
                @click="applyHighlightColor('')"
              >
                无颜色
              </button>
              <div class="rte-color-section-label">高亮颜色</div>
              <div class="rte-highlight-swatches">
                <button
                  v-for="h in WORD_HIGHLIGHT_COLORS"
                  :key="'mh-' + h.color"
                  type="button"
                  class="rte-swatch"
                  :class="{
                    selected: colorsEqual(currentHighlightColor(), h.color),
                    'is-light':
                      h.color === '#FFFF00' ||
                      h.color === '#00FF00' ||
                      h.color === '#00FFFF' ||
                      h.color === '#C0C0C0',
                  }"
                  :style="{ background: h.color }"
                  :title="h.label"
                  @click="applyHighlightColor(h.color)"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :options="{ placement: 'top', offset: 8 }"
      class="rte-bubble"
    >
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('bold') }"
        title="加粗"
        @mousedown.prevent
        @click="toggleBold"
      >
        B
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('italic') }"
        title="斜体"
        @mousedown.prevent
        @click="toggleItalic"
      >
        I
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('underline') }"
        title="下划线"
        @mousedown.prevent
        @click="toggleUnderline"
      >
        U
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('strike') }"
        title="删除线"
        @mousedown.prevent
        @click="toggleStrike"
      >
        S
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('highlight') }"
        title="高亮"
        @mousedown.prevent
        @click="toggleHighlight"
      >
        🖍
      </button>
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ active: isActive('link') }"
        title="链接"
        @mousedown.prevent
        @click="insertLink"
      >
        🔗
      </button>
    </BubbleMenu>

    <div class="rte-canvas" @click="onCanvasClick">
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
              max="8"
              :value="tableCols"
              placeholder="输入表格列数（最大 8 列）"
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

    <!-- 插入链接 -->
    <Teleport to="body">
      <div
        v-if="linkDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="closeLinkDialog"
      >
        <div
          class="rte-link-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入链接"
          @mousedown.stop
        >
          <h3 class="rte-table-title">插入链接</h3>
          <div class="rte-note-field rte-note-text-field" style="width: 100%; margin-bottom: 12px">
            <span class="rte-note-field-icon" aria-hidden="true">T</span>
            <input
              v-model="linkText"
              type="text"
              class="rte-note-input"
              placeholder="输入链接文本"
              maxlength="500"
              @keydown.enter.prevent="confirmInsertLink"
            />
          </div>
          <div class="rte-note-field rte-note-link-field">
            <span class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input
              v-model="linkHref"
              type="url"
              class="rte-note-input"
              placeholder="输入链接地址"
              maxlength="2000"
              @keydown.enter.prevent="confirmInsertLink"
            />
          </div>
          <div class="rte-modal-actions">
            <button type="button" class="rte-modal-cancel" @click="closeLinkDialog">
              取消
            </button>
            <button type="button" class="rte-modal-confirm" @click="confirmInsertLink">
              确认
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

.rte-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: #eef0f3;
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
.rte-more-caret {
  margin-left: auto;
  color: #c0c4cc;
  font-size: 11px;
}
.rte-more-wrap {
  position: relative;
}
.rte-more-menu.has-flyout {
  overflow: visible;
  max-height: none;
}
.rte-more-flyout {
  position: relative;
  left: 0;
  right: auto;
  top: auto;
  margin: 4px 0 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 40;
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
  background: #1d2129;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  z-index: 50;
}
.rte-bubble-btn {
  min-width: 28px;
  height: 28px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
}
.rte-bubble-btn:hover,
.rte-bubble-btn.active {
  background: rgba(255, 255, 255, 0.16);
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
}

.rte-root.expanded .rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  gap: 0;
  row-gap: 6px;
  min-height: 64px;
  padding: 10px 0 10px 20px;
  border-bottom: none;
  /* 知乎：底部 0.5px 发丝线，而非粗 border */
  box-shadow: inset 0 -0.5px 0 rgba(235, 235, 235);
  background: #fff;
  overflow: visible;
  position: relative;
  z-index: 5;
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

/* 分组发丝竖线 1×20 #EBECED；线后 16px 再接下组 */
.rte-root.expanded .rte-tool-divider {
  width: 1px;
  height: 20px;
  min-height: 20px;
  align-self: center;
  flex: 0 0 auto;
  margin: 0 16px 0 0;
  background: #ebeced;
  border-radius: 0;
  pointer-events: none;
}

.rte-root.expanded .rte-menu,
.rte-root.expanded .rte-import-menu,
.rte-root.expanded .rte-table-menu,
.rte-root.expanded .rte-more-menu {
  /* 视觉上离按钮 6px，但用伪元素填满空隙，避免 @mouseleave 在移入菜单时误关 */
  top: calc(100% + 6px);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(18, 18, 18, 0.12);
  border: 1px solid #ebebeb;
  z-index: 50;
}

.rte-root.expanded .rte-menu::before,
.rte-root.expanded .rte-import-menu::before,
.rte-root.expanded .rte-table-menu::before,
.rte-root.expanded .rte-more-menu::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -8px;
  height: 8px;
}

/* 导入 / 表格偏右：右对齐弹出，避免被 .rte-root{overflow:hidden} 右侧裁切 */
.rte-root.expanded .rte-import-menu,
.rte-root.expanded .rte-table-menu {
  left: auto;
  right: 0;
}

.rte-root.expanded .rte-menu button {
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

/* 非最大化：紧凑小按钮（标题/加粗/斜体/列表 + 更多），不做知乎式大图标 */
.rte-root:not(.expanded) .rte-toolbar {
  gap: 2px 2px;
  padding: 4px 6px 3px;
  background: #fff;
  overflow: visible;
}

.rte-root:not(.expanded) .rte-tool {
  min-width: 34px;
  max-width: 48px;
  width: auto;
  min-height: 0;
  height: auto;
  padding: 3px 5px 2px;
  gap: 1px;
  border-radius: 4px;
}

.rte-root:not(.expanded) .rte-tool-icon {
  width: auto;
  height: 16px;
  min-height: 16px;
}

.rte-root:not(.expanded) .rte-tool-label {
  font-size: 10px;
  color: #86909c;
  transform: scale(0.95);
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
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
  display: none;
}

.rte-import-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 40;
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
</style>

<style>
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
.rte-link-dialog {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  padding: 22px 24px 20px;
  box-sizing: border-box;
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

</style>
