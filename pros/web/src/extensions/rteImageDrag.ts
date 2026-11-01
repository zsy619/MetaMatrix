import { NodeSelection, Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  extractOrMoveImage,
  moveImageGroup,
  placeBeside,
  reorderInGroup,
} from './imageGroupOps'
import {
  containerCanHoldImage,
  imageDropKind,
  sameImageDrop,
  siblingInsertPos,
  type RteImageDropKind,
} from '../utils/rteImageLayout'

let dragFrom: number | null = null
let dragKind: 'image' | 'group' = 'image'
let dropLine: HTMLElement | null = null
let dropPreview: HTMLElement | null = null
let sizeTip: HTMLElement | null = null

type PointerDrag = {
  view: EditorView
  from: number
  kind: 'image' | 'group'
  startX: number
  startY: number
  moved: boolean
}

let pointerDrag: PointerDrag | null = null

export function armImageDrag(
  view: EditorView,
  pos: number,
  kind: 'image' | 'group',
  event: PointerEvent,
) {
  if (!view.editable || event.button !== 0) return
  pointerDrag = {
    view,
    from: pos,
    kind,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  }
  dragFrom = pos
  dragKind = kind
}

function ensureLine(): HTMLElement {
  if (!dropLine) {
    dropLine = document.createElement('div')
    dropLine.className = 'rte-image-drop-line'
    dropLine.setAttribute('aria-hidden', 'true')
    document.body.appendChild(dropLine)
  }
  return dropLine
}

function hideLine() {
  dropLine?.remove()
  dropLine = null
  dropPreview?.remove()
  dropPreview = null
}

function ensurePreview(): HTMLElement {
  if (!dropPreview) {
    dropPreview = document.createElement('div')
    dropPreview.className = 'rte-image-drop-preview'
    dropPreview.setAttribute('aria-hidden', 'true')
    document.body.appendChild(dropPreview)
  }
  return dropPreview
}

function ensureTip(): HTMLElement {
  if (!sizeTip) {
    sizeTip = document.createElement('div')
    sizeTip.className = 'rte-image-size-tip'
    sizeTip.setAttribute('aria-hidden', 'true')
    document.body.appendChild(sizeTip)
  }
  return sizeTip
}

function hideTip() {
  sizeTip?.remove()
  sizeTip = null
}

function imageFrame(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const frame = target.closest('[data-resize-container][data-node="image"]')
  return frame instanceof HTMLElement ? frame : null
}

function imagePosAtPoint(view: EditorView, x: number, y: number): number | null {
  const found = view.posAtCoords({ left: x, top: y })
  if (!found) return null
  const doc = view.state.doc
  const $pos = doc.resolve(Math.min(found.pos, doc.content.size))
  if ($pos.nodeAfter?.type.name === 'image') return $pos.pos
  if ($pos.nodeBefore?.type.name === 'image') return $pos.pos - $pos.nodeBefore.nodeSize
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'image') return $pos.before(depth)
  }
  return null
}

function imagePosFromDOM(view: EditorView, dom: HTMLElement): number | null {
  const rect = dom.getBoundingClientRect()
  const fromPoint =
    imagePosAtPoint(view, rect.left + rect.width / 2, rect.top + Math.min(16, rect.height / 2)) ||
    imagePosAtPoint(view, rect.left + 8, rect.top + 8)
  if (fromPoint != null) return fromPoint
  let found: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (found != null) return false
    if (node.type.name !== 'image') return true
    const el = view.nodeDOM(pos)
    if (el instanceof Element && (el === dom || el.contains(dom) || dom.contains(el))) {
      found = pos
      return false
    }
    return false
  })
  return found
}

function placeLine(kind: RteImageDropKind, rect: DOMRect) {
  const line = ensureLine()
  const preview = ensurePreview()
  if (kind === 'left' || kind === 'right') {
    const x = kind === 'left' ? rect.left : rect.right
    line.style.left = `${x - 2}px`
    line.style.top = `${rect.top}px`
    line.style.width = '4px'
    line.style.height = `${Math.max(12, rect.height)}px`
    const width = Math.max(36, Math.min(120, rect.width * 0.34))
    preview.style.left = `${kind === 'left' ? rect.left : rect.right - width}px`
    preview.style.top = `${rect.top}px`
    preview.style.width = `${width}px`
    preview.style.height = `${Math.max(12, rect.height)}px`
    return
  }
  const y = kind === 'before' ? rect.top : rect.bottom
  line.style.left = `${rect.left}px`
  line.style.top = `${y - 2}px`
  line.style.width = `${Math.max(24, rect.width)}px`
  line.style.height = '4px'
  preview.style.left = `${rect.left}px`
  preview.style.top = `${y - 10}px`
  preview.style.width = `${Math.max(24, rect.width)}px`
  preview.style.height = '18px'
}

function blockBoundary(view: EditorView, pos: number, bias: 'before' | 'after'): number {
  const doc = view.state.doc
  const safe = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(safe)
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const parent = $pos.node(depth - 1)
    if (parent.type.name !== 'doc' && !containerCanHoldImage(parent.type.name)) continue
    const start = $pos.before(depth)
    const child = $pos.node(depth)
    return bias === 'before' ? start : start + child.nodeSize
  }
  if (doc.childCount === 0) return 0
  const index = $pos.index(0)
  if (index >= doc.childCount) return doc.content.size
  let start = 0
  for (let i = 0; i < index; i += 1) start += doc.child(i).nodeSize
  const child = doc.child(index)
  return bias === 'before' ? start : start + child.nodeSize
}

function moveImage(view: EditorView, from: number, insertAt: number): boolean {
  const { state } = view
  const node = state.doc.nodeAt(from)
  if (!node || node.type.name !== 'image') return false
  if (sameImageDrop(from, insertAt, node.nodeSize)) return false
  const $from = state.doc.resolve(from)
  const parent = $from.parent
  const onlyChild = parent.type.name === 'column' && parent.childCount === 1
  let tr = state.tr.delete(from, from + node.nodeSize)
  if (onlyChild && state.schema.nodes.paragraph) {
    const hole = tr.mapping.map(from, -1)
    tr = tr.insert(hole, state.schema.nodes.paragraph.create())
  }
  let dest = tr.mapping.map(insertAt, -1)
  if (dest < 0) dest = 0
  if (dest > tr.doc.content.size) dest = tr.doc.content.size
  tr = tr.insert(dest, node)
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, dest)).scrollIntoView()
  } catch {
    tr = tr.scrollIntoView()
  }
  try {
    tr.doc.check()
    view.dispatch(tr)
    view.focus()
    return true
  } catch {
    return false
  }
}

function nudgeImage(view: EditorView, dir: -1 | 1): boolean {
  const sel = view.state.selection
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return false
  const $pos = sel.$from
  const parent = $pos.parent
  const index = $pos.index()
  const starts: number[] = []
  const sizes: number[] = []
  let cursor = 0
  if (parent.type.name !== 'doc') {
    try {
      cursor = $pos.start()
    } catch {
      cursor = 0
    }
  }
  parent.forEach((child) => {
    starts.push(cursor)
    sizes.push(child.nodeSize)
    cursor += child.nodeSize
  })
  if (parent.type.name === 'imageGroup') {
    const next = index + dir
    const groupPos = $pos.before($pos.depth)
    if (next >= 0 && next < parent.childCount) {
      return reorderInGroup(view, groupPos, index, next, dir < 0 ? 'left' : 'right')
    }
    const dest = dir < 0 ? groupPos : groupPos + parent.nodeSize
    return extractOrMoveImage(view, sel.from, dest)
  }
  const sibling = siblingInsertPos(starts, sizes, index, dir)
  if (sibling != null) return moveImage(view, sel.from, sibling)
  if ($pos.depth < 1) return false
  const hostDepth = $pos.depth >= 2 ? $pos.depth - 1 : $pos.depth
  const host = $pos.node(hostDepth)
  const start = $pos.before(hostDepth)
  const dest = dir < 0 ? start : start + host.nodeSize
  return moveImage(view, sel.from, dest)
}

function readDrop(view: EditorView, event: { clientX: number; clientY: number }): {
  kind: RteImageDropKind
  imagePos: number | null
  boundary: number
  rect: DOMRect
} | null {
  const stack = document.elementsFromPoint(event.clientX, event.clientY)
  const frames = stack
    .map((el) => el.closest('[data-resize-container][data-node="image"]'))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
  const frame =
    frames.find((el) => Number(el.dataset.rtePos) !== dragFrom) || frames[0] || null
  if (frame instanceof HTMLElement) {
    const rect = frame.getBoundingClientRect()
    const xRatio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5
    const yRatio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5
    const kind = imageDropKind(xRatio, yRatio, true)
    const rawPos = frame.dataset.rtePos
    const stamped = rawPos ? Number(rawPos) : NaN
    let imagePos = Number.isInteger(stamped) ? stamped : imagePosFromDOM(view, frame)
    if (imagePos == null) {
      let found: number | null = null
      view.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image') return true
        const el = view.nodeDOM(pos)
        if (!(el instanceof HTMLElement)) return false
        const r = el.getBoundingClientRect()
        if (Math.abs(r.left - rect.left) < 4 && Math.abs(r.top - rect.top) < 4) found = pos
        return false
      })
      imagePos = found
    }
    return {
      kind,
      imagePos,
      boundary: imagePos ?? 0,
      rect,
    }
  }
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!coords) return null
  const kind = imageDropKind(0.5, event.clientY, false)
  const bias = kind === 'before' ? 'before' : 'after'
  const boundary = blockBoundary(view, coords.pos, bias)
  const prose = view.dom.getBoundingClientRect()
  const y = kind === 'before' ? event.clientY : event.clientY
  const rect = new DOMRect(prose.left + 24, y, Math.max(40, prose.width - 48), 0)
  return { kind, imagePos: null, boundary, rect }
}

function dropInsertPos(
  view: EditorView,
  plan: { kind: RteImageDropKind; imagePos: number | null; boundary: number },
): number {
  if (plan.imagePos == null) return plan.boundary
  const $pos = view.state.doc.resolve(plan.imagePos)
  if ($pos.parent.type.name === 'imageGroup') {
    const groupPos = $pos.before($pos.depth)
    if (plan.kind === 'left' || plan.kind === 'before') return groupPos
    return groupPos + $pos.parent.nodeSize
  }
  const node = view.state.doc.nodeAt(plan.imagePos)
  const size = node?.nodeSize || 0
  if (plan.kind === 'left' || plan.kind === 'before') return plan.imagePos
  return plan.imagePos + size
}

function visualKind(dragKind: 'image' | 'group', kind: RteImageDropKind): RteImageDropKind {
  if (dragKind === 'group' && (kind === 'left' || kind === 'right')) return kind === 'left' ? 'before' : 'after'
  return kind
}

function commitDrop(
  view: EditorView,
  event: { clientX: number; clientY: number },
  from: number,
  dragKind: 'image' | 'group' = 'image',
) {
  const plan = readDrop(view, event)
  if (!plan) return
  if (dragKind === 'group') {
    moveImageGroup(view, from, dropInsertPos(view, plan))
    return
  }
  if ((plan.kind === 'left' || plan.kind === 'right') && plan.imagePos != null) {
    placeBeside(view, from, plan.imagePos, plan.kind)
    return
  }
  extractOrMoveImage(view, from, dropInsertPos(view, plan))
}

let resizingFrame: HTMLElement | null = null

function showResizeTip() {
  const frame =
    resizingFrame ||
    document.querySelector('[data-resize-container][data-node="image"][data-resize-state="true"]')
  if (!(frame instanceof HTMLElement)) {
    hideTip()
    return
  }
  const img = frame.querySelector('img')
  const box = img instanceof HTMLElement ? img : frame
  const tip = ensureTip()
  tip.textContent = `${box.clientWidth} × ${box.clientHeight}`
  tip.style.cssText =
    'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:100000;background:#111;color:#fff;padding:8px 14px;font:600 16px/1.3 sans-serif;border-radius:8px;pointer-events:none;'
}

export function createImageDragPlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      const stamp = () => {
        editorView.state.doc.descendants((node, pos) => {
          if (node.type.name !== 'image') return true
          const el = editorView.nodeDOM(pos)
          if (el instanceof HTMLElement) {
            el.dataset.rtePos = String(pos)
            const box = el.closest('[data-resize-container]')
            if (box instanceof HTMLElement) box.dataset.rtePos = String(pos)
          }
          return false
        })
      }
      stamp()
      const sizeTimer = window.setInterval(() => {
        document.querySelectorAll('[data-resize-container][data-node="image"]').forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          const existing = node.querySelector('.rte-live-size')
          let badge: HTMLElement
          if (existing instanceof HTMLElement) badge = existing
          else {
            badge = document.createElement('div')
            badge.className = 'rte-live-size'
            badge.style.cssText =
              'position:absolute;left:8px;top:8px;z-index:5;background:#111;color:#fff;font:600 13px/1.2 sans-serif;padding:4px 8px;border-radius:6px;pointer-events:none;'
            node.appendChild(badge)
          }
          const sizing = node.dataset.resizeState === 'true'
          badge.hidden = !sizing
          if (!sizing) return
          const img = node.querySelector('img')
          const box = img instanceof HTMLElement ? img : node
          badge.textContent = `${box.clientWidth} × ${box.clientHeight}`
        })
      }, 80)
      const onDragOver = (event: DragEvent) => {
        if (dragFrom == null || !editorView.editable || pointerDrag) return
        event.preventDefault()
        const plan = readDrop(editorView, event)
        if (plan) placeLine(visualKind(dragKind, plan.kind), plan.rect)
      }
      const onDrop = (event: DragEvent) => {
        if (dragFrom == null || !editorView.editable || pointerDrag) return
        event.preventDefault()
        event.stopPropagation()
        const from = dragFrom
        const kind = dragKind
        dragFrom = null
        hideLine()
        commitDrop(editorView, event, from, kind)
      }
      const onPointerMove = (event: PointerEvent) => {
        if (!pointerDrag || pointerDrag.view !== editorView || !editorView.editable) return
        const dx = event.clientX - pointerDrag.startX
        const dy = event.clientY - pointerDrag.startY
        if (!pointerDrag.moved && Math.hypot(dx, dy) < 6) return
        pointerDrag.moved = true
        event.preventDefault()
        dragFrom = pointerDrag.from
        dragKind = pointerDrag.kind
        const plan = readDrop(editorView, event)
        if (plan) placeLine(visualKind(pointerDrag.kind, plan.kind), plan.rect)
      }
      const onPointerUp = (event: PointerEvent) => {
        if (!pointerDrag || pointerDrag.view !== editorView) return
        const current = pointerDrag
        pointerDrag = null
        dragFrom = null
        hideLine()
        if (!current.moved || !editorView.editable) return
        commitDrop(editorView, event, current.from, current.kind)
      }
      const armResize = (event: Event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const handle = target.closest('[data-resize-handle]')
        const frame = target.closest('[data-resize-container][data-node="image"]')
        resizingFrame = handle && frame instanceof HTMLElement ? frame : null
      }
      const onMove = (event: MouseEvent) => {
        if (pointerDrag?.view === editorView) onPointerMove(event as PointerEvent)
        const live = document.querySelector('[data-resize-container][data-resize-state="true"]')
        if (live instanceof HTMLElement) resizingFrame = live
        if (!resizingFrame) return
        showResizeTip()
      }
      const onUp = (event: MouseEvent) => {
        if (pointerDrag?.view === editorView) onPointerUp(event as PointerEvent)
        resizingFrame = null
        hideTip()
      }
      const onPointerDown = (event: PointerEvent) => {
        if (!editorView.editable || event.button !== 0) return
        if (!(event.target instanceof Node) || !editorView.dom.contains(event.target)) return
        if (!(event.target instanceof Element)) return
        if (event.target.closest('[data-resize-handle], .rte-image-group-bar, .rte-image-group-divider')) return
        const frame = imageFrame(event.target)
        if (!frame) return
        const rawPos = frame.dataset.rtePos
        const stamped = rawPos ? Number(rawPos) : NaN
        const pos = Number.isInteger(stamped) ? stamped : imagePosFromDOM(editorView, frame)
        if (pos == null) return
        frame.draggable = false
        const image = frame.querySelector('img')
        if (image) image.draggable = false
        armImageDrag(editorView, pos, 'image', event)
        event.preventDefault()
      }
      const onMouseDown = (event: MouseEvent) => {
        armResize(event)
        if (!pointerDrag) onPointerDown(event as PointerEvent)
      }
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('mousedown', onMouseDown, true)
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('drop', onDrop, true)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      return {
        update: stamp,
        destroy() {
          window.clearInterval(sizeTimer)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('mousedown', onMouseDown, true)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          document.removeEventListener('dragover', onDragOver, true)
          document.removeEventListener('drop', onDrop, true)
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', onPointerUp)
          resizingFrame = null
          hideTip()
          hideLine()
        },
      }
    },
    props: {
      handleKeyDown(view, event) {
        if (!view.editable) return false
        if (!event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return false
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          return nudgeImage(view, -1)
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          return nudgeImage(view, 1)
        }
        if (
          (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
          view.state.selection instanceof NodeSelection &&
          view.state.selection.node.type.name === 'image' &&
          view.state.selection.$from.parent.type.name === 'imageGroup'
        ) {
          event.preventDefault()
          return nudgeImage(view, event.key === 'ArrowLeft' ? -1 : 1)
        }
        return false
      },
      handleDOMEvents: {
        mousedown(_view, event) {
          const frame = imageFrame(event.target)
          if (!frame) return false
          frame.draggable = false
          return false
        },
        pointerdown(view, event) {
          if (!view.editable || event.button !== 0) return false
          const target = event.target
          if (!(target instanceof Element)) return false
          if (target.closest('[data-resize-handle], .rte-image-group-bar, .rte-image-group-divider')) return false
          const frame = imageFrame(target)
          if (!frame) return false
          const rawPos = frame.dataset.rtePos
          const stamped = rawPos ? Number(rawPos) : NaN
          const pos = Number.isInteger(stamped) ? stamped : imagePosFromDOM(view, frame)
          if (pos == null) return false
          armImageDrag(view, pos, 'image', event)
          return false
        },
        dragstart(_view, event) {
          event.preventDefault()
          return true
        },
        dragover(view, event) {
          if (dragFrom == null) return false
          if (!view.editable) {
            event.preventDefault()
            return true
          }
          event.preventDefault()
          const plan = readDrop(view, event)
          if (plan) placeLine(visualKind(dragKind, plan.kind), plan.rect)
          return true
        },
        drop(view, event) {
          if (dragFrom == null || pointerDrag) return false
          event.preventDefault()
          const from = dragFrom
          const kind = dragKind
          dragFrom = null
          hideLine()
          if (!view.editable) return true
          commitDrop(view, event, from, kind)
          return true
        },
        dragend() {
          dragFrom = null
          hideLine()
          return false
        },
        pointerup() {
          hideTip()
          return false
        },
      },
    },
  })
}
