import type { ResizableNodeViewDirection, ResizableNodeViewOptions } from '@tiptap/core'
import {
  Node,
  ResizableNodeView,
  getRenderedAttributes,
  mergeAttributes,
} from '@tiptap/core'

export interface VideoAttrs {
  src: string | null
  controls?: boolean
  width?: number | null
  height?: number | null
}

export interface VideoOptions {
  /** 行内节点：可与图片一样同行并排、跨行拖拽 */
  inline: boolean
  HTMLAttributes: Record<string, unknown>
  resize:
    | {
        enabled: boolean
        directions?: ResizableNodeViewDirection[]
        minWidth?: number
        minHeight?: number
        alwaysPreserveAspectRatio?: boolean
      }
    | false
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    video: {
      setVideo: (attrs: { src: string; width?: number; height?: number }) => ReturnType
    }
  }
}

const ALL_DIRECTIONS: ResizableNodeViewDirection[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

/**
 * 可缩放视频节点：默认 inline + 8 锚点 ResizableNodeView，支持飞书式同行/跨行拖拽。
 */
export const Video = Node.create<VideoOptions>({
  name: 'video',

  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      inline: true,
      HTMLAttributes: {
        class: 'rte-video',
      },
      resize: {
        enabled: true,
        directions: ALL_DIRECTIONS,
        minWidth: 48,
        minHeight: 48,
        alwaysPreserveAspectRatio: true,
      },
    }
  },

  inline() {
    return this.options.inline
  },

  group() {
    return this.options.inline ? 'inline' : 'block'
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('src'),
        renderHTML: (attrs: VideoAttrs) => {
          if (!attrs.src) return {}
          return { src: attrs.src }
        },
      },
      controls: {
        default: true,
        parseHTML: (el: HTMLElement) => el.hasAttribute('controls'),
        renderHTML: () => ({ controls: 'controls' }),
      },
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const w = el.getAttribute('width')
          return w ? Number(w) || null : null
        },
        renderHTML: (attrs: VideoAttrs) => {
          if (attrs.width == null) return {}
          return { width: String(attrs.width) }
        },
      },
      height: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const h = el.getAttribute('height')
          return h ? Number(h) || null : null
        },
        renderHTML: (attrs: VideoAttrs) => {
          if (attrs.height == null) return {}
          return { height: String(attrs.height) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'video[src]' }, { tag: 'video' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        controls: 'controls',
      }),
    ]
  },

  addNodeView() {
    if (!this.options.resize || !this.options.resize.enabled || typeof document === 'undefined') {
      return null
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize
    const resizeManagedAttributes = new Set(['src', 'width', 'height', 'controls'])

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const el = document.createElement('video')
      el.draggable = false
      el.controls = true
      el.playsInline = true

      const mergedAttributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)

      Object.entries(mergedAttributes).forEach(([key, value]) => {
        if (value == null) return
        switch (key) {
          case 'src':
          case 'width':
          case 'height':
            break
          case 'controls':
            el.controls = true
            break
          default:
            el.setAttribute(key, String(value))
            break
        }
      })

      let previousHTMLAttributes = { ...HTMLAttributes }

      const syncVideoSource = (src: unknown) => {
        if (typeof src === 'string' && src !== '') {
          if (el.getAttribute('src') !== src) el.src = src
          return
        }
        if (el.hasAttribute('src')) el.removeAttribute('src')
        if (el.src) el.removeAttribute('src')
      }

      syncVideoSource(HTMLAttributes.src)

      const onUpdate: ResizableNodeViewOptions['onUpdate'] = (updatedNode) => {
        if (updatedNode.type !== node.type) return false

        const extensionAttributes = editor.extensionManager.attributes.filter(
          (attribute) => attribute.type === updatedNode.type.name,
        )
        const newHTMLAttributes = getRenderedAttributes(updatedNode, extensionAttributes)

        Object.keys(previousHTMLAttributes).forEach((key) => {
          if (!resizeManagedAttributes.has(key) && !(key in newHTMLAttributes)) {
            el.removeAttribute(key)
          }
        })

        Object.entries(newHTMLAttributes).forEach(([key, value]) => {
          if (resizeManagedAttributes.has(key)) return
          if (value != null) el.setAttribute(key, String(value))
          else el.removeAttribute(key)
        })

        syncVideoSource(newHTMLAttributes.src)
        previousHTMLAttributes = newHTMLAttributes
        return true
      }

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (width, height) => {
          el.style.width = `${width}px`
          el.style.height = `${height}px`
        },
        onCommit: (width, height) => {
          const pos = getPos()
          if (pos === undefined) return
          this.editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, { width, height })
            .run()
        },
        onUpdate,
        options: {
          directions: directions?.length ? directions : ALL_DIRECTIONS,
          min: {
            width: minWidth,
            height: minHeight,
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
        },
      })

      const dom = nodeView.dom as HTMLElement
      const showNodeView = () => {
        dom.style.visibility = ''
        dom.style.pointerEvents = ''
      }
      // 先隐藏避免未测到尺寸时跳动；若元数据/错误迟迟不来，超时强制显示，避免「插入了但看不见」
      dom.style.visibility = 'hidden'
      dom.style.pointerEvents = 'none'

      if (el.readyState >= 1) showNodeView()
      else {
        el.addEventListener('loadedmetadata', showNodeView, { once: true })
        el.addEventListener('error', showNodeView, { once: true })
        window.setTimeout(showNodeView, 1200)
      }

      return nodeView
    }
  },

  addCommands() {
    return {
      setVideo:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              controls: true,
              width: attrs.width ?? null,
              height: attrs.height ?? null,
            },
          }),
    }
  },
})

export { ALL_DIRECTIONS as VIDEO_RESIZE_DIRECTIONS }
