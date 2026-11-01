import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  containerCanHoldImage,
  imageDropKind,
  sameImageDrop,
  siblingInsertPos,
  type RteImageDropKind,
} from '../utils/rteImageLayout'

let dragFrom: number | null = null
let dropLine: HTMLElement | null = null
let sizeTip: HTMLElement | null = null

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
  if (kind === 'left' || kind === 'right') {
    const x = kind === 'left' ? rect.left : rect.right
    line.style.left = `${x - 1}px`
    line.style.top = `${rect.top}px`
    line.style.width = '3px'
    line.style.height = `${Math.max(12, rect.height)}px`
    return
  }
  const y = kind === 'before' ? rect.top : rect.bottom
  line.style.left = `${rect.left}px`
  line.style.top = `${y - 1}px`
  line.style.width = `${Math.max(24, rect.width)}px`
  line.style.height = '3px'
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

function pairImages(view: EditorView, from: number, target: number, side: 'left' | 'right'): boolean {
  const { state } = view
  const moving = state.doc.nodeAt(from)
  const host = state.doc.nodeAt(target)
  if (!moving || !host || host.type.name !== 'image' || moving.type.name !== 'image') return false
  if (from === target) return false
  const columnType = state.schema.nodes.column
  const columnsType = state.schema.nodes.columns
  if (!columnType || !columnsType) {
    const at = side === 'left' ? target : target + host.nodeSize
    return moveImage(view, from, at)
  }
  const left = side === 'left' ? moving : host
  const right = side === 'left' ? host : moving
  const columns = columnsType.create({ cols: 2 }, [
    columnType.create(null, left.copy(left.content)),
    columnType.create(null, right.copy(right.content)),
  ])
  const higher = Math.max(from, target)
  const lower = Math.min(from, target)
  const higherNode = state.doc.nodeAt(higher) as PMNode
  const lowerNode = state.doc.nodeAt(lower) as PMNode
  let tr = state.tr.delete(higher, higher + higherNode.nodeSize)
  const lowerMapped = tr.mapping.map(lower, -1)
  tr = tr.delete(lowerMapped, lowerMapped + lowerNode.nodeSize)
  let dest = tr.mapping.map(target, -1)
  if (dest < 0) dest = 0
  if (dest > tr.doc.content.size) dest = tr.doc.content.size
  tr = tr.insert(dest, columns)
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, dest)).scrollIntoView()
  } catch {
    tr = tr.scrollIntoView()
  }
  try {
    tr.doc.check()
  } catch {
    return moveImage(view, from, side === 'left' ? target : target + host.nodeSize)
  }
  view.dispatch(tr)
  view.focus()
  return true
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
  const sibling = siblingInsertPos(starts, sizes, index, dir)
  if (sibling != null) return moveImage(view, sel.from, sibling)
  if ($pos.depth < 1) return false
  const hostDepth = $pos.depth >= 2 ? $pos.depth - 1 : $pos.depth
  const host = $pos.node(hostDepth)
  const start = $pos.before(hostDepth)
  const dest = dir < 0 ? start : start + host.nodeSize
  return moveImage(view, sel.from, dest)
}

function readDrop(view: EditorView, event: DragEvent): {
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
    const stamped = Number(frame.dataset.rtePos)
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

function commitDrop(view: EditorView, event: DragEvent, from: number) {
  const plan = readDrop(view, event)
  if (!plan) return
  if ((plan.kind === 'left' || plan.kind === 'right') && plan.imagePos != null) {
    pairImages(view, from, plan.imagePos, plan.kind)
    return
  }
  const target =
    plan.imagePos != null
      ? plan.kind === 'before'
        ? plan.imagePos
        : plan.imagePos + (view.state.doc.nodeAt(plan.imagePos)?.nodeSize || 0)
      : plan.boundary
  moveImage(view, from, target)
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
        if (dragFrom == null || !editorView.editable) return
        event.preventDefault()
        const plan = readDrop(editorView, event)
        if (plan) placeLine(plan.kind, plan.rect)
      }
      const onDrop = (event: DragEvent) => {
        if (dragFrom == null || !editorView.editable) return
        event.preventDefault()
        event.stopPropagation()
        const from = dragFrom
        dragFrom = null
        hideLine()
        commitDrop(editorView, event, from)
      }
      const armResize = (event: Event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const handle = target.closest('[data-resize-handle]')
        const frame = target.closest('[data-resize-container][data-node="image"]')
        resizingFrame = handle && frame instanceof HTMLElement ? frame : null
      }
      const onMove = (_event: MouseEvent) => {
        const live = document.querySelector('[data-resize-container][data-resize-state="true"]')
        if (live instanceof HTMLElement) resizingFrame = live
        if (!resizingFrame) return
        showResizeTip()
      }
      const onUp = () => {
        resizingFrame = null
        hideTip()
      }
      document.addEventListener('mousedown', armResize, true)
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('drop', onDrop, true)
      return {
        update: stamp,
        destroy() {
          window.clearInterval(sizeTimer)
          document.removeEventListener('mousedown', armResize, true)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          document.removeEventListener('dragover', onDragOver, true)
          document.removeEventListener('drop', onDrop, true)
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
        return false
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const frame = imageFrame(event.target)
          if (!frame) return false
          const onHandle = event.target instanceof Element && !!event.target.closest('[data-resize-handle]')
          frame.draggable = view.editable && !onHandle
          return false
        },
        dragstart(view, event) {
          const frame = imageFrame(event.target)
          if (!frame) return false
          if (!view.editable || event.target instanceof Element && event.target.closest('[data-resize-handle]')) {
            if (!view.editable) event.preventDefault()
            return !view.editable
          }
          const stamped = Number(frame.dataset.rtePos)
          const pos = Number.isInteger(stamped) ? stamped : imagePosFromDOM(view, frame)
          if (pos == null) return false
          dragFrom = pos
          event.dataTransfer?.setData('text/plain', 'rte-image')
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
          return false
        },
        dragover(view, event) {
          if (dragFrom == null) return false
          if (!view.editable) {
            event.preventDefault()
            return true
          }
          event.preventDefault()
          const plan = readDrop(view, event)
          if (plan) placeLine(plan.kind, plan.rect)
          return true
        },
        drop(view, event) {
          if (dragFrom == null) return false
          event.preventDefault()
          const from = dragFrom
          dragFrom = null
          hideLine()
          if (!view.editable) return true
          commitDrop(view, event, from)
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
