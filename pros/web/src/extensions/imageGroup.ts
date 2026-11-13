import { Node, mergeAttributes } from '@tiptap/core'
import { ElMessageBox } from 'element-plus'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { normalizeImageAlign } from '../utils/rteImageLayout'
import {
  groupCssVars,
  groupUsesAspect,
  IMAGE_GROUP_GAP_DEFAULT,
  installImageGroupLayout,
  nextGroupGap,
  normalizeGroupFit,
  normalizeGroupGap,
  normalizeGroupLayout,
  resizeCollageColumn,
  resizeCollageStack,
  normalizeGroupRatios,
  ratioPercents,
  resizePair,
  rowLayout,
} from '../utils/rteImageGroup'
import {
  buildImageGroupMigration,
  clearGroupRatios,
  setGroupAlign,
  setGroupGap,
  setGroupLayout,
  setGroupRatios,
  splitImageGroup,
} from './imageGroupOps'
import { armImageDrag } from './rteImageDrag'
import { dispatchSuggestionDecision } from '../utils/rteSuggestions'

function groupPosFromDom(view: EditorView, dom: Element | null): number | null {
  if (!(dom instanceof HTMLElement)) return null
  let found: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (found != null) return false
    if (node.type.name !== 'imageGroup') return true
    if (view.nodeDOM(pos) === dom) found = pos
    return false
  })
  if (found != null) return found
  const stamped = Number(dom.dataset.rtePos)
  if (Number.isInteger(stamped) && stamped > 0 && view.state.doc.nodeAt(stamped)?.type.name === 'imageGroup') return stamped
  return null
}

function ensureImageGroupStyle() {
  installImageGroupLayout()
}

function imageAspect(frame: HTMLElement): number {
  const img = frame.querySelector('img')
  if (img instanceof HTMLImageElement && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return img.naturalWidth / img.naturalHeight
  }
  return 1
}

/** 用当前行宽和比例重算行高，清掉图片节点上残留的固定宽高。 */
function applyGroupGap(dom: HTMLElement, gap: number) {
  if (gap === IMAGE_GROUP_GAP_DEFAULT) {
    dom.style.removeProperty('--rte-group-gap')
    dom.removeAttribute('data-gap')
    return
  }
  dom.style.setProperty('--rte-group-gap', `${gap}px`)
  dom.setAttribute('data-gap', String(gap))
}

const COLLAGE_AREAS = {
  '12': ['1 / 1 / 3 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3'],
  '21': ['1 / 1 / 2 / 2', '2 / 1 / 3 / 2', '1 / 2 / 3 / 3'],
} as const

/** 12：左通高、右上下两张。21：左上下两张、右通高。 */
function imageFit(img: HTMLImageElement, groupFit: 'cover' | 'contain'): 'cover' | 'contain' {
  const own = img.getAttribute('data-fit')
  if (own === 'cover' || own === 'contain') return own
  if (img.getAttribute('data-crop-aspect')) return 'cover'
  const zoom = Number(img.getAttribute('data-crop-zoom'))
  if (Number.isFinite(zoom) && zoom > 1) return 'cover'
  return groupFit
}

function paintCropFrame(img: HTMLImageElement, fit: 'cover' | 'contain') {
  img.style.setProperty('object-fit', imageFit(img, fit), 'important')
  const focusX = Number(img.getAttribute('data-crop-focus-x'))
  const focusY = Number(img.getAttribute('data-crop-focus-y'))
  if (img.hasAttribute('data-crop-aspect') && Number.isFinite(focusX) && Number.isFinite(focusY)) {
    img.style.setProperty('object-position', `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`, 'important')
  }
  const zoom = Number(img.getAttribute('data-crop-zoom'))
  if (Number.isFinite(zoom) && zoom > 1) img.style.setProperty('transform', `scale(${zoom})`, 'important')
}

function paintCollage(
  row: HTMLElement,
  layout: '12' | '21',
  fit: 'cover' | 'contain' = 'cover',
  columns = 'minmax(0, 1fr) minmax(0, 1fr)',
  rows = 'minmax(0, 1fr) minmax(0, 1fr)',
) {
  row.style.display = 'grid'
  row.style.gridTemplateColumns = columns
  row.style.gridTemplateRows = rows
  row.style.aspectRatio = '2 / 1'
  row.style.height = 'auto'
  row.style.minHeight = '160px'
  const areas = COLLAGE_AREAS[layout]
  let imageIndex = -1
  Array.from(row.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return
    if (child.classList.contains('ProseMirror-widget')) {
      const area = areas[imageIndex]
      if (!area) return
      child.style.gridArea = area
      child.style.alignSelf = 'end'
      child.style.zIndex = '2'
      child.style.margin = '0'
      return
    }
    imageIndex += 1
    const frame = child
    frame.style.gridArea = areas[imageIndex] || ''
    frame.style.flex = 'none'
    frame.style.width = '100%'
    frame.style.height = '100%'
    frame.style.margin = '0'
    frame.style.maxHeight = '100%'
    const img = frame.querySelector('img')
    if (img instanceof HTMLImageElement) {
      img.style.setProperty('width', '100%', 'important')
      img.style.setProperty('height', '100%', 'important')
      paintCropFrame(img, fit)
      img.style.setProperty('max-width', 'none', 'important')
    }
  })
}

function stackSideOf(value: unknown): 'left' | 'center' | 'right' {
  return value === 'center' || value === 'right' ? value : 'left'
}

function paintMix(
  row: HTMLElement,
  stackAt: number,
  fit: 'cover' | 'contain',
  side: 'left' | 'center' | 'right' = 'left',
  split = 0.5,
) {
  const frames = Array.from(row.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains('rte-image-caption-inline'),
  )
  const concealed = (frame: HTMLElement | undefined) => frame?.querySelector('img')?.getAttribute('data-concealed') === '1'
  const stackVisible = !concealed(frames[stackAt]) && !concealed(frames[stackAt + 1])
  const visibleCount = frames.filter((frame) => !concealed(frame)).length
  const columns = Math.max(1, stackVisible ? visibleCount - 1 : visibleCount)
  row.style.display = 'grid'
  row.style.flexDirection = 'row'
  row.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`
  const share = Number.isFinite(split) ? Math.min(0.8, Math.max(0.2, split)) : 0.5
  row.style.gridTemplateRows = `minmax(0, ${share}fr) minmax(0, ${1 - share}fr)`
  row.style.aspectRatio = `${columns} / 1`
  row.style.height = 'auto'
  row.style.minHeight = '160px'
  const stackColumn = side === 'right' ? columns : side === 'center' ? Math.ceil(columns / 2) : 1
  let singleColumn = 1
  frames.forEach((frame, index) => {
    if (concealed(frame)) {
      frame.style.display = 'none'
      return
    }
    frame.style.display = ''
    frame.style.flex = 'none'
    frame.style.width = '100%'
    frame.style.height = '100%'
    frame.style.margin = '0'
    if (index === stackAt || index === stackAt + 1) {
      const rowStart = index === stackAt ? 1 : 2
      frame.style.gridArea = `${rowStart} / ${stackColumn} / ${rowStart + 1} / ${stackColumn + 1}`
    } else {
      if (singleColumn === stackColumn) singleColumn += 1
      frame.style.gridArea = `1 / ${singleColumn} / 3 / ${singleColumn + 1}`
      singleColumn += 1
    }
    const img = frame.querySelector('img')
    if (img instanceof HTMLImageElement) paintCropFrame(img, fit)
  })
}

function paintRows(row: HTMLElement) {
  row.style.display = 'flex'
  row.style.flexDirection = 'column'
  row.style.gridTemplateColumns = ''
  row.style.gridTemplateRows = ''
  row.style.aspectRatio = ''
  row.style.height = 'auto'
  row.style.minHeight = '0'
  Array.from(row.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.classList.contains('ProseMirror-widget')) return
    child.style.gridArea = ''
    child.style.flex = 'none'
    child.style.width = '100%'
    child.style.height = 'auto'
    const img = child.querySelector('img')
    if (img instanceof HTMLImageElement) paintCropFrame(img, 'contain')
  })
}

function clearCollage(row: HTMLElement) {
  row.style.display = 'flex'
  row.style.flexDirection = 'row'
  row.style.gridTemplateColumns = ''
  row.style.gridTemplateRows = ''
  row.style.aspectRatio = ''
  row.style.minHeight = '0'
  for (const child of Array.from(row.children)) {
    if (!(child instanceof HTMLElement)) continue
    child.style.gridArea = ''
    child.style.alignSelf = ''
    child.style.zIndex = ''
    if (child.classList.contains('ProseMirror-widget')) child.style.margin = ''
  }
}

function paintGroupMetrics(dom: HTMLElement, row: HTMLElement, ratios: readonly number[], gap: number) {
  const width = row.clientWidth || dom.clientWidth
  if (width < 8) return
  const sum = ratios.reduce((total, n) => total + (Number.isFinite(n) && n > 0 ? n : 0), 0) || 1
  dom.style.setProperty('--rte-row-aspect', String(Math.round(sum * 1000) / 1000))
  ratios.forEach((grow, index) => dom.style.setProperty(`--g${index}`, String(grow)))
  applyGroupGap(dom, gap)
  const laid = rowLayout(width, ratios, gap)
  row.style.height = `${laid.height}px`
  row.style.minHeight = '0'
  const kids = Array.from(row.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
  kids.forEach((frame) => {
    frame.style.margin = '0'
    frame.style.float = 'none'
    frame.style.maxHeight = '100%'
    const wrap = frame.querySelector('[data-resize-wrapper]')
    if (wrap instanceof HTMLElement) {
      wrap.style.width = '100%'
      wrap.style.height = '100%'
      wrap.style.maxWidth = '100%'
    }
    const img = frame.querySelector('img')
    if (img instanceof HTMLImageElement) {
      img.style.setProperty('width', '100%', 'important')
      img.style.setProperty('height', '100%', 'important')
      paintCropFrame(img, 'contain')
      img.style.setProperty('max-width', 'none', 'important')
    }
  })
}

function paintCollageDividers(
  view: EditorView,
  dom: HTMLElement,
  row: HTMLElement,
  dividers: HTMLElement,
  kids: HTMLElement[],
  pos: number,
  layout: '12' | '21',
  weights: number[],
) {
  if (dom.dataset.ratioDrag === '1') return
  dividers.replaceChildren()
  const domRect = dom.getBoundingClientRect()
  const columnPair = layout === '12' ? [0, 1] : [1, 2]
  const stackPair = layout === '12' ? [1, 2] : [0, 1]
  const place = (a: number, b: number, axis: 'column' | 'stack') => {
    const left = kids[a]!.getBoundingClientRect()
    const right = kids[b]!.getBoundingClientRect()
    if (left.width < 4 || right.width < 4) return
    const handle = document.createElement('button')
    handle.type = 'button'
    handle.className = 'rte-image-group-divider'
    handle.dataset.groupPos = String(pos)
    handle.title = axis === 'column' ? '拖动调整左右列宽' : '拖动调整上下高度'
    handle.setAttribute('aria-label', handle.title)
    const mark = document.createElement('i')
    mark.setAttribute('aria-hidden', 'true')
    handle.appendChild(mark)
    if (axis === 'column') {
      const x = (left.right + right.left) / 2 - domRect.left
      handle.style.cssText = `position:absolute;left:${x}px;top:${Math.min(left.top, right.top) - domRect.top}px;height:${Math.max(left.height, right.height)}px;width:16px;transform:translateX(-50%);border:0;padding:0;background:transparent;cursor:col-resize;pointer-events:auto;z-index:20;`
    } else {
      const y = (left.bottom + right.top) / 2 - domRect.top
      handle.style.cssText = `position:absolute;left:${left.left - domRect.left}px;top:${y}px;width:${Math.max(left.width, right.width)}px;height:16px;transform:translateY(-50%);border:0;padding:0;background:transparent;cursor:row-resize;pointer-events:auto;z-index:20;`
    }
    handle.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const groupPos = Number(handle.dataset.groupPos)
      if (view.state.doc.nodeAt(groupPos)?.type.name === 'imageGroup') clearGroupRatios(view, groupPos)
    })
    handle.addEventListener('pointerdown', (event) => {
      if (!view.editable || event.button !== 0 || event.detail >= 2) return
      event.preventDefault()
      event.stopPropagation()
      const groupPos = Number(handle.dataset.groupPos)
      if (view.state.doc.nodeAt(groupPos)?.type.name !== 'imageGroup') return
      dom.dataset.ratioDrag = '1'
      const origin = axis === 'column' ? left.left : left.top
      const span = axis === 'column' ? right.right - left.left : right.bottom - left.top
      const move = (ev: PointerEvent) => {
        const share = span ? ((axis === 'column' ? ev.clientX : ev.clientY) - origin) / span : 0.5
        const next = axis === 'column' ? resizeCollageColumn(weights, layout, share) : resizeCollageStack(weights, layout, share)
        const columns =
          layout === '12'
            ? `minmax(0, ${next[0]}fr) minmax(0, ${next[1]! + next[2]!}fr)`
            : `minmax(0, ${next[0]! + next[1]!}fr) minmax(0, ${next[2]}fr)`
        const rows =
          layout === '12'
            ? `minmax(0, ${next[1]}fr) minmax(0, ${next[2]}fr)`
            : `minmax(0, ${next[0]}fr) minmax(0, ${next[1]}fr)`
        row.style.gridTemplateColumns = columns
        row.style.gridTemplateRows = rows
        handle.dataset.next = next.join(':')
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        delete dom.dataset.ratioDrag
        const next = (handle.dataset.next || '').split(':').map(Number)
        if (next.length === 3 && next.every((n) => n > 0)) setGroupRatios(view, groupPos, next)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
    dividers.appendChild(handle)
  }
  place(columnPair[0]!, columnPair[1]!, 'column')
  place(stackPair[0]!, stackPair[1]!, 'stack')
}

export function layoutImageGroupChrome(view: EditorView) {
  const selection = view.state.selection
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'imageGroup') return true
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return false
    dom.dataset.rtePos = String(pos)
    dom.classList.toggle('is-selected', selection.from >= pos && selection.to <= pos + node.nodeSize)
    const row = dom.querySelector('.rte-image-group-row')
    const dividers = dom.querySelector('.rte-image-group-dividers')
    if (!(row instanceof HTMLElement) || !(dividers instanceof HTMLElement)) return false
    const kids = Array.from(row.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains('ProseMirror-widget'),
    )
    kids.forEach((kid) => {
      const hidden = kid.querySelector('img')?.getAttribute('data-concealed') === '1'
      kid.style.display = hidden ? 'none' : ''
    })
    const visible = kids.filter((kid) => kid.style.display !== 'none')
    const laidKids = visible.length ? visible : kids
    const aspects = laidKids.map(imageAspect)
    const ratios = visible.length && visible.length < kids.length
      ? normalizeGroupRatios(laidKids.length, null)
      : groupUsesAspect(node.attrs.ratioMode)
        ? aspects
        : normalizeGroupRatios(laidKids.length, node.attrs.ratios)
    const gap = normalizeGroupGap(node.attrs.gap)
    const layout = normalizeGroupLayout(node.attrs.layout)
    const signature = `${layout}:${Math.round(row.clientWidth)}:${laidKids.length}:${node.attrs.fit || ''}:${node.attrs.ratios || ''}:${node.attrs.stackAt ?? ''}:${node.attrs.stackSide || ''}:${node.attrs.stackSplit ?? ''}:${node.attrs.layoutBefore || ''}`
    if (row.clientWidth > 8 && dom.dataset.rteSig === signature && dom.dataset.ratioDrag !== '1') return false
    dom.dataset.rteSig = signature
    if (layout === 'row') dom.removeAttribute('data-layout')
    else dom.setAttribute('data-layout', layout)
    if (node.attrs.layoutBefore) dom.setAttribute('data-layout-before', String(node.attrs.layoutBefore))
    else dom.removeAttribute('data-layout-before')
    if ((layout === '12' || layout === '21') && kids.length === 3) {
      applyGroupGap(dom, gap)
      const fit = normalizeGroupFit(node.attrs.fit)
      if (fit === 'contain') dom.setAttribute('data-fit', 'contain')
      else dom.removeAttribute('data-fit')
      const weights = normalizeGroupRatios(3, groupUsesAspect(node.attrs.ratioMode) ? aspects : node.attrs.ratios)
      const columns =
        layout === '12'
          ? `minmax(0, ${weights[0]}fr) minmax(0, ${weights[1]! + weights[2]!}fr)`
          : `minmax(0, ${weights[0]! + weights[1]!}fr) minmax(0, ${weights[2]}fr)`
      const stack =
        layout === '12'
          ? `minmax(0, ${weights[1]}fr) minmax(0, ${weights[2]}fr)`
          : `minmax(0, ${weights[0]}fr) minmax(0, ${weights[1]}fr)`
      if (dom.dataset.ratioDrag !== '1') paintCollage(row, layout, fit, columns, stack)
      paintCollageDividers(view, dom, row, dividers, kids, pos, layout, weights)
      return false
    }
    if (layout === 'mix' && kids.length >= 4) {
      applyGroupGap(dom, gap)
      dom.setAttribute('data-layout', 'mix')
      const stackAt = Number(node.attrs.stackAt)
      const fit = normalizeGroupFit(node.attrs.fit)
      if (fit === 'contain') dom.setAttribute('data-fit', 'contain')
      else dom.removeAttribute('data-fit')
      if (Number.isInteger(stackAt) && dom.dataset.ratioDrag !== '1') {
        paintMix(row, stackAt, fit, stackSideOf(node.attrs.stackSide), Number(node.attrs.stackSplit) || 0.5)
      }
      dividers.replaceChildren()
      return false
    }
    if (layout === 'rows' && kids.length === 2) {
      applyGroupGap(dom, gap)
      dom.setAttribute('data-layout', 'rows')
      if (dom.dataset.ratioDrag !== '1') paintRows(row)
      dividers.replaceChildren()
      return false
    }
    clearCollage(row)
    if (dom.dataset.ratioDrag !== '1') paintGroupMetrics(dom, row, ratios, gap)
    if (!dom.dataset.rteObserved && typeof ResizeObserver !== 'undefined') {
      dom.dataset.rteObserved = '1'
      const ro = new ResizeObserver(() => {
        const next = Math.round(row.clientWidth)
        if (!next || dom.dataset.rteLaidW === String(next) || dom.dataset.ratioDrag === '1') return
        layoutImageGroupChrome(view)
      })
      ro.observe(row)
    }
    dom.dataset.rteLaidW = String(Math.round(row.clientWidth || 0))
    kids.forEach((frame) => {
      const img = frame.querySelector('img')
      if (!(img instanceof HTMLImageElement) || img.dataset.rteAspectWait === '1' || img.naturalWidth > 0) return
      img.dataset.rteAspectWait = '1'
      img.addEventListener('load', () => layoutImageGroupChrome(view), { once: true })
    })
    if (dom.dataset.ratioDrag === '1') return false
    dividers.replaceChildren()
    const domRect = dom.getBoundingClientRect()
    for (let index = 0; index < kids.length - 1; index += 1) {
      const left = kids[index]!.getBoundingClientRect()
      const right = kids[index + 1]!.getBoundingClientRect()
      const handle = document.createElement('button')
      handle.type = 'button'
      handle.className = 'rte-image-group-divider'
      handle.dataset.index = String(index)
      handle.dataset.groupPos = String(pos)
      handle.setAttribute('aria-label', '调整图片宽度比例')
      handle.title = '拖动调整两侧宽度'
      const mark = document.createElement('i')
      mark.setAttribute('aria-hidden', 'true')
      handle.appendChild(mark)
      const x = (left.right + right.left) / 2 - domRect.left
      handle.style.cssText = `position:absolute;left:${x}px;top:${left.top - domRect.top}px;height:${Math.max(left.height, right.height)}px;width:16px;transform:translateX(-50%);border:0;padding:0;background:transparent;cursor:col-resize;pointer-events:auto;z-index:20;`
      handle.addEventListener('pointerdown', (event) => {
        if (!view.editable || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        try {
          handle.setPointerCapture(event.pointerId)
        } catch {
          /* 合成指针 */
        }
        const stamped = Number(handle.dataset.groupPos)
        const groupPos =
          Number.isInteger(stamped) && view.state.doc.nodeAt(stamped)?.type.name === 'imageGroup'
            ? stamped
            : groupPosFromDom(view, dom)
        if (groupPos == null) return
        if (event.detail >= 2) {
          clearGroupRatios(view, groupPos)
          return
        }
        const pairLeft = left.left
        const pairWidth = right.right - left.left
        const current = view.state.doc.nodeAt(groupPos)
        const gap = normalizeGroupGap(current?.attrs.gap)
        const base = groupUsesAspect(current?.attrs.ratioMode)
          ? kids.map(imageAspect)
          : normalizeGroupRatios(kids.length, current?.attrs.ratios)
        dom.dataset.ratioDrag = '1'
        handle.classList.add('is-active')
        const tip = document.createElement('div')
        tip.className = 'rte-image-size-tip'
        document.body.appendChild(tip)
        const originX = event.clientX
        let moved = false
        const move = (ev: PointerEvent) => {
          if (Math.abs(ev.clientX - originX) > 3) moved = true
          const share = pairWidth ? (ev.clientX - pairLeft) / pairWidth : 0.5
          const next = resizePair(base, index, share)
          dom.style.setProperty(`--g${index}`, String(next[index]))
          dom.style.setProperty(`--g${index + 1}`, String(next[index + 1]))
          paintGroupMetrics(dom, row, next, gap)
          const percents = ratioPercents(next)
          tip.textContent = next.map((_, i) => `${percents[i]}%`).join(' · ')
          tip.style.left = `${ev.clientX}px`
          tip.style.top = `${ev.clientY - 36}px`
          const mid = kids[index]!.getBoundingClientRect().right
          const nextLeft = kids[index + 1]!.getBoundingClientRect().left
          handle.style.left = `${(mid + nextLeft) / 2 - dom.getBoundingClientRect().left}px`
        }
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          tip.remove()
          handle.classList.remove('is-active')
          delete dom.dataset.ratioDrag
          if (!moved || ev.detail >= 2) return
          const share = pairWidth ? (ev.clientX - pairLeft) / pairWidth : 0.5
          const next = resizePair(base, index, share)
          const latest = groupPosFromDom(view, dom)
          const at = latest ?? groupPos
          if (view.state.doc.nodeAt(at)?.type.name === 'imageGroup') setGroupRatios(view, at, next)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      })
      handle.addEventListener('dblclick', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const stamped = Number(handle.dataset.groupPos)
        const groupPos =
          Number.isInteger(stamped) && view.state.doc.nodeAt(stamped)?.type.name === 'imageGroup'
            ? stamped
            : groupPosFromDom(view, dom)
        if (groupPos != null) clearGroupRatios(view, groupPos)
      })
      dividers.appendChild(handle)
    }
    return false
  })
}

export const ImageGroup = Node.create({
  name: 'imageGroup',
  group: 'block',
  content: 'image+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      align: {
        default: 'center',
        parseHTML: (element: HTMLElement) => normalizeImageAlign(element.getAttribute('data-align')),
        renderHTML: (attrs: { align?: string }) => ({
          'data-align': normalizeImageAlign(attrs.align),
        }),
      },
      ratios: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-ratios') || null,
        renderHTML: (attrs: { ratios?: string | null }) => {
          if (!attrs.ratios) return {}
          return { 'data-ratios': String(attrs.ratios) }
        },
      },
      ratioMode: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => (element.getAttribute('data-ratio-mode') === 'custom' ? 'custom' : null),
        renderHTML: (attrs: { ratioMode?: string | null }) =>
          attrs.ratioMode === 'custom' ? { 'data-ratio-mode': 'custom' } : {},
      },
      gap: {
        default: IMAGE_GROUP_GAP_DEFAULT,
        parseHTML: (element: HTMLElement) => normalizeGroupGap(element.getAttribute('data-gap')),
        renderHTML: (attrs: { gap?: number | string | null }) => {
          const gap = normalizeGroupGap(attrs.gap)
          if (gap === IMAGE_GROUP_GAP_DEFAULT) return {}
          return { 'data-gap': String(gap) }
        },
      },
      fit: {
        default: 'cover',
        parseHTML: (element: HTMLElement) => normalizeGroupFit(element.getAttribute('data-fit')),
        renderHTML: (attrs: { fit?: string | null }) =>
          normalizeGroupFit(attrs.fit) === 'contain' ? { 'data-fit': 'contain' } : {},
      },
      stackSide: {
        default: 'left',
        parseHTML: (element: HTMLElement) => stackSideOf(element.getAttribute('data-stack-side')),
        renderHTML: (attrs: { stackSide?: string | null }) =>
          stackSideOf(attrs.stackSide) === 'left' ? {} : { 'data-stack-side': stackSideOf(attrs.stackSide) },
      },
      stackSplit: {
        default: 0.5,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute('data-stack-split'))
          return Number.isFinite(value) ? Math.min(0.8, Math.max(0.2, value)) : 0.5
        },
        renderHTML: (attrs: { stackSplit?: number | null }) => {
          const value = Number(attrs.stackSplit)
          if (!Number.isFinite(value) || Math.abs(value - 0.5) < 0.001) return {}
          return { 'data-stack-split': String(value) }
        },
      },
      stackAt: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute('data-stack-at'))
          return Number.isInteger(value) && value >= 0 ? value : null
        },
        renderHTML: (attrs: { stackAt?: number | null }) =>
          attrs.stackAt == null ? {} : { 'data-stack-at': String(attrs.stackAt) },
      },
      layoutBefore: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-layout-before')
          return value ? normalizeGroupLayout(value) : null
        },
        renderHTML: (attrs: { layoutBefore?: string | null }) =>
          attrs.layoutBefore ? { 'data-layout-before': normalizeGroupLayout(attrs.layoutBefore) } : {},
      },
      layout: {
        default: 'row',
        parseHTML: (element: HTMLElement) => normalizeGroupLayout(element.getAttribute('data-layout')),
        renderHTML: (attrs: { layout?: string | null }) => {
          const layout = normalizeGroupLayout(attrs.layout)
          if (layout === 'row') return {}
          return { 'data-layout': layout }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-group"]',
        contentElement: (node: HTMLElement) =>
          (node.querySelector(':scope > .rte-image-group-row') as HTMLElement | null) || node,
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'image-group',
        class: 'rte-image-group',
        style: groupCssVars(node.childCount, node.attrs.ratios, node.attrs.gap),
      }),
      ['div', { class: 'rte-image-group-row' }, 0],
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      const dom = document.createElement('div')
      dom.className = 'rte-image-group'
      dom.setAttribute('data-type', 'image-group')
      dom.setAttribute('data-align', normalizeImageAlign(node.attrs.align))
      if (node.attrs.ratios) dom.setAttribute('data-ratios', String(node.attrs.ratios))

      const bar = document.createElement('div')
      bar.className = 'rte-image-group-bar'
      bar.setAttribute('contenteditable', 'false')

      const icon = (path: string) =>
        `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`
      const addIconButton = (className: string, label: string, path: string) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = className
        button.innerHTML = icon(path)
        button.setAttribute('aria-label', label)
        button.title = label
        return button
      }

      const handle = addIconButton('rte-image-group-handle', '按住拖动整组图片', 'M4 2h2v2H4zm6 0h2v2h-2zM4 7h2v2H4zm6 0h2v2h-2zM4 12h2v2H4zm6 0h2v2h-2z')
      handle.addEventListener('pointerdown', (event) => {
        const pos = getPos()
        if (typeof pos !== 'number' || event.button !== 0) return
        event.stopPropagation()
        armImageDrag(editor.view, pos, 'group', event)
      })
      handle.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return
        const pos = getPos()
        if (typeof pos !== 'number') return
        armImageDrag(editor.view, pos, 'group', event as PointerEvent)
      })
      bar.appendChild(handle)

      const alignIcons = {
        left: 'M2 3h12v2H2zm0 4h8v2H2zm0 4h10v2H2z',
        center: 'M2 3h12v2H2zm2 4h8v2H4zm1 4h6v2H5z',
        right: 'M2 3h12v2H2zm4 4h8v2H6zm2 4h6v2H8z',
      } as const
      for (const align of ['left', 'center', 'right'] as const) {
        const label = align === 'left' ? '整组图片靠左' : align === 'center' ? '整组图片居中' : '整组图片靠右'
        const button = addIconButton('rte-image-group-align', label, alignIcons[align])
        button.dataset.align = align
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const pos = getPos()
          if (typeof pos !== 'number') return
          setGroupAlign(editor.view, pos, align)
        })
        bar.appendChild(button)
      }

      const gapBtn = document.createElement('button')
      gapBtn.type = 'button'
      gapBtn.className = 'rte-image-group-gap'
      gapBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        const live = editor.state.doc.nodeAt(pos)
        if (!live) return
        setGroupGap(editor.view, pos, nextGroupGap(live.attrs.gap))
      })
      bar.appendChild(gapBtn)

      const fitBtn = document.createElement('button')
      fitBtn.type = 'button'
      fitBtn.className = 'rte-image-group-fit'
      fitBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        const live = editor.state.doc.nodeAt(pos)
        if (!live) return
        const next = normalizeGroupFit(live.attrs.fit) === 'contain' ? 'cover' : 'contain'
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, { ...live.attrs, fit: next }),
        )
      })
      bar.appendChild(fitBtn)

      for (const side of ['left', 'center', 'right'] as const) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'rte-image-group-side'
        button.textContent = side === 'left' ? '叠左' : side === 'center' ? '叠中' : '叠右'
        button.title = side === 'left' ? '两张叠在最左一列' : side === 'center' ? '两张叠在中间一列' : '两张叠在最右一列'
        button.setAttribute('aria-label', button.title)
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const pos = getPos()
          if (typeof pos !== 'number') return
          const live = editor.state.doc.nodeAt(pos)
          if (!live) return
          editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...live.attrs, stackSide: side }))
        })
        bar.appendChild(button)
      }

      const hideBtn = document.createElement('button')
      hideBtn.type = 'button'
      hideBtn.className = 'rte-image-group-hide'
      hideBtn.textContent = '藏起'
      hideBtn.title = '藏起最后一张可见图片，剩下的比例重算'
      hideBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        const live = editor.state.doc.nodeAt(pos)
        if (!live) return
        let target = -1
        let cursor = pos + 1
        const hidden: number[] = []
        live.forEach((child) => {
          if (child.type.name === 'image') {
            if (child.attrs.concealed) hidden.push(cursor)
            else target = cursor
          }
          cursor += child.nodeSize
        })
        let tr = editor.view.state.tr
        if (target < 0) {
          for (let index = hidden.length - 1; index >= 0; index -= 1) {
            const at = hidden[index]!
            const image = tr.doc.nodeAt(at)
            if (image) tr = tr.setNodeMarkup(at, undefined, { ...image.attrs, concealed: false })
          }
        } else {
          const image = tr.doc.nodeAt(target)
          if (image) tr = tr.setNodeMarkup(target, undefined, { ...image.attrs, concealed: true })
        }
        if (tr.docChanged) editor.view.dispatch(tr)
      })
      bar.appendChild(hideBtn)

      const grip = document.createElement('div')
      grip.className = 'rte-stack-grip'
      grip.setAttribute('contenteditable', 'false')
      grip.title = '拖动叠放高度'
      dom.appendChild(grip)
      grip.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        const live = editor.state.doc.nodeAt(pos)
        if (!live || normalizeGroupLayout(live.attrs.layout) !== 'mix') return
        const startY = event.clientY
        const start = Number(live.attrs.stackSplit) || 0.5
        const height = contentDOM.getBoundingClientRect().height || 160
        dom.dataset.ratioDrag = '1'
        const shareOf = (clientY: number) =>
          Math.round(Math.min(0.8, Math.max(0.2, start + (clientY - startY) / height)) * 100) / 100
        const move = (ev: PointerEvent) => {
          const share = shareOf(ev.clientY)
          contentDOM.style.gridTemplateRows = `minmax(0, ${share}fr) minmax(0, ${1 - share}fr)`
        }
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          delete dom.dataset.ratioDrag
          const now = editor.state.doc.nodeAt(pos)
          if (!now) return
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { ...now.attrs, stackSplit: shareOf(ev.clientY) }),
          )
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      })

      for (const layout of ['row', '12', '21', 'rows'] as const) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'rte-image-group-layout'
        button.dataset.layout = layout
        button.textContent = layout === 'row' ? '横排' : layout === 'rows' ? '上下' : layout
        button.title = layout === 'row' ? '所有图片排成一行' : layout === '12' ? '左边一张，右边上下两张' : layout === '21' ? '左边上下两张，右边一张' : '图片分成上下两行'
        button.setAttribute('aria-label', button.title)
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const pos = getPos()
          if (typeof pos !== 'number') return
          setGroupLayout(editor.view, pos, layout)
        })
        bar.appendChild(button)
      }

      const split = addIconButton('rte-image-group-split', '拆成一张一张的图片，不再成组', 'M2 3h5v10H2zm7 0h5v10H9z')
      split.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        splitImageGroup(editor.view, pos)
      })
      bar.appendChild(split)
      dom.appendChild(bar)

      const contentDOM = document.createElement('div')
      contentDOM.className = 'rte-image-group-row'
      contentDOM.style.cssText = 'display:flex;flex-direction:row;align-items:stretch;gap:var(--rte-group-gap, 8px);width:100%;max-width:100%;box-sizing:border-box;'
      dom.appendChild(contentDOM)
      ensureImageGroupStyle()

      const dividers = document.createElement('div')
      dividers.className = 'rte-image-group-dividers'
      dividers.setAttribute('contenteditable', 'false')
      dividers.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;'
      dom.style.position = 'relative'
      dom.appendChild(dividers)

      const paint = () => {
        dom.setAttribute('data-align', normalizeImageAlign(current.attrs.align))
        if (current.attrs.ratios) dom.setAttribute('data-ratios', String(current.attrs.ratios))
        else dom.removeAttribute('data-ratios')
        if (current.attrs.ratioMode === 'custom') dom.setAttribute('data-ratio-mode', 'custom')
        else dom.removeAttribute('data-ratio-mode')
        const gap = normalizeGroupGap(current.attrs.gap)
        applyGroupGap(dom, gap)
        const layout = normalizeGroupLayout(current.attrs.layout)
        const fit = normalizeGroupFit(current.attrs.fit)
        if (fit === 'contain') dom.setAttribute('data-fit', 'contain')
        else dom.removeAttribute('data-fit')
        fitBtn.textContent = fit === 'contain' ? '完整' : '充满'
        fitBtn.title = fit === 'contain' ? '完整显示图片，点击改为充满裁切' : '充满格子并裁切，点击改为完整显示'
        let missingAlt = 0
        current.forEach((child) => {
          if (child.type.name === 'image' && !String(child.attrs.alt || '').trim()) missingAlt += 1
        })
        let altBtn = bar.querySelector('.rte-image-group-alt') as HTMLButtonElement | null
        if (missingAlt) {
          if (!altBtn) {
            altBtn = document.createElement('button')
            altBtn.type = 'button'
            altBtn.className = 'rte-image-group-alt'
            altBtn.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              const pos = getPos()
              if (typeof pos !== 'number') return
              const live = editor.state.doc.nodeAt(pos)
              if (!live) return
              const missing: number[] = []
              let cursor = pos + 1
              live.forEach((child) => {
                if (child.type.name === 'image' && !String(child.attrs.alt || '').trim()) missing.push(cursor)
                cursor += child.nodeSize
              })
              if (!missing.length) return
              const previous = Number(altBtn?.dataset.cursor || '-1')
              const next = missing.find((item) => item > previous) ?? missing[0]!
              if (altBtn) altBtn.dataset.cursor = String(next)
              editor.chain().focus().setNodeSelection(next).run()
            })
            bar.appendChild(altBtn)
          }
          altBtn.textContent = `缺${missingAlt}`
          altBtn.title = '有图片还没有替代文本，点击逐张跳转'
          altBtn.setAttribute('aria-label', altBtn.title)
          let fillBtn = bar.querySelector('.rte-image-group-fill') as HTMLButtonElement | null
          if (!fillBtn) {
            fillBtn = document.createElement('button')
            fillBtn.type = 'button'
            fillBtn.className = 'rte-image-group-fill'
            fillBtn.textContent = '补'
            fillBtn.title = '给缺替代文本的图片写同一句说明'
            fillBtn.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              const pos = getPos()
              if (typeof pos !== 'number') return
              void ElMessageBox.prompt('给还没有替代文本的图片写同一句说明', '补替代文本', {
                inputValue: '图片',
                confirmButtonText: '写入',
                cancelButtonText: '取消',
              })
                .then(({ value }) => {
                  const text = String(value || '').trim()
                  const live = editor.state.doc.nodeAt(pos)
                  if (!text || !live || live.type.name !== 'imageGroup') return
                  let tr = editor.state.tr
                  let cursor = pos + 1
                  const jobs: number[] = []
                  live.forEach((child) => {
                    if (child.type.name === 'image' && !String(child.attrs.alt || '').trim()) jobs.push(cursor)
                    cursor += child.nodeSize
                  })
                  for (let i = jobs.length - 1; i >= 0; i -= 1) {
                    const at = jobs[i]!
                    const image = tr.doc.nodeAt(at)
                    if (!image) continue
                    tr = tr.setNodeMarkup(at, undefined, { ...image.attrs, alt: text })
                  }
                  if (tr.docChanged) editor.view.dispatch(tr)
                })
                .catch(() => undefined)
            })
            bar.appendChild(fillBtn)
          }
        } else {
          bar.querySelector('.rte-image-group-fill')?.remove()
          altBtn?.remove()
        }
        if (layout === '12' || layout === '21') {
          dom.setAttribute('data-layout', layout)
          paintCollage(contentDOM, layout, fit)
        } else if (layout === 'rows') {
          dom.setAttribute('data-layout', layout)
          paintRows(contentDOM)
        } else if (layout === 'mix') {
          dom.setAttribute('data-layout', layout)
          const stackAt = Number(current.attrs.stackAt)
          if (Number.isInteger(stackAt)) {
            paintMix(contentDOM, stackAt, fit, stackSideOf(current.attrs.stackSide), Number(current.attrs.stackSplit) || 0.5)
          }
        } else {
          dom.removeAttribute('data-layout')
          clearCollage(contentDOM)
        }
        if (current.attrs.layoutBefore) dom.setAttribute('data-layout-before', String(current.attrs.layoutBefore))
        else dom.removeAttribute('data-layout-before')
        let revision = bar.querySelector('.rte-image-group-revision')
        if (current.attrs.layoutBefore) {
          if (!revision) {
            revision = document.createElement('span')
            revision.className = 'rte-image-group-revision'
            bar.appendChild(revision)
          }
          revision.textContent = `修订 ${normalizeGroupLayout(current.attrs.layoutBefore)}→${layout}`
          let accept = bar.querySelector('.rte-image-group-accept') as HTMLButtonElement | null
          let reject = bar.querySelector('.rte-image-group-reject') as HTMLButtonElement | null
          if (!accept) {
            accept = document.createElement('button')
            accept.type = 'button'
            accept.className = 'rte-image-group-accept'
            accept.textContent = '接受'
            accept.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              const pos = getPos()
              if (typeof pos === 'number') dispatchSuggestionDecision(editor, 'accept', `lay_${pos}`)
            })
            bar.appendChild(accept)
          }
          if (!reject) {
            reject = document.createElement('button')
            reject.type = 'button'
            reject.className = 'rte-image-group-reject'
            reject.textContent = '拒绝'
            reject.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              const pos = getPos()
              if (typeof pos === 'number') dispatchSuggestionDecision(editor, 'reject', `lay_${pos}`)
            })
            bar.appendChild(reject)
          }
        } else {
          revision?.remove()
          bar.querySelector('.rte-image-group-accept')?.remove()
          bar.querySelector('.rte-image-group-reject')?.remove()
        }
        gapBtn.textContent = `${gap}`
        gapBtn.title = `组内间距 ${gap} 像素，点击在 0、8、16、24 之间切换`
        gapBtn.setAttribute('aria-label', gapBtn.title)
        bar.querySelectorAll<HTMLButtonElement>('.rte-image-group-align').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.align === normalizeImageAlign(current.attrs.align))
          button.setAttribute('aria-pressed', button.classList.contains('is-active') ? 'true' : 'false')
        })
        bar.querySelectorAll<HTMLButtonElement>('.rte-image-group-layout').forEach((button) => {
          const want = button.dataset.layout
          const active = normalizeGroupLayout(current.attrs.layout) === want
          button.classList.toggle('is-active', active)
          button.setAttribute('aria-pressed', active ? 'true' : 'false')
          button.disabled =
            ((want === '12' || want === '21') && current.childCount !== 3) ||
            (want === 'rows' && current.childCount !== 2)
        })
      }
      paint()

      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type.name !== 'imageGroup') return false
          current = next
          paint()
          return true
        },
        stopEvent(event) {
          const target = event.target
          return target instanceof Element && !!target.closest('.rte-image-group-bar, .rte-image-group-dividers')
        },
        ignoreMutation(mutation) {
          if (mutation.type === 'attributes') return true
          const target = mutation.target
          return target instanceof Element && !!target.closest('.rte-image-group-bar, .rte-image-group-dividers')
        },
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (transactions.some((tr) => tr.getMeta('imageGroupMigrate'))) return null
          return buildImageGroupMigration(state)
        },
        view(editorView) {
          const paint = () => layoutImageGroupChrome(editorView)
          const frame = window.requestAnimationFrame(paint)
          return {
            update: paint,
            destroy() {
              window.cancelAnimationFrame(frame)
            },
          }
        },
      }),
    ]
  },
})
