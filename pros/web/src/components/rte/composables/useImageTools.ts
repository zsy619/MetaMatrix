import { onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { keepCropOnReplace } from '../../../utils/rteImageCrop'
import {
  CROP_PRESETS,
  cropFromPreset,
  readCropFromAttrs,
  writeCropToAttrs,
  type CropPreset,
} from '../../../utils/rteImageCropAttrs'
import {
  collectEditorImages,
  indexForImage,
  type RtePreviewImage,
} from '../../../utils/rteImagePreview'

/** 图片气泡：对齐、题注、下载与预览。模板绑定名与原先一致。 */
export function useImageTools(deps: {
  editor: ShallowRef<Editor | undefined>
  viewMode: () => { value: string }
}) {
/** —— 图片对齐 / 题注 —— */
const imageBubbleCaption = ref('')
const IMAGE_LAYOUT_OPTIONS: Array<{
  id: string
  label: string
  align: 'left' | 'center' | 'right'
  layout: 'block' | 'wrap-left' | 'wrap-right'
}> = [
  { id: 'center', label: '居中', align: 'center', layout: 'block' },
  { id: 'left', label: '居左', align: 'left', layout: 'block' },
  { id: 'right', label: '居右', align: 'right', layout: 'block' },
  { id: 'wrap-left', label: '左环绕', align: 'left', layout: 'wrap-left' },
  { id: 'wrap-right', label: '右环绕', align: 'right', layout: 'wrap-right' },
]

function isImageNodeSelected(): boolean {
  const ed = deps.editor.value
  if (!ed) return false
  const sel = ed.state.selection
  return sel instanceof NodeSelection && sel.node.type.name === 'image'
}

function syncImageBubbleCaption() {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) {
    imageBubbleCaption.value = ''
    return
  }
  const cap = ed.getAttributes('image')?.caption
  imageBubbleCaption.value = typeof cap === 'string' ? cap : ''
}

function setImagePlacement(option: (typeof IMAGE_LAYOUT_OPTIONS)[number]) {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return
  ed.chain()
    .focus()
    .updateAttributes('image', { align: option.align, layout: option.layout })
    .run()
}

const imageLightboxSrc = ref('')
const imagePreviewOpen = ref(false)
const imagePreviewItems = ref<RtePreviewImage[]>([])
const imagePreviewIndex = ref(0)

function openImagePreview(pos: number | null, src: string) {
  const ed = deps.editor.value
  const items = ed ? collectEditorImages(ed.state.doc) : []
  if (!items.length && src) {
    imagePreviewItems.value = [{ src, alt: '', caption: '', pos: pos ?? 0 }]
  } else if (!items.length) {
    return
  } else {
    imagePreviewItems.value = items
  }
  imagePreviewIndex.value = indexForImage(imagePreviewItems.value, pos, src)
  imagePreviewOpen.value = true
  imageLightboxSrc.value = imagePreviewItems.value[imagePreviewIndex.value]?.src || src
}

function closeImagePreview() {
  imagePreviewOpen.value = false
  imageLightboxSrc.value = ''
}

function setImagePreviewIndex(index: number) {
  const max = imagePreviewItems.value.length - 1
  if (max < 0) return
  const next = Math.min(max, Math.max(0, index))
  imagePreviewIndex.value = next
  imageLightboxSrc.value = imagePreviewItems.value[next]?.src || ''
}

function stepImagePreview(delta: number) {
  setImagePreviewIndex(imagePreviewIndex.value + delta)
}

function imageFromDblClick(target: Element): HTMLImageElement | null {
  if (target instanceof HTMLImageElement && target.classList.contains('rte-image')) return target
  const direct = target.closest('img.rte-image')
  if (direct instanceof HTMLImageElement) return direct
  // 第二次按下后选区类落在缩放容器上，dblclick 的 target 往往不再是 img。
  const frame = target.closest('[data-node="image"]')
  const nested = frame?.querySelector('img.rte-image')
  return nested instanceof HTMLImageElement ? nested : null
}

function onEditorImageDblClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const img = imageFromDblClick(target)
  if (!img) return
  event.preventDefault()
  event.stopPropagation()
  const ed = deps.editor.value
  let pos: number | null = null
  const host = img.closest('[data-node="image"]') || img
  try {
    const found = ed?.view.posAtDOM(host, 0)
    pos = typeof found === 'number' ? found : null
  } catch {
    pos = null
  }
  openImagePreview(pos, img.currentSrc || img.src || '')
}

let previewDom: HTMLElement | null = null

onMounted(() => {
  previewDom = deps.editor.value?.view?.dom ?? null
  previewDom?.addEventListener('dblclick', onEditorImageDblClick, true)
})

onBeforeUnmount(() => {
  previewDom?.removeEventListener('dblclick', onEditorImageDblClick, true)
  previewDom = null
})

function deleteSelectedImage() {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return
  ed.chain().focus().deleteSelection().run()
}

function downloadSelectedImage() {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return
  const attrs = ed.getAttributes('image')
  const src = String(attrs?.src || '')
  if (!src) return
  const link = document.createElement('a')
  link.href = src
  link.download = String(attrs?.alt || 'image')
  link.click()
}

function openSelectedImage() {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return
  const sel = ed.state.selection
  const pos = sel instanceof NodeSelection ? sel.from : null
  openImagePreview(pos, String(ed.getAttributes('image')?.src || ''))
}

function applyImageCaption() {
  const ed = deps.editor.value
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
  if (deps.viewMode().value !== 'edit') return false
  const ed = payload?.editor
  if (!ed || ed.isDestroyed || ed.isEditable === false) return false
  const sel = ed.state?.selection
  if (!(sel instanceof NodeSelection) || (sel as NodeSelection).node.type.name !== 'image') return false
  return true
}

/** —— 裁剪 / 替换 / alt —— */
const imageCropPreset = ref<string>('')
const imageAlt = ref('')

/** 当前选中图片的裁剪状态，供气泡显示。 */
function imageCropState() {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return null
  const attrs = ed.getAttributes('image') as Record<string, unknown>
  return readCropFromAttrs(attrs)
}

/** 写回裁剪属性。 */
function setImageCrop(crop: Parameters<typeof writeCropToAttrs>[1]) {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return
  const attrs = ed.getAttributes('image') as Record<string, unknown>
  const next = writeCropToAttrs(attrs, crop)
  ed.chain().focus().updateAttributes('image', next).run()
  imageCropPreset.value = ''
}

/** 应用一个裁剪比例预设。 */
function applyCropPreset(preset: CropPreset) {
  setImageCrop(cropFromPreset(preset))
  imageCropPreset.value = preset.id
}

/** 换图：保留裁剪、题注等其它属性。 */
function replaceImageSource(src: string) {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected() || !src) return
  const attrs = ed.getAttributes('image') as Record<string, unknown>
  const next = keepCropOnReplace(attrs, src)
  ed.chain().focus().updateAttributes('image', next).run()
}

/** 改图片替代文字。 */
function setImageAlt(alt: string) {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) return
  ed.chain().focus().updateAttributes('image', { alt: alt.trim() }).run()
}

/** 打开图片气泡时同步裁剪与 alt。 */
function syncImageCropState() {
  const ed = deps.editor.value
  if (!ed || !isImageNodeSelected()) {
    imageCropPreset.value = ''
    imageAlt.value = ''
    return
  }
  const attrs = ed.getAttributes('image') as Record<string, unknown>
  const crop = readCropFromAttrs(attrs)
  const preset = CROP_PRESETS.find((p) => p.aspect === crop.aspect) ?? null
  imageCropPreset.value = preset?.id ?? ''
  imageAlt.value = typeof attrs.alt === 'string' ? attrs.alt : ''
}


  return {
    imageBubbleCaption,
    IMAGE_LAYOUT_OPTIONS,
    isImageNodeSelected,
    syncImageBubbleCaption,
    setImagePlacement,
    imageLightboxSrc,
    imagePreviewOpen,
    imagePreviewItems,
    imagePreviewIndex,
    closeImagePreview,
    setImagePreviewIndex,
    stepImagePreview,
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
  }
}
