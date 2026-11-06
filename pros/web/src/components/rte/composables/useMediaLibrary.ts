import { computed, ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentRejectReason,
  dataUrlExceedsAttachmentLimit,
} from '../../../utils/attachmentPolicy'
import { insertImagesBeside } from '../../../extensions/imageGroupOps'
import { compressImageFile } from '../../../utils/rteWave21'
import { imageReplaceSide } from '../../../utils/rteRound5'
import { NodeSelection } from '@tiptap/pm/state'
import {
  createAvPicker,
  isAudioFile,
  isVideoFile,
  type AvInsertItem,
} from '../avMediaPicker'

/** 图片/视频库弹层，以及粘贴、拖放插入。 */
export function useMediaLibrary(deps: {
  editor: ShallowRef<Editor | undefined>
  closeMore: () => void
  imageCompressOnInsert: { value: boolean }
}) {
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
  deps.closeMore()
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

const ATTACH_MAX_BYTES = MAX_ATTACHMENT_BYTES
const AV_MAX_BYTES = 50 * 1024 * 1024

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

function imageFilesFromClipboard(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return []
  const out: File[] = []
  const files = Array.from(data.files || [])
  for (const file of files) {
    if (file.type.startsWith('image/')) out.push(file)
  }
  if (out.length) return out
  const items = Array.from(data.items || [])
  for (const item of items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) out.push(file)
  }
  return out
}

/** 图片遵守面板附件同一条 3MB DataURL 上限；过大时先尝试压缩。 */
async function imageSrcWithinPolicy(file: File): Promise<string | null> {
  const name = file.name || 'image.png'
  const mime = file.type || 'image/png'
  const typeReason = attachmentRejectReason(name, mime, 1)
  if (typeReason) {
    rteToast('warning', typeReason)
    return null
  }
  const oversized = file.size > MAX_ATTACHMENT_BYTES
  let src = ''
  if (oversized || deps.imageCompressOnInsert.value) {
    try {
      src = (await compressImageFile(file, { maxEdge: 1600, quality: 0.82 })).dataUrl
    } catch {
      if (oversized) {
        rteToast('warning', attachmentRejectReason(name, mime, file.size) || '图片超过 3MB')
        return null
      }
      src = await readFileAsDataURL(file)
    }
  } else {
    src = await readFileAsDataURL(file)
  }
  if (!src || dataUrlExceedsAttachmentLimit(src)) {
    rteToast('warning', '图片超过 3MB，未插入。可先压缩，或改用链接。')
    return null
  }
  return src
}

async function replaceOrInsertDroppedImages(
  view: {
    state: {
      doc: {
        resolve: (pos: number) => {
          pos: number
          nodeBefore: { type: { name: string }; nodeSize: number } | null
          nodeAfter: { type: { name: string } } | null
        }
        nodeAt: (pos: number) => { attrs: Record<string, unknown> } | null
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tr: { setNodeMarkup: (pos: number, type: null, attrs: Record<string, unknown>) => any }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch: (tr: any) => void
  },
  files: File[],
  at?: number,
) {
  if (at != null && files[0]) {
    const $pos = view.state.doc.resolve(at)
    const side = imageReplaceSide($pos.nodeBefore?.type.name, $pos.nodeAfter?.type.name)
    if (side) {
      const src = await imageSrcWithinPolicy(files[0])
      if (!src) return
      const imagePos =
        side === 'after' ? $pos.pos : $pos.pos - ($pos.nodeBefore?.nodeSize || 0)
      const node = view.state.doc.nodeAt(imagePos)
      if (node) {
        view.dispatch(
          view.state.tr.setNodeMarkup(imagePos, null, { ...node.attrs, src }),
        )
        return
      }
    }
  }
  await insertUserImages(files, at)
}

async function insertDroppedBeside(imagePos: number, side: 'left' | 'right', files: File[]) {
  const ed = deps.editor.value
  if (!ed || ed.isDestroyed) return
  const nodes = []
  for (const file of files) {
    const src = await imageSrcWithinPolicy(file)
    if (!src) continue
    nodes.push(ed.schema.nodes.image!.create({ src, align: 'center', layout: 'block', alt: file.name || '图片' }))
  }
  if (!nodes.length) return
  if (!insertImagesBeside(ed.view, imagePos, side, nodes)) rteToast('warning', '一行最多 10 张图片')
}

async function insertUserImages(files: File[], at?: number) {
  const srcs: string[] = []
  for (const file of files) {
    const src = await imageSrcWithinPolicy(file)
    if (src) srcs.push(src)
  }
  if (!srcs.length) return
  const ed = deps.editor.value
  if (!ed || ed.isDestroyed) return
  const nodes = srcs.map((src) => ({
    type: 'image' as const,
    attrs: { src, align: 'center', layout: 'block' },
  }))
  const chain = ed.chain().focus()
  let atPos = at
  if (atPos == null && ed.state.selection instanceof NodeSelection) atPos = ed.state.selection.to
  if (atPos != null) chain.insertContentAt(atPos, nodes)
  else chain.insertContent(nodes)
  chain.run()
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
      const src = await imageSrcWithinPolicy(file)
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
  const ed = deps.editor.value
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

/** 视频与音频共用同一套选择窗，只是文案、文件类型和插入节点不同。 */
const videoFileInputRef = ref<HTMLInputElement | null>(null)
const audioFileInputRef = ref<HTMLInputElement | null>(null)

function insertAvItems(kind: 'video' | 'audio', items: AvInsertItem[]) {
  const ed = deps.editor.value
  const valid = items.filter((item) => item.src && item.src.trim())
  if (!ed || !valid.length) return
  if (kind === 'video') {
    const multi = valid.length > 1
    const defaultWidth = multi ? Math.max(140, Math.floor(560 / Math.min(valid.length, 4))) : null
    const nodes = valid.map((item) => ({
      type: 'video' as const,
      attrs: defaultWidth
        ? { src: item.src, controls: true, width: defaultWidth }
        : { src: item.src, controls: true },
    }))
    ed.chain().focus().insertContent(nodes).run()
    return
  }
  ed.chain()
    .focus()
    .insertContent(
      valid.map((item) => ({
        type: 'audio' as const,
        attrs: { src: item.src, title: item.name || null, controls: true },
      })),
    )
    .run()
}

function avMessages(kind: 'video' | 'audio') {
  const noun = kind === 'video' ? '视频' : '音频'
  const examples = kind === 'video' ? 'mp4 / webm / mov' : 'mp3 / wav / m4a'
  const upload = kind === 'video' ? '本地视频上传' : '本地音频上传'
  return {
    badType: `请选择${noun}文件（${examples} 等）`,
    tooBig: (name: string, maxMb: number) => `${name} 超过 ${maxMb}MB，已跳过`,
    allTooBig: `所选${noun}均超出大小限制`,
    readFail: `${noun}读取失败，请换 ${examples} 再试`,
    badUrl: `请输入至少一个有效的${noun} URL（http/https，每行一个）`,
    noneSelected: `请选择${noun}，或使用「${upload}」`,
    missingData: `所选${noun}缺少文件数据，请重新上传`,
    inserted: (count: number) => `已插入 ${count} 个${noun}`,
  }
}

const videoPicker = createAvPicker({
  kind: 'video',
  copy: {
    ariaLabel: '插入视频',
    libraryLabel: '我的视频',
    uploadLabel: '本地视频上传',
    urlHint: '每行一个视频 URL，支持一次插入多个。',
    urlPlaceholder: 'https://example.com/a.mp4\nhttps://example.com/b.webm',
    sideIcon: '🎬',
    preview: 'video',
  },
  catStorageKey: 'metamatrix-rte-video-categories',
  assetStorageKey: 'metamatrix-rte-video-assets',
  maxBytes: AV_MAX_BYTES,
  isFile: isVideoFile,
  fileInput: videoFileInputRef,
  messages: avMessages('video'),
  closeMore: () => deps.closeMore(),
  toast: rteToast,
  uid,
  insertItems: (items) => insertAvItems('video', items),
})

const audioPicker = createAvPicker({
  kind: 'audio',
  copy: {
    ariaLabel: '插入音频',
    libraryLabel: '我的音频',
    uploadLabel: '本地音频上传',
    urlHint: '每行一个音频 URL，支持一次插入多个。',
    urlPlaceholder: 'https://example.com/a.mp3\nhttps://example.com/b.wav',
    sideIcon: '♪',
    preview: 'audio',
  },
  catStorageKey: 'metamatrix-rte-audio-categories',
  assetStorageKey: 'metamatrix-rte-audio-assets',
  maxBytes: AV_MAX_BYTES,
  isFile: isAudioFile,
  fileInput: audioFileInputRef,
  messages: avMessages('audio'),
  closeMore: () => deps.closeMore(),
  toast: rteToast,
  uid,
  insertItems: (items) => insertAvItems('audio', items),
})

const videoDialogOpen = computed(() => videoPicker.open)
const audioDialogOpen = computed(() => audioPicker.open)

  return {
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
    videoPicker,
    audioPicker,
    videoDialogOpen,
    audioDialogOpen,
    videoFileInputRef,
    audioFileInputRef,
    closeVideoDialog: () => videoPicker.close(),
    closeAudioDialog: () => audioPicker.close(),
    insertVideo: () => videoPicker.openDialog(),
    insertAudio: () => audioPicker.openDialog(),
    onLocalVideoFilesChange: (event: Event) => videoPicker.onFiles(event),
    onLocalAudioFilesChange: (event: Event) => audioPicker.onFiles(event),
  }
}
