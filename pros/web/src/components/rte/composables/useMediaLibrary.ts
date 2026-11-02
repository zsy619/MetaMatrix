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

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i
const ATTACH_MAX_BYTES = MAX_ATTACHMENT_BYTES
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
  deps.closeMore()
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
  const ed = deps.editor.value
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
  }
}
