import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { normalizeImageAlign } from '../utils/rteImageLayout'
import { groupCssVars, groupUsesAspect, installImageGroupLayout, normalizeGroupRatios, ratioPercents, resizePair, rowLayout } from '../utils/rteImageGroup'
import {
  buildImageGroupMigration,
  clearGroupRatios,
  setGroupAlign,
  setGroupRatios,
  splitImageGroup,
} from './imageGroupOps'
import { armImageDrag } from './rteImageDrag'

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
function paintGroupMetrics(dom: HTMLElement, row: HTMLElement, ratios: readonly number[]) {
  const width = row.clientWidth || dom.clientWidth
  if (width < 8) return
  const sum = ratios.reduce((total, n) => total + (Number.isFinite(n) && n > 0 ? n : 0), 0) || 1
  dom.style.setProperty('--rte-row-aspect', String(Math.round(sum * 1000) / 1000))
  ratios.forEach((grow, index) => dom.style.setProperty(`--g${index}`, String(grow)))
  const laid = rowLayout(width, ratios, 8)
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
      img.style.setProperty('object-fit', 'contain', 'important')
      img.style.setProperty('max-width', 'none', 'important')
    }
  })
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
    const kids = Array.from(row.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    const aspects = kids.map(imageAspect)
    const ratios = groupUsesAspect(node.attrs.ratioMode)
      ? aspects
      : normalizeGroupRatios(kids.length, node.attrs.ratios)
    if (dom.dataset.ratioDrag !== '1') paintGroupMetrics(dom, row, ratios)
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
          paintGroupMetrics(dom, row, next)
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
        style: groupCssVars(node.childCount, node.attrs.ratios),
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

      const handle = addIconButton('rte-image-group-handle', '拖动图片组', 'M4 2h2v2H4zm6 0h2v2h-2zM4 7h2v2H4zm6 0h2v2h-2zM4 12h2v2H4zm6 0h2v2h-2z')
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
        const label = align === 'left' ? '居左' : align === 'center' ? '居中' : '居右'
        const button = addIconButton('rte-image-group-align', `图片组${label}`, alignIcons[align])
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

      const split = addIconButton('rte-image-group-split', '拆分为单图', 'M2 3h5v10H2zm7 0h5v10H9z')
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
      contentDOM.style.cssText = 'display:flex;flex-direction:row;align-items:stretch;gap:8px;width:100%;max-width:100%;box-sizing:border-box;'
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
        bar.querySelectorAll<HTMLButtonElement>('.rte-image-group-align').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.align === normalizeImageAlign(current.attrs.align))
          button.setAttribute('aria-pressed', button.classList.contains('is-active') ? 'true' : 'false')
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
