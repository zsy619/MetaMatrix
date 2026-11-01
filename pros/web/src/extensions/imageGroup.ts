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
  const stamped = Number(dom.dataset.rtePos)
  if (Number.isInteger(stamped) && view.state.doc.nodeAt(stamped)?.type.name === 'imageGroup') return stamped
  let found: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (found != null) return false
    if (node.type.name !== 'imageGroup') return true
    const el = view.nodeDOM(pos)
    if (el === dom) found = pos
    return false
  })
  return found
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
    if (dom.dataset.ratioDrag !== '1') {
      ratios.forEach((grow, index) => dom.style.setProperty(`--g${index}`, String(grow)))
      const laid = rowLayout(row.clientWidth || dom.clientWidth, ratios, 8)
      row.style.height = `${laid.height}px`
    }
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
      handle.setAttribute('aria-label', '调整图片宽度比例')
      handle.title = '拖动调整两侧宽度'
      const mark = document.createElement('i')
      mark.setAttribute('aria-hidden', 'true')
      handle.appendChild(mark)
      const x = (left.right + right.left) / 2 - domRect.left
      handle.style.cssText = `position:absolute;left:${x}px;top:${left.top - domRect.top}px;height:${Math.max(left.height, right.height)}px;width:16px;transform:translateX(-50%);border:0;padding:0;background:transparent;cursor:col-resize;pointer-events:auto;`
      handle.addEventListener('pointerdown', (event) => {
        if (!view.editable || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const groupPos = groupPosFromDom(view, dom)
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
        const move = (ev: PointerEvent) => {
          const share = pairWidth ? (ev.clientX - pairLeft) / pairWidth : 0.5
          const next = resizePair(base, index, share)
          dom.style.setProperty(`--g${index}`, String(next[index]))
          dom.style.setProperty(`--g${index + 1}`, String(next[index + 1]))
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
          const share = pairWidth ? (ev.clientX - pairLeft) / pairWidth : 0.5
          const next = resizePair(base, index, share)
          const latest = groupPosFromDom(view, dom)
          if (latest != null) setGroupRatios(view, latest, next)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
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
        // 取消 mousedown 才能阻止 Safari/Chrome 进入原生拖拽；不要取消 pointerdown。
        event.preventDefault()
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
      dividers.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;'
      dom.style.position = 'relative'
      dom.appendChild(dividers)

      const paint = () => {
        dom.setAttribute('data-align', normalizeImageAlign(current.attrs.align))
        if (current.attrs.ratios) dom.setAttribute('data-ratios', String(current.attrs.ratios))
        else dom.removeAttribute('data-ratios')
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
