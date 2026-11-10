import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** 题注画在图片格子内部，不作为图片组行里的额外子节点。 */
function captionHost(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  if (dom.matches('[data-resize-container], [data-node="image"]') && dom.tagName !== 'IMG') return dom
  const box = dom.closest('[data-resize-container]')
  if (box instanceof HTMLElement && box.tagName !== 'IMG') return box
  return dom.parentElement
}

function paintCaptions(view: EditorView) {
  view.dom.querySelectorAll('.rte-image-caption-inline').forEach((node) => node.remove())
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return
    const text = String(node.attrs.caption || '').trim()
    if (!text) return
    const host = captionHost(view, pos)
    if (!(host instanceof HTMLElement) || host.tagName === 'IMG') return
    const cap = document.createElement('div')
    cap.className = 'rte-image-caption rte-image-caption-inline'
    cap.setAttribute('contenteditable', 'false')
    cap.textContent = text
    host.appendChild(cap)
  })
}

export function createImageCaptionPlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      const paint = () => paintCaptions(editorView)
      queueMicrotask(paint)
      return {
        update: paint,
        destroy() {
          editorView.dom.querySelectorAll('.rte-image-caption-inline').forEach((node) => node.remove())
        },
      }
    },
  })
}
