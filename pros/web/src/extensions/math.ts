import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'

/** 非法 TeX 返回第一行说明；合法返回 null。确认前用它拦住，不把错误公式写进正文。 */
export function formulaTexIssue(tex: string): string | null {
  const src = (tex || '').trim()
  if (!src) return '请输入 TeX 公式'
  try {
    katex.renderToString(src, {
      throwOnError: true,
      displayMode: false,
      strict: 'ignore',
      output: 'html',
    })
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : '公式无法解析'
    return message.split('\n')[0]?.slice(0, 180) || '公式无法解析'
  }
}

export function renderKatex(tex: string, displayMode: boolean): string {
  const src = (tex || '').trim()
  if (!src) return ''
  try {
    return katex.renderToString(src, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
      output: 'html',
    })
  } catch {
    return src
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (attrs: { tex: string }) => ReturnType
    }
    mathDisplay: {
      insertMathDisplay: (attrs: { tex: string }) => ReturnType
    }
  }
}

function mountKatex(dom: HTMLElement, tex: string, displayMode: boolean) {
  dom.setAttribute('data-tex', tex)
  dom.replaceChildren()
  const src = (tex || '').trim()
  if (!src) {
    dom.textContent = displayMode ? '〔空公式〕' : '〔空〕'
    return
  }
  try {
    katex.render(src, dom, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
      output: 'html',
    })
  } catch {
    dom.textContent = src
  }
}

/** 行内公式 $...$ */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      tex: {
        default: '',
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-tex') || el.textContent || '',
        renderHTML: (attrs: { tex: string }) => ({
          'data-tex': attrs.tex || '',
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-type="math-inline"]' },
      { tag: 'span.rte-math-inline' },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const tex = (node.attrs.tex as string) || ''
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-inline',
        'data-tex': tex,
        class: 'rte-math rte-math-inline',
      }),
      tex ? `$${tex}$` : '',
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'rte-math rte-math-inline'
      dom.setAttribute('data-type', 'math-inline')
      dom.contentEditable = 'false'
      mountKatex(dom, node.attrs.tex as string, false)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== 'mathInline') return false
          mountKatex(dom, updated.attrs.tex as string, false)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertMathInline:
        (attrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { tex: attrs.tex || '' },
            })
            .run(),
    }
  },
})

/** 行间（块级）公式 $$...$$ */
export const MathDisplay = Node.create({
  name: 'mathDisplay',
  group: 'block',
  atom: true,
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      tex: {
        default: '',
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-tex') || el.textContent || '',
        renderHTML: (attrs: { tex: string }) => ({
          'data-tex': attrs.tex || '',
        }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="math-display"]' },
      { tag: 'div.rte-math-display' },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const tex = (node.attrs.tex as string) || ''
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-display',
        'data-tex': tex,
        class: 'rte-math rte-math-display',
      }),
      tex ? `$$${tex}$$` : ' ',
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'rte-math rte-math-display'
      dom.setAttribute('data-type', 'math-display')
      dom.contentEditable = 'false'
      mountKatex(dom, node.attrs.tex as string, true)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== 'mathDisplay') return false
          mountKatex(dom, updated.attrs.tex as string, true)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertMathDisplay:
        (attrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { tex: attrs.tex || '' },
            })
            .run(),
    }
  },
})
