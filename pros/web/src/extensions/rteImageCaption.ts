import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const editingCaptions = new WeakMap<EditorView, Set<number>>()

function editingSet(view: EditorView): Set<number> {
  let set = editingCaptions.get(view)
  if (!set) {
    set = new Set()
    editingCaptions.set(view, set)
  }
  return set
}

/** 题注画在图片格子内部，不作为图片组行里的额外子节点。 */
function captionHost(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  if (dom.matches('[data-resize-container], [data-node="image"]') && dom.tagName !== 'IMG') return dom
  const box = dom.closest('[data-resize-container]')
  if (box instanceof HTMLElement && box.tagName !== 'IMG') return box
  return dom.parentElement
}

function markBrokenImages(view: EditorView) {
  view.dom.querySelectorAll('img.rte-image').forEach((node) => {
    if (!(node instanceof HTMLImageElement) || node.dataset.brokenBound) return
    node.dataset.brokenBound = '1'
    node.addEventListener('error', () => node.classList.add('is-broken'))
    if (node.complete && node.naturalWidth === 0 && node.src) node.classList.add('is-broken')
  })
}

function paintCaptions(view: EditorView) {
  markBrokenImages(view)
  const editing = editingSet(view)
  view.dom.querySelectorAll('.rte-image-caption-inline').forEach((node) => {
    if (editing.has(Number((node as HTMLElement).dataset.pos))) return
    node.remove()
  })
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || editing.has(pos)) return
    const text = String(node.attrs.caption || '').trim()
    if (!text) return
    const host = captionHost(view, pos)
    if (!(host instanceof HTMLElement) || host.tagName === 'IMG') return
    const cap = document.createElement('div')
    cap.className = 'rte-image-caption rte-image-caption-inline'
    cap.dataset.pos = String(pos)
    cap.setAttribute('contenteditable', 'false')
    cap.title = '双击修改题注'
    cap.textContent = text
    const before = node.attrs.captionBefore
    if (before != null && before !== node.attrs.caption) {
      cap.classList.add('is-suggestion')
      cap.title = before ? `原题注：${before}` : '原题注为空'
    }
    let cancel = false
    cap.addEventListener('pointerdown', (event) => event.stopPropagation())
    cap.addEventListener('dblclick', (event) => {
      if (!view.editable) return
      event.preventDefault()
      event.stopPropagation()
      cancel = false
      editing.add(pos)
      cap.contentEditable = 'true'
      cap.focus()
    })
    cap.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        cap.blur()
      } else if (event.key === 'Escape') {
        cancel = true
        cap.textContent = text
        cap.blur()
      }
    })
    cap.addEventListener('blur', () => {
      cap.contentEditable = 'false'
      editing.delete(pos)
      const next = (cap.textContent || '').trim()
      const current = view.state.doc.nodeAt(pos)
      if (cancel || !current || current.type.name !== 'image' || next === String(current.attrs.caption || '').trim()) {
        paintCaptions(view)
        return
      }
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...current.attrs,
          caption: next || null,
        }),
      )
    })
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
