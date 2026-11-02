import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import {
  isLinkButtonTone,
  safeLinkButtonHref,
  type LinkButtonTone,
} from '../utils/rtePracticalToolbar'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkButton: {
      insertLinkButton: (attrs: { label: string; href: string; tone?: LinkButtonTone }) => ReturnType
    }
  }
}

function toneOf(value: unknown): LinkButtonTone {
  return isLinkButtonTone(value) ? value : 'blue'
}

/** 打开超链接的按钮。创建副本、关注文档属于文档产品，这里不做。 */
export const LinkButton = Node.create({
  name: 'linkButton',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: {
        default: '打开链接',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') || el.textContent || '打开链接',
        renderHTML: (attrs: { label?: string }) => ({ 'data-label': attrs.label || '打开链接' }),
      },
      href: {
        default: null,
        parseHTML: (el: HTMLElement) => safeLinkButtonHref(el.getAttribute('href') || ''),
        renderHTML: (attrs: { href?: string | null }) => (attrs.href ? { href: attrs.href } : {}),
      },
      tone: {
        default: 'blue' as LinkButtonTone,
        parseHTML: (el: HTMLElement) => toneOf(el.getAttribute('data-tone')),
        renderHTML: (attrs: { tone?: LinkButtonTone }) => ({ 'data-tone': toneOf(attrs.tone) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="link-button"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = String(node.attrs.label || '打开链接')
    const href = safeLinkButtonHref(String(node.attrs.href || ''))
    const tone = toneOf(node.attrs.tone)
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'link-button',
        class: `rte-link-button rte-link-button--${tone}`,
        href: href || undefined,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Ctrl 或 ⌘ 点击打开',
        contenteditable: 'false',
      }),
      label,
    ]
  },

  addCommands() {
    return {
      insertLinkButton:
        (attrs) =>
        ({ commands }) => {
          const href = safeLinkButtonHref(attrs.href)
          if (!href) return false
          return commands.insertContent({
            type: this.name,
            attrs: {
              label: attrs.label.trim() || '打开链接',
              href,
              tone: toneOf(attrs.tone),
            },
          })
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick(view, _pos, event) {
            const target = event.target
            if (!(target instanceof Element)) return false
            const el = target.closest('a.rte-link-button')
            if (!el) return false
            event.preventDefault()
            const href = el.getAttribute('href')
            if (href && (!view.editable || event.metaKey || event.ctrlKey)) {
              window.open(href, '_blank', 'noopener,noreferrer')
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
