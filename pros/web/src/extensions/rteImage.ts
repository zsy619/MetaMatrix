import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { createImageDragPlugin } from './rteImageDrag'
import { createImageCaptionPlugin } from './rteImageCaption'
import { normalizeImageAlign, normalizeImageLayout } from '../utils/rteImageLayout'
import { cropAttrsStyle } from '../utils/rteImageCropAttrs'

export type RteImageAlign = 'left' | 'center' | 'right' | null

/**
 * 图片增强：对齐（data-align）+ 题注（caption / title）。
 * 保留 TipTap 3 内置 resize NodeView。
 */
export const RteImage = Image.extend({
  name: 'image',
  // 关闭 ProseMirror 的原生节点拖拽。真实浏览器会把 draggable 容器变成 HTML5 drag，
  // dragstart 一旦开始就不再派发 pointermove；Playwright 的合成鼠标往往不会进入这条路径。
  draggable: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center' as RteImageAlign,
        parseHTML: (el: HTMLElement) => normalizeImageAlign(el.getAttribute('data-align')),
        renderHTML: (attrs: { align?: RteImageAlign }) => ({
          'data-align': normalizeImageAlign(attrs.align),
        }),
      },
      layout: {
        default: 'block',
        parseHTML: (el: HTMLElement) =>
          normalizeImageLayout(el.getAttribute('data-layout'), el.style?.float),
        renderHTML: (attrs: { layout?: string | null }) => ({
          'data-layout': normalizeImageLayout(attrs.layout),
        }),
      },
      qrMeta: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-qr') || null,
        renderHTML: (attrs: { qrMeta?: string | null }) => {
          const value = (attrs.qrMeta || '').trim()
          return value ? { 'data-qr': value } : {}
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const c =
            el.getAttribute('data-caption') ||
            el.getAttribute('title') ||
            ''
          return c.trim() ? c.trim() : null
        },
        renderHTML: (attrs: { caption?: string | null }) => {
          const c = (attrs.caption || '').trim()
          if (!c) return {}
          return { 'data-caption': c, title: c }
        },
      },
      displayWidth: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const w =
            el.getAttribute('data-display-width') ||
            (el.style?.width || '').trim() ||
            null
          return w || null
        },
        renderHTML: (attrs: { displayWidth?: string | null }) => {
          const w = (attrs.displayWidth || '').trim()
          if (!w) return {}
          return { 'data-display-width': w, style: `width: ${w}; height: auto; max-width: 100%` }
        },
      },
      borderRadius: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-radius') || (el.style?.borderRadius || '').trim() || null,
        renderHTML: (attrs: { borderRadius?: string | null }) => {
          const v = (attrs.borderRadius || '').trim()
          if (!v) return {}
          return { 'data-radius': v, style: `border-radius: ${v}` }
        },
      },
      boxShadow: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-shadow') || (el.style?.boxShadow || '').trim() || null,
        renderHTML: (attrs: { boxShadow?: string | null }) => {
          const v = (attrs.boxShadow || '').trim()
          if (!v) return {}
          return { 'data-shadow': v, style: `box-shadow: ${v}` }
        },
      },
      borderStyle: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-border') || null,
        renderHTML: (attrs: { borderStyle?: string | null }) => {
          const v = (attrs.borderStyle || '').trim()
          if (!v) return {}
          return { 'data-border': v, style: `border: ${v}` }
        },
      },
      cropAspect: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-crop-aspect') || null,
        renderHTML: (attrs: { cropAspect?: string | null }) => {
          const v = (attrs.cropAspect || '').trim()
          if (!v) return {}
          return { 'data-crop-aspect': v }
        },
      },
      cropFocusX: {
        default: null as number | null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-crop-focus-x')
          if (raw == null) return null
          const n = Number(raw)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs: { cropFocusX?: number | null }) => {
          if (attrs.cropFocusX == null) return {}
          return { 'data-crop-focus-x': String(attrs.cropFocusX) }
        },
      },
      cropFocusY: {
        default: null as number | null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-crop-focus-y')
          if (raw == null) return null
          const n = Number(raw)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs: { cropFocusY?: number | null }) => {
          if (attrs.cropFocusY == null) return {}
          return { 'data-crop-focus-y': String(attrs.cropFocusY) }
        },
      },
      cropZoom: {
        default: null as number | null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-crop-zoom')
          if (raw == null) return null
          const n = Number(raw)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs: { cropZoom?: number | null }) => {
          if (attrs.cropZoom == null) return {}
          return { 'data-crop-zoom': String(attrs.cropZoom) }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    // 裁剪效果落到 style 上：object-fit / object-position / scale。
    // 已有 style（宽度等）要保留，所以合并而不是覆盖。
    const crop = cropAttrsStyle(HTMLAttributes as Record<string, unknown>)
    const attrs = HTMLAttributes as Record<string, unknown>
    if (crop['object-fit']) {
      const prev = typeof attrs.style === 'string' ? attrs.style : ''
      attrs.style = [prev, `object-fit: ${crop['object-fit']}`].filter(Boolean).join('; ')
      if (crop['object-position']) attrs.style += `; object-position: ${crop['object-position']}`
      if (crop.transform) attrs.style += `; ${crop.transform}`
    }
    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)]
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() || []), createImageDragPlugin(), createImageCaptionPlugin()]
  },
})
