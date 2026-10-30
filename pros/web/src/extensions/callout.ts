import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core'

export type CalloutVariant = 'info' | 'warn' | 'success' | 'error'

export const CALLOUT_VARIANT_LABEL: Record<CalloutVariant, string> = {
  info: '提示',
  warn: '警告',
  success: '成功',
  error: '错误',
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType
      toggleCallout: (variant?: CalloutVariant) => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

function normalizeVariant(v: unknown): CalloutVariant {
  if (v === 'warn' || v === 'success' || v === 'error' || v === 'info') return v
  return 'info'
}

/** 告示框 / Callout：info · warn · success · error（飞书/语雀风格） */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: (el: HTMLElement) =>
          normalizeVariant(
            el.getAttribute('data-variant') || el.getAttribute('data-callout'),
          ),
        renderHTML: (attrs: { variant?: CalloutVariant }) => ({
          'data-variant': normalizeVariant(attrs.variant),
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="callout"]' },
      { tag: 'aside[data-type="callout"]' },
      { tag: 'div.rte-callout' },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const variant = normalizeVariant(node.attrs.variant)
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        'data-variant': variant,
        class: `rte-callout rte-callout--${variant}`,
        role: 'note',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setCallout:
        (variant: CalloutVariant = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { variant: normalizeVariant(variant) }),
      toggleCallout:
        (variant: CalloutVariant = 'info') =>
        ({ commands, editor }) => {
          const v = normalizeVariant(variant)
          if (editor.isActive(this.name, { variant: v })) {
            return commands.lift(this.name)
          }
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, { variant: v })
          }
          return commands.wrapIn(this.name, { variant: v })
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^:::\s?(info|warn|success|error|tip|warning)?\s$/,
        type: this.type,
        getAttributes: (match) => {
          const raw = (match[1] || 'info').toLowerCase()
          const map: Record<string, CalloutVariant> = {
            info: 'info',
            tip: 'info',
            warn: 'warn',
            warning: 'warn',
            success: 'success',
            error: 'error',
          }
          return { variant: map[raw] || 'info' }
        },
      }),
    ]
  },
})
