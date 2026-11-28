// @vitest-environment happy-dom
/**
 * 行内 Markdown 语法的契约：
 * - 地址白名单：危险协议一律不转换；
 * - `[文字](地址)` 输入完右括号即变成链接；
 * - `==文字==` 变成高亮；
 * - 开关关闭后不转换，符号保持原样。
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  RteInlineMarkdown,
  isSafeMarkdownLink,
  markdownInlineEnabled,
  setMarkdownInlineEnabled,
} from './rteInlineMarkdown'

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      Link.configure({ openOnClick: false, protocols: ['http', 'https'] }),
      Highlight.configure({ multicolor: true }),
      RteInlineMarkdown,
    ],
    content: '<p></p>',
  })
}

/** 逐字符输入，触发 TipTap 的输入规则（insertContent 不会触发）。 */
function typeText(editor: Editor, text: string) {
  for (const ch of text) {
    const { state, view } = editor
    const { from, to } = state.selection
    const handled = view.someProp('handleTextInput', (f: any) => f(view, from, to, ch))
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to))
  }
}

describe('行内 Markdown 语法', () => {
  beforeEach(() => {
    setMarkdownInlineEnabled(true)
  })

  afterEach(() => {
    setMarkdownInlineEnabled(true)
  })

  it('只放行安全的地址', () => {
    expect(isSafeMarkdownLink('https://example.com')).toBe(true)
    expect(isSafeMarkdownLink('http://example.com')).toBe(true)
    expect(isSafeMarkdownLink('mailto:a@b.com')).toBe(true)
    expect(isSafeMarkdownLink('/media/abc')).toBe(true)
    expect(isSafeMarkdownLink('#anchor')).toBe(true)
    expect(isSafeMarkdownLink('javascript:alert(1)')).toBe(false)
    expect(isSafeMarkdownLink('data:text/html,<script>')).toBe(false)
    expect(isSafeMarkdownLink('vbscript:msgbox')).toBe(false)
    expect(isSafeMarkdownLink('')).toBe(false)
  })

  it('输入 [文字](地址) 后变成链接', () => {
    const editor = makeEditor()
    typeText(editor, '[示例文档](https://example.com/doc)')
    const html = editor.getHTML()
    expect(html).toContain('href="https://example.com/doc"')
    expect(html).toContain('>示例文档<')
    expect(html).not.toContain('](')
    editor.destroy()
  })

  it('链接文字前有前导空格时，标记区间仍然只盖住文字本身', () => {
    const editor = makeEditor()
    typeText(editor, '前面文字 [带前空格](https://example.com/x)')
    const html = editor.getHTML()
    expect(html).toContain('>带前空格</a>')
    expect(html).not.toContain('> 带前空格</a>')
    editor.destroy()
  })

  it('危险协议的地址不会被写成链接', () => {
    const editor = makeEditor()
    typeText(editor, '[点我](javascript:alert(1))')
    // 危险地址保持字面文本，不会变成链接（没有 <a>、没有 href）
    expect(editor.getHTML()).not.toContain('<a')
    expect(editor.getHTML()).not.toContain('href=')
    expect(editor.getHTML()).toContain('[点我](javascript:alert(1))')
    editor.destroy()
  })

  it('输入 ==文字== 变成高亮', () => {
    const editor = makeEditor()
    typeText(editor, '==重点==')
    expect(editor.getHTML()).toContain('<mark')
    expect(editor.getHTML()).toContain('重点')
    editor.destroy()
  })

  it('开关关闭后保持原样', () => {
    setMarkdownInlineEnabled(false)
    expect(markdownInlineEnabled.value).toBe(false)
    const editor = makeEditor()
    typeText(editor, '[示例文档](https://example.com/doc)')
    expect(editor.getHTML()).not.toContain('<a')
    expect(editor.getHTML()).toContain('[示例文档](https://example.com/doc)')
    editor.destroy()
  })
})
