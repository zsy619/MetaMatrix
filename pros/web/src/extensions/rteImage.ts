import Image from '@tiptap/extension-image'
import { createImageDragPlugin } from './rteImageDrag'
import { normalizeImageAlign, normalizeImageLayout } from '../utils/rteImageLayout'

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
    }
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() || []), createImageDragPlugin()]
  },
})
