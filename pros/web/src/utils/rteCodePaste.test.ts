// @vitest-environment jsdom
/**
 * 代码块粘贴回归测试：
 * - 代码块内粘贴按原文逐字写入，换行与缩进不丢；
 * - 非代码块不拦截（交回 ProseMirror 默认粘贴）。
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  clipboardPlainText,
  htmlToPlainText,
  normalizeNewlines,
  pasteIntoCodeBlock,
  selectionInCodeBlock,
} from './rteCodePaste'

function makeEditor(html: string) {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit],
    content: html,
  })
}

describe('rteCodePaste', () => {
  it('归一化换行', () => {
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('从富文本 HTML 抽纯文本', () => {
    expect(htmlToPlainText('<p>hello<br>world</p>')).toBe('helloworld')
  })

  it('优先取剪贴板纯文本', () => {
    expect(clipboardPlainText('code', '<p>x</p>')).toBe('code')
    expect(clipboardPlainText('', '<p>x</p>')).toBe('x')
  })

  it('代码块内粘贴逐字写入并保留换行', () => {
    const editor = makeEditor('<pre><code>const a = 1</code></pre>')
    editor.commands.setTextSelection(3)
    expect(selectionInCodeBlock(editor.view)).toBe(true)
    const done = pasteIntoCodeBlock(editor.view, 'const b = 2\n  indent', '')
    expect(done).toBe(true)
    expect(editor.getText()).toContain('const b = 2\n  indent')
    editor.destroy()
  })

  it('正文里不拦截粘贴', () => {
    const editor = makeEditor('<p>hello</p>')
    editor.commands.setTextSelection(3)
    expect(selectionInCodeBlock(editor.view)).toBe(false)
    expect(pasteIntoCodeBlock(editor.view, 'x', '')).toBe(false)
    editor.destroy()
  })
})
