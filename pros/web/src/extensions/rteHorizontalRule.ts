import HorizontalRule from '@tiptap/extension-horizontal-rule'

export type RteHrVariant = 'solid' | 'dashed' | 'double' | 'thick'

export const HR_VARIANT_OPTIONS: Array<{ label: string; value: RteHrVariant }> = [
  { label: '实线', value: 'solid' },
  { label: '虚线', value: 'dashed' },
  { label: '双线', value: 'double' },
  { label: '粗线', value: 'thick' },
]

function normalizeVariant(v: unknown): RteHrVariant {
  if (v === 'dashed' || v === 'double' || v === 'thick' || v === 'solid') return v
  return 'solid'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rteHorizontalRule: {
      setHorizontalRuleVariant: (variant: RteHrVariant) => ReturnType
      insertHorizontalRule: (variant?: RteHrVariant) => ReturnType
    }
  }
}

/** 分割线增强：实线 / 虚线 / 双线 / 粗线 */
export const RteHorizontalRule = HorizontalRule.extend({
  name: 'horizontalRule',

  addAttributes() {
    return {
      variant: {
        default: 'solid' as RteHrVariant,
        parseHTML: (el: HTMLElement) =>
          normalizeVariant(
            el.getAttribute('data-variant') ||
              el.getAttribute('data-hr') ||
              el.className?.match?.(/rte-hr--(\w+)/)?.[1],
          ),
        renderHTML: (attrs: { variant?: RteHrVariant }) => {
          const variant = normalizeVariant(attrs.variant)
          return {
            'data-variant': variant,
            class: `rte-hr rte-hr--${variant}`,
          }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setHorizontalRuleVariant:
        (variant: RteHrVariant) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, {
            variant: normalizeVariant(variant),
          }),
      insertHorizontalRule:
        (variant: RteHrVariant = 'solid') =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { variant: normalizeVariant(variant) },
            })
            .run(),
    }
  },
})
