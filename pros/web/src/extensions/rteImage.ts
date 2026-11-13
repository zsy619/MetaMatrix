import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { createImageDragPlugin } from './rteImageDrag'
import { createImageCaptionPlugin } from './rteImageCaption'
import { createCaptionRenumberPlugin } from '../utils/rteCaptionNumber'
import { normalizeImageAlign, normalizeImageLayout } from '../utils/rteImageLayout'
import { cropHtmlStyle } from '../utils/rteImageCropAttrs'

export type RteImageAlign = 'left' | 'center' | 'right' | null

/** 裁剪样式和当前属性的 HTML 一起返回。编辑器节点视图只认属性 renderHTML，不会再走节点 renderHTML。 */
function withCropStyle(attrs: Record<string, unknown>, extra: Record<string, string>): Record<string, string> {
  const style = cropHtmlStyle(attrs)
  return style ? { ...extra, style } : extra
}

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
      concealed: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-concealed') === '1',
        renderHTML: (attrs: { concealed?: boolean }) => (attrs.concealed ? { 'data-concealed': '1' } : {}),
      },
      qrMeta: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-qr') || null,
        renderHTML: (attrs: { qrMeta?: string | null }) => {
          const value = (attrs.qrMeta || '').trim()
          return value ? { 'data-qr': value } : {}
        },
      },
      altBefore: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const value = el.getAttribute('data-alt-before')
          return value == null ? null : value
        },
        renderHTML: (attrs: { altBefore?: string | null }) =>
          attrs.altBefore == null ? {} : { 'data-alt-before': String(attrs.altBefore) },
      },
      captionBefore: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const value = el.getAttribute('data-caption-before')
          return value == null ? null : value
        },
        renderHTML: (attrs: { captionBefore?: string | null }) =>
          attrs.captionBefore == null ? {} : { 'data-caption-before': String(attrs.captionBefore) },
      },
      fit: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const value = el.getAttribute('data-fit')
          return value === 'cover' || value === 'contain' ? value : null
        },
        renderHTML: (attrs: { fit?: string | null }) =>
          attrs.fit === 'cover' || attrs.fit === 'contain' ? { 'data-fit': attrs.fit } : {},
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
        renderHTML: (attrs: Record<string, unknown>) => {
          const v = String(attrs.cropAspect || '').trim()
          return withCropStyle(attrs, v ? { 'data-crop-aspect': v } : {})
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
        renderHTML: (attrs: Record<string, unknown>) => {
          if (attrs.cropFocusX == null) return {}
          return withCropStyle(attrs, { 'data-crop-focus-x': String(attrs.cropFocusX) })
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
        renderHTML: (attrs: Record<string, unknown>) => {
          if (attrs.cropFocusY == null) return {}
          return withCropStyle(attrs, { 'data-crop-focus-y': String(attrs.cropFocusY) })
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
        renderHTML: (attrs: Record<string, unknown>) => {
          if (attrs.cropZoom == null) return {}
          return withCropStyle(attrs, { 'data-crop-zoom': String(attrs.cropZoom) })
        },
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    // 属性 renderHTML 已经把裁剪写进 style。这里再补一次，避免只走 toDOM 时丢掉。
    const crop = cropHtmlStyle(node?.attrs as Record<string, unknown>)
    const attrs = HTMLAttributes as Record<string, unknown>
    const prev = typeof attrs.style === 'string' ? attrs.style : ''
    if (crop && !prev.includes('object-fit')) attrs.style = [prev, crop].filter(Boolean).join('; ')
    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)]
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() || []), createImageDragPlugin(), createImageCaptionPlugin(), createCaptionRenumberPlugin()]
  },
})
