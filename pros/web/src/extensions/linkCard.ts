import { Node, mergeAttributes } from '@tiptap/core'

export type LinkCardMode = 'card' | 'iframe'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkCard: {
      insertLinkCard: (attrs: {
        href: string
        title?: string
        mode?: LinkCardMode
      }) => ReturnType
    }
  }
}

function safeHref(href: string): string | null {
  const h = (href || '').trim()
  if (!h) return null
  try {
    const u = new URL(h.includes('://') ? h : `https://${h}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/** 安全链接卡片：默认卡片；可选同源外 iframe（sandbox） */
export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-href') || el.getAttribute('href'),
        renderHTML: (attrs: { href?: string | null }) =>
          attrs.href ? { 'data-href': attrs.href } : {},
      },
      title: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '',
        renderHTML: (attrs: { title?: string }) =>
          attrs.title ? { 'data-title': attrs.title } : {},
      },
      mode: {
        default: 'card' as LinkCardMode,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-mode') === 'iframe' ? 'iframe' : 'card',
        renderHTML: (attrs: { mode?: LinkCardMode }) => ({
          'data-mode': attrs.mode === 'iframe' ? 'iframe' : 'card',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="link-card"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes['data-href'] || '')
    const title = String(HTMLAttributes['data-title'] || href || '链接')
    const mode = HTMLAttributes['data-mode'] === 'iframe' ? 'iframe' : 'card'
    const root = mergeAttributes(HTMLAttributes, {
      'data-type': 'link-card',
      class: `rte-link-card rte-link-card--${mode}`,
    })
    if (mode === 'iframe' && href) {
      return [
        'div',
        root,
        [
          'div',
          { class: 'rte-link-card-bar' },
          ['a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'rte-link' }, title],
        ],
        [
          'iframe',
          {
            src: href,
            class: 'rte-link-card-frame',
            sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
            referrerpolicy: 'no-referrer',
            loading: 'lazy',
            title,
          },
        ],
      ]
    }
    return [
      'div',
      root,
      [
        'a',
        {
          href: href || '#',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'rte-link-card-anchor',
        },
        ['span', { class: 'rte-link-card-title' }, title || '链接卡片'],
        ['span', { class: 'rte-link-card-url' }, href],
      ],
    ]
  },

  addCommands() {
    return {
      insertLinkCard:
        (attrs) =>
        ({ commands }) => {
          const href = safeHref(attrs.href)
          if (!href) return false
          return commands.insertContent({
            type: this.name,
            attrs: {
              href,
              title: (attrs.title || href).slice(0, 120),
              mode: attrs.mode === 'iframe' ? 'iframe' : 'card',
            },
          })
        },
    }
  },
})

export { safeHref as safeLinkCardHref }
