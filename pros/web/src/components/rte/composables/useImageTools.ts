import { ref, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

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
  imageLightboxSrc.value = String(ed.getAttributes('image')?.src || '')
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


  return {
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
  }
}
