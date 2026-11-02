import { NodeSelection, Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  extractOrMoveImage,
  moveImageGroup,
  placeBeside,
  reorderInGroup,
  setGroupRatios,
} from './imageGroupOps'
import { installImageGroupLayout, nextImageSelection, rowCanAccept, IMAGE_ROW_LIMIT_TIP, type ImageSpot } from '../utils/rteImageGroup'
import {
  imageDropKind,
  sameImageDrop,
  siblingInsertPos,
  type RteImageDropKind,
} from '../utils/rteImageLayout'

let dragFrom: number | null = null
let dragKind: 'image' | 'group' = 'image'
let dropLine: HTMLElement | null = null
let dropPreview: HTMLElement | null = null
let dragThumb: HTMLElement | null = null
let sizeTip: HTMLElement | null = null

function ensureThumb(): HTMLElement {
  if (!dragThumb) {
    dragThumb = document.createElement('div')
    dragThumb.className = 'rte-image-drag-thumb'
    dragThumb.setAttribute('aria-hidden', 'true')
    document.body.appendChild(dragThumb)
  }
  return dragThumb
}

function hideThumb() {
  dragThumb?.remove()
  dragThumb = null
}

function showThumb(src: string, x: number, y: number) {
  if (!src) {
    hideThumb()
    return
  }
  const el = ensureThumb()
  el.style.backgroundImage = `url("${src.replace(/"/g, '')}")`
  el.style.left = `${x + 16}px`
  el.style.top = `${y + 16}px`
}

function sourceFrame(view: EditorView, pos: number): HTMLElement | null {
  const el = view.nodeDOM(pos)
  if (!(el instanceof HTMLElement)) return null
  const box = el.closest('[data-resize-container]')
  return box instanceof HTMLElement ? box : el
}

function setSourceGhost(view: EditorView, pos: number, on: boolean) {
  sourceFrame(view, pos)?.classList.toggle('rte-image-drag-source', on)
}

function autoScrollCanvas(view: EditorView, y: number) {
  const canvas = view.dom.closest('.rte-canvas')
  if (!(canvas instanceof HTMLElement)) return
  const rect = canvas.getBoundingClientRect()
  if (y < rect.top + 36) canvas.scrollTop -= 12
  else if (y > rect.bottom - 36) canvas.scrollTop += 12
}

function showLimitTip(x: number, y: number) {
  const tip = ensureTip()
  tip.textContent = IMAGE_ROW_LIMIT_TIP
  tip.style.left = `${x + 12}px`
  tip.style.top = `${y - 36}px`
}

type PointerDrag = {
  view: EditorView
  from: number
  kind: 'image' | 'group'
  startX: number
  startY: number
  moved: boolean
}

let pointerDrag: PointerDrag | null = null

function captureHost(event: PointerEvent, fallback: HTMLElement | null): HTMLElement | null {
  const current = event.currentTarget
  if (current instanceof HTMLElement && current !== document.documentElement && current !== document.body) return current
  return fallback
}

export function armImageDrag(
  view: EditorView,
  pos: number,
  kind: 'image' | 'group',
  event: PointerEvent,
  captureEl?: HTMLElement | null,
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
  const host = captureEl ?? captureHost(event, null)
  if (host) {
    host.draggable = false
    try {
      host.setPointerCapture(event.pointerId)
    } catch {
      /* 合成 pointerId 或未进 pointerdown 时不能 capture */
    }
  }
}

/** 缩放锚点、分隔条、气泡按钮不开始移动。图片本体和拖动手柄可以。 */
function imageDragSurface(target: Element): HTMLElement | 'group' | null {
  if (target.closest('[data-resize-handle], .rte-image-group-divider, .rte-bubble, .rte-toolbar')) return null
  if (target.closest('.rte-image-group-bar') && !target.closest('.rte-image-group-handle')) return null
  if (target.closest('.rte-image-group-handle')) return 'group'
  if (target.closest('button, a, input, textarea, label') && !target.closest('.rte-image-drag-handle')) return null
  return imageFrame(target)
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
  hideThumb()
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

function imageVisualRect(frame: HTMLElement): DOMRect {
  const img = frame.querySelector('img')
  if (img instanceof HTMLElement) {
    const rect = img.getBoundingClientRect()
    if (rect.width > 8 && rect.height > 8) return rect
  }
  return frame.getBoundingClientRect()
}

function placeLine(kind: RteImageDropKind, rect: DOMRect) {
  const line = ensureLine()
  const preview = ensurePreview()
  line.dataset.kind = kind
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
  const stack = document.elementsFromPoint(event.clientX, event.clientY).filter(
    (el) => !el.closest('.rte-bubble, .rte-toolbar, .rte-image-group-bar, .rte-image-drag-thumb'),
  )
  const frames = stack
    .map((el) => el.closest('[data-resize-container][data-node="image"]'))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
  const frame =
    frames.find((el) => Number(el.dataset.rtePos) !== dragFrom) || frames[0] || null
  if (frame instanceof HTMLElement) {
    const rect = imageVisualRect(frame)
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
  const $pos = view.state.doc.resolve(Math.min(coords.pos, view.state.doc.content.size))
  const depth = $pos.depth >= 1 ? 1 : 0
  const blockPos = depth ? $pos.before(depth) : 0
  const blockNode = depth ? $pos.node(depth) : view.state.doc
  const el = depth ? view.nodeDOM(blockPos) : view.dom
  const blockRect = el instanceof HTMLElement ? el.getBoundingClientRect() : view.dom.getBoundingClientRect()
  const yRatio = blockRect.height ? (event.clientY - blockRect.top) / blockRect.height : 1
  const kind = yRatio < 0.5 ? 'before' : 'after'
  const boundary = kind === 'before' ? blockPos : blockPos + blockNode.nodeSize
  const y = kind === 'before' ? blockRect.top : blockRect.bottom
  const rect = new DOMRect(blockRect.left, y, Math.max(40, blockRect.width), 0)
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

function rowCountAt(view: EditorView, imagePos: number): number {
  const $pos = view.state.doc.resolve(imagePos)
  if ($pos.parent.type.name === 'imageGroup') return $pos.parent.childCount
  return 1
}

function sameRow(view: EditorView, from: number, target: number): boolean {
  const $from = view.state.doc.resolve(from)
  const $target = view.state.doc.resolve(target)
  if ($from.parent.type.name !== 'imageGroup' || $target.parent.type.name !== 'imageGroup') return false
  return $from.before($from.depth) === $target.before($target.depth)
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
    const exceed = !sameRow(view, from, plan.imagePos) && !rowCanAccept(rowCountAt(view, plan.imagePos), 1)
    if (exceed) {
      showLimitTip(event.clientX, event.clientY)
      window.setTimeout(() => hideTip(), 1600)
      return
    }
    placeBeside(view, from, plan.imagePos, plan.kind)
    return
  }
  extractOrMoveImage(view, from, dropInsertPos(view, plan))
}

export function imageEdgeAtPoint(
  view: EditorView,
  x: number,
  y: number,
): { imagePos: number; side: 'left' | 'right' } | null {
  const stack = document.elementsFromPoint(x, y).filter(
    (el) => !el.closest('.rte-bubble, .rte-toolbar, .rte-image-group-bar'),
  )
  const hit = stack[0]
  const frame = hit instanceof Element ? hit.closest('[data-resize-container][data-node="image"]') : null
  if (!(frame instanceof HTMLElement)) return null
  const rect = imageVisualRect(frame)
  const xRatio = rect.width ? (x - rect.left) / rect.width : 0.5
  const yRatio = rect.height ? (y - rect.top) / rect.height : 0.5
  const kind = imageDropKind(xRatio, yRatio, true)
  if (kind !== 'left' && kind !== 'right') return null
  const pos = Number(frame.dataset.rtePos)
  if (!Number.isInteger(pos) || view.state.doc.nodeAt(pos)?.type.name !== 'image') return null
  return { imagePos: pos, side: kind }
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

function syncGroupResize(view: EditorView, event: Event) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('[data-resize-handle]')) return
  const group = target.closest('[data-type="image-group"]')
  if (!(group instanceof HTMLElement)) return
  const pos = Number(group.dataset.rtePos)
  if (!Number.isInteger(pos) || view.state.doc.nodeAt(pos)?.type.name !== 'imageGroup') return
  const kids = [...group.querySelectorAll('.rte-image-group-row > [data-resize-container]')]
  if (kids.length < 2) return
  const resized = kids.some((el) => {
    const wrap = el.querySelector('[data-resize-wrapper]')
    return wrap instanceof HTMLElement && wrap.style.width.trim() !== ''
  })
  if (!resized) return
  const widths = kids.map((el) => Math.max(1, el.getBoundingClientRect().width))
  setGroupRatios(view, pos, widths)
}

function imageSpots(view: EditorView): ImageSpot[] {
  const spots: ImageSpot[] = []
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true
    const $pos = view.state.doc.resolve(pos)
    const row = $pos.parent.type.name === 'imageGroup' ? $pos.before($pos.depth) : pos
    spots.push({ pos, row })
    return false
  })
  return spots
}

export function createImageDragPlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      installImageGroupLayout()
      const stamp = () => {
        editorView.state.doc.descendants((node, pos) => {
          if (node.type.name !== 'image') return true
          const el = editorView.nodeDOM(pos)
          if (el instanceof HTMLElement) {
            el.dataset.rtePos = String(pos)
            const box = el.closest('[data-resize-container]')
            const frame = box instanceof HTMLElement ? box : el
            frame.dataset.rtePos = String(pos)
            frame.draggable = false
            const image = frame.querySelector('img')
            if (image instanceof HTMLImageElement) {
              image.draggable = false
              image.setAttribute('draggable', 'false')
            }
            if (frame.querySelector(':scope > .rte-image-drag-handle')) return false
            const handle = document.createElement('button')
            handle.type = 'button'
            handle.className = 'rte-image-drag-handle'
            handle.textContent = '⠿'
            handle.tabIndex = -1
            handle.setAttribute('contenteditable', 'false')
            handle.setAttribute('aria-label', '拖动图片')
            handle.title = '拖动图片'
            frame.appendChild(handle)
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
        setSourceGhost(editorView, pointerDrag.from, true)
        const moving = editorView.state.doc.nodeAt(pointerDrag.from)
        const thumbSrc =
          pointerDrag.kind === 'image'
            ? String(moving?.attrs?.src || '')
            : String(moving?.firstChild?.attrs?.src || '')
        showThumb(thumbSrc, event.clientX, event.clientY)
        autoScrollCanvas(editorView, event.clientY)
        const plan = readDrop(editorView, event)
        if (plan) placeLine(visualKind(pointerDrag.kind, plan.kind), plan.rect)
      }
      const finishPointer = (event: PointerEvent, commit: boolean) => {
        if (!pointerDrag || pointerDrag.view !== editorView) return
        const current = pointerDrag
        pointerDrag = null
        dragFrom = null
        setSourceGhost(editorView, current.from, false)
        hideLine()
        clearDragging()
        if (!editorView.editable) return
        if (!current.moved || !commit) {
          const expected = current.kind === 'group' ? 'imageGroup' : 'image'
          if (editorView.state.doc.nodeAt(current.from)?.type.name === expected) {
            try {
              editorView.dispatch(
                editorView.state.tr.setSelection(NodeSelection.create(editorView.state.doc, current.from)),
              )
              editorView.focus()
            } catch {
              /* 位置已失效 */
            }
          }
          return
        }
        commitDrop(editorView, event, current.from, current.kind)
      }
      const onPointerUp = (event: PointerEvent) => {
        finishPointer(event, true)
      }
      const onPointerCancel = (event: PointerEvent) => {
        finishPointer(event, false)
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
        else syncGroupResize(editorView, event)
        resizingFrame = null
        hideTip()
      }
      const clearDragging = () => {
        editorView.dom.querySelectorAll('.rte-image-drag-handle.is-dragging').forEach((node) => {
          node.classList.remove('is-dragging')
        })
      }
      const releaseNativeDrag = (target: Element) => {
        const frame = imageFrame(target)
        const group = target.closest('[data-type="image-group"]')
        for (const el of [frame, group]) {
          if (!(el instanceof HTMLElement)) continue
          el.draggable = false
          el.querySelectorAll('img').forEach((img) => {
            img.draggable = false
          })
        }
      }
      const onPointerDown = (event: PointerEvent) => {
        if (!editorView.editable || event.button !== 0) return
        if (pointerDrag?.view === editorView) return
        if (!(event.target instanceof Element) || !editorView.dom.contains(event.target)) return
        const surface = imageDragSurface(event.target)
        if (!surface) return
        if (surface === 'group') {
          const group = event.target.closest('[data-type="image-group"]')
          if (!(group instanceof HTMLElement)) return
          const raw = group.dataset.rtePos
          const stamped = raw ? Number(raw) : NaN
          if (!Number.isInteger(stamped)) return
          const grip = event.target.closest('.rte-image-group-handle')
          armImageDrag(editorView, stamped, 'group', event, grip instanceof HTMLElement ? grip : group)
          return
        }
        const rawPos = surface.dataset.rtePos
        const stamped = rawPos ? Number(rawPos) : NaN
        const pos = Number.isInteger(stamped) ? stamped : imagePosFromDOM(editorView, surface)
        if (pos == null) return
        surface.draggable = false
        const image = surface.querySelector('img')
        if (image) image.draggable = false
        surface.querySelector('.rte-image-drag-handle')?.classList.add('is-dragging')
        const grip = event.target.closest('.rte-image-drag-handle')
        armImageDrag(editorView, pos, 'image', event, grip instanceof HTMLElement ? grip : surface)
      }
      const onMouseDown = (event: MouseEvent) => {
        armResize(event)
        if (event.button !== 0) return
        if (!(event.target instanceof Element) || !editorView.dom.contains(event.target)) return
        if (!imageDragSurface(event.target)) return
        // 必须取消 mousedown。真实 Chrome/Safari 会在 draggable 节点上发起 HTML5 拖拽，
        // 随后不再派发 pointermove；Playwright 的 mouse.move 经常不会进入原生拖拽。
        event.preventDefault()
        const target = event.target
        releaseNativeDrag(target)
        window.setTimeout(() => releaseNativeDrag(target), 0)
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
      window.addEventListener('pointercancel', onPointerCancel)
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
          window.removeEventListener('pointercancel', onPointerCancel)
          resizingFrame = null
          hideTip()
          hideLine()
        },
      }
    },
    props: {
      handleKeyDown(view, event) {
        if (!view.editable) return false
        const sel = view.state.selection
        const nodeKey = sel instanceof NodeSelection && (sel.node.type.name === 'image' || sel.node.type.name === 'imageGroup')
        if (
          nodeKey &&
          (event.key === 'Delete' || event.key === 'Backspace') &&
          !event.altKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey
        ) {
          event.preventDefault()
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
          return true
        }
        if (
          nodeKey &&
          !event.altKey &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          let current = -1
          if (sel instanceof NodeSelection && sel.node.type.name === 'image') current = sel.from
          else if (sel instanceof NodeSelection && sel.node.type.name === 'imageGroup') {
            current = imageSpots(view).find((spot) => spot.row === sel.from)?.pos ?? -1
          }
          const next = nextImageSelection(imageSpots(view), current, event.key)
          event.preventDefault()
          if (next == null) return true
          try {
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, next)).scrollIntoView())
          } catch {
            return true
          }
          return true
        }
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
        pointerdown(_view, event) {
          const target = event.target
          if (!(target instanceof Element)) return false
          // 只声明已处理，不 preventDefault。取消 pointerdown 会让 Safari 丢掉后续 pointermove。
          if (target.closest('.rte-image-drag-handle, .rte-image-group-handle, .rte-image-group-divider, [data-resize-container][data-node="image"] img')) {
            return true
          }
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
