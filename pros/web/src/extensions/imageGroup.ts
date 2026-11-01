import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { normalizeImageAlign } from '../utils/rteImageLayout'
import { normalizeGroupRatios, ratioPercents, resizePair } from '../utils/rteImageGroup'
import {
  buildImageGroupMigration,
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
  if (document.getElementById('rte-image-group-layout')) return
  const style = document.createElement('style')
  style.id = 'rte-image-group-layout'
  style.textContent = [
    '.rte-image-group-row > *{min-width:48px;height:100%;max-width:100%;float:none !important;margin:0 !important;}',
    '.rte-image-group-row > *:nth-child(1){flex:var(--g0,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(2){flex:var(--g1,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(3){flex:var(--g2,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(4){flex:var(--g3,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(5){flex:var(--g4,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(6){flex:var(--g5,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(7){flex:var(--g6,1) 1 0 !important;}',
    '.rte-image-group-row > *:nth-child(8){flex:var(--g7,1) 1 0 !important;}',
    '.rte-image-group-row img{width:100% !important;height:100% !important;object-fit:cover;max-width:100% !important;}',
    '.rte-image-group-row [data-resize-handle]{display:none !important;}',
    '.rte-root.mode-preview .rte-image-group-bar,.rte-root.mode-preview .rte-image-group-dividers,.rte-root.mode-source .rte-image-group-bar,.rte-root.mode-source .rte-image-group-dividers,.rte-root.rte-printing .rte-image-group-bar,.rte-root.rte-printing .rte-image-group-dividers{display:none !important;}',
  ].join('')
  document.head.appendChild(style)
}

export function layoutImageGroupChrome(view: EditorView) {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'imageGroup') return true
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return false
    dom.dataset.rtePos = String(pos)
    const row = dom.querySelector('.rte-image-group-row')
    const dividers = dom.querySelector('.rte-image-group-dividers')
    if (!(row instanceof HTMLElement) || !(dividers instanceof HTMLElement)) return false
    const ratios = normalizeGroupRatios(node.childCount, node.attrs.ratios)
    const kids = Array.from(row.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    if (dom.dataset.ratioDrag !== '1') {
      ratios.forEach((grow, index) => dom.style.setProperty(`--g${index}`, String(grow)))
    }
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
      const x = (left.right + right.left) / 2 - domRect.left
      handle.style.left = `${x}px`
      handle.addEventListener('pointerdown', (event) => {
        if (!view.editable || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const groupPos = groupPosFromDom(view, dom)
        if (groupPos == null) return
        const pairLeft = left.left
        const pairWidth = right.right - left.left
        const base = normalizeGroupRatios(node.childCount, view.state.doc.nodeAt(groupPos)?.attrs.ratios)
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
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-group"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'image-group',
        class: 'rte-image-group',
      }),
      0,
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

      const handle = document.createElement('button')
      handle.type = 'button'
      handle.className = 'rte-image-group-handle'
      handle.textContent = '⠿'
      handle.setAttribute('aria-label', '拖动图片组')
      handle.title = '拖动整组到其他段落之间'
      handle.addEventListener('pointerdown', (event) => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        armImageDrag(editor.view, pos, 'group', event)
      })
      bar.appendChild(handle)

      for (const align of ['left', 'center', 'right'] as const) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'rte-image-group-align'
        button.dataset.align = align
        button.textContent = align === 'left' ? '居左' : align === 'center' ? '居中' : '居右'
        button.setAttribute('aria-label', `图片组${button.textContent}`)
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const pos = getPos()
          if (typeof pos !== 'number') return
          setGroupAlign(editor.view, pos, align)
        })
        bar.appendChild(button)
      }

      const split = document.createElement('button')
      split.type = 'button'
      split.className = 'rte-image-group-split'
      split.textContent = '拆分为单图'
      split.setAttribute('aria-label', '拆分为单图')
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
      contentDOM.style.cssText =
        'display:flex;flex-direction:row;align-items:stretch;gap:10px;width:100%;max-width:100%;height:180px;box-sizing:border-box;'
      dom.appendChild(contentDOM)
      ensureImageGroupStyle()

      const dividers = document.createElement('div')
      dividers.className = 'rte-image-group-dividers'
      dividers.setAttribute('contenteditable', 'false')
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
