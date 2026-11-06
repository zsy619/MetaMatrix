/**
 * TipTap CodeBlockLowlight + lowlight 公共语言包。
 * 与 StarterKit 共用时须关闭 StarterKit.codeBlock，避免重复注册。
 *
 * 行号和自动换行是节点属性（data-line-numbers / data-word-wrap），
 * 随正文 HTML 落库。缺省关闭，旧代码块外观不变。
 * 行号按逻辑行画在块内，不写入文档文本，复制代码不会带上行号。
 */
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const rteLowlight = createLowlight(common)

const lineNumberKey = new PluginKey('rteCodeLineNumbers')

export function codeBlockLineCount(text: string): number {
  if (!text) return 1
  return text.split('\n').length
}

function gutterText(lines: number): string {
  return Array.from({ length: lines }, (_, index) => String(index + 1)).join('\n')
}

function lineNumberDecorations(doc: PMNode) {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return
    if (node.attrs.lineNumbers !== true) return false
    const lines = codeBlockLineCount(node.textContent)
    const text = gutterText(lines)
    decorations.push(
      Decoration.widget(
        pos + 1,
        () => {
          const gutter = document.createElement('div')
          gutter.className = 'rte-code-gutter'
          gutter.setAttribute('contenteditable', 'false')
          gutter.setAttribute('aria-hidden', 'true')
          gutter.textContent = text
          return gutter
        },
        { side: -1, ignoreSelection: true, key: `rte-ln-${lines}` },
      ),
    )
    return false
  })
  return decorations
}

function flagAttr(name: 'data-line-numbers' | 'data-word-wrap') {
  return {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute(name) === '1',
    renderHTML: (attrs: { lineNumbers?: boolean; wordWrap?: boolean }) => {
      const on = name === 'data-line-numbers' ? attrs.lineNumbers === true : attrs.wordWrap === true
      return on ? { [name]: '1' } : {}
    },
  }
}

export const RteCodeBlockLowlight = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lineNumbers: flagAttr('data-line-numbers'),
      wordWrap: flagAttr('data-word-wrap'),
    }
  },

  addProseMirrorPlugins() {
    const parent = this.parent?.() ?? []
    return [
      ...parent,
      new Plugin({
        key: lineNumberKey,
        props: {
          decorations(state) {
            return DecorationSet.create(state.doc, lineNumberDecorations(state.doc))
          },
        },
      }),
    ]
  },
}).configure({
  lowlight: rteLowlight,
  defaultLanguage: 'plaintext',
  HTMLAttributes: {
    class: 'rte-code-block',
  },
})

export const RTE_CODE_LANGUAGES = rteLowlight.listLanguages()
