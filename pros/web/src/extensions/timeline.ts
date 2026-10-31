import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    timeline: {
      insertTimeline: (items?: Array<{ time?: string; title?: string; body?: string }>) => ReturnType
    }
  }
}

export const TimelineItem = Node.create({
  name: 'timelineItem',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      time: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-time') || '',
        renderHTML: (attrs: { time?: string }) =>
          attrs.time ? { 'data-time': attrs.time } : {},
      },
      title: {
        default: '节点',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '节点',
        renderHTML: (attrs: { title?: string }) => ({
          'data-title': attrs.title || '节点',
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="timeline-item"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const time = node.attrs.time || ''
    const title = node.attrs.title || '节点'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'timeline-item',
        class: 'rte-timeline-item',
      }),
      [
        'div',
        { class: 'rte-timeline-item-head', contenteditable: 'false' },
        time ? ['span', { class: 'rte-timeline-time' }, time] : ['span', {}],
        ['span', { class: 'rte-timeline-title' }, title],
      ],
      ['div', { class: 'rte-timeline-item-body' }, 0],
    ]
  },
})

export const Timeline = Node.create({
  name: 'timeline',
  group: 'block',
  content: 'timelineItem+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="timeline"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'timeline',
        class: 'rte-timeline',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      insertTimeline:
        (items) =>
        ({ commands }) => {
          const list =
            items && items.length
              ? items
              : [
                  { time: '2026-01', title: '启动', body: '项目启动' },
                  { time: '2026-06', title: '里程碑', body: '阶段性交付' },
                  { time: '2026-12', title: '收尾', body: '复盘归档' },
                ]
          return commands.insertContent({
            type: this.name,
            content: list.map((it) => ({
              type: 'timelineItem',
              attrs: {
                time: it.time || '',
                title: it.title || '节点',
              },
              content: [
                {
                  type: 'paragraph',
                  content: it.body
                    ? [{ type: 'text', text: it.body }]
                    : [],
                },
              ],
            })),
          })
        },
    }
  },
})
