// @vitest-environment happy-dom
/**
 * 编辑内核：选区、格式命令、撤销重做、粘贴清洗后的可编辑结构、HTML 往返。
 * 这里的键盘事件是脚本派发的，不是操作系统输入法。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { RteImage } from '../extensions/rteImage'
import { RteCodeBlockLowlight } from '../extensions/codeHighlight'
import { plainTextToPasteContent, sanitizePastedHtml } from './rtePasteClean'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor(content = '<p>你好世界</p>') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, underline: false }),
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'rte-link' } }),
      RteCodeBlockLowlight,
      RteImage.configure({ inline: false, allowBase64: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
  })
  return editor
}

const SAMPLE =
  '<h2>标题</h2><ul><li>项目</li></ul><p>看 <a href="https://example.com/a">链接</a> 与 <strong>加粗</strong></p>' +
  '<pre><code class="language-javascript">const a = 1</code></pre>' +
  '<img src="/media/asset-1" alt="素材">'

describe('编辑内核', () => {
  it('格式化后选区还在，撤销和重做回到同一份正文', () => {
    const ed = makeEditor()
    ed.commands.setTextSelection({ from: 1, to: 3 })
    ed.chain().focus().toggleBold().run()
    expect(ed.state.selection.from).toBe(1)
    expect(ed.state.selection.to).toBe(3)
    expect(ed.getHTML()).toContain('<strong>')
    ed.chain().focus().toggleItalic().run()
    expect(ed.state.selection.from).toBe(1)
    expect(ed.getHTML()).toMatch(/<(em|i)>/)
    ed.commands.undo()
    expect(ed.getHTML()).not.toMatch(/<(em|i)>/)
    expect(ed.getHTML()).toContain('<strong>')
    ed.commands.undo()
    expect(ed.getHTML()).toBe('<p>你好世界</p>')
    ed.commands.redo()
    expect(ed.getHTML()).toContain('<strong>你好</strong>')
    ed.commands.setTextSelection({ from: 3, to: 5 })
    ed.commands.deleteSelection()
    expect(ed.state.doc.textContent).not.toContain('世界')
    const afterDelete = ed.getHTML()
    ed.commands.undo()
    expect(ed.getHTML()).not.toBe(afterDelete)
    expect(ed.state.doc.textContent).toContain('世界')
  })

  it('工具栏命令和 Ctrl+B 走同一条加粗', () => {
    const ed = makeEditor()
    ed.commands.setTextSelection({ from: 1, to: 3 })
    const event = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, bubbles: true })
    const handled = ed.view.someProp('handleKeyDown', (fn) => fn(ed.view, event))
    expect(handled).toBe(true)
    const byShortcut = ed.getHTML()
    ed.commands.undo()
    ed.commands.setTextSelection({ from: 1, to: 3 })
    ed.chain().focus().toggleBold().run()
    expect(ed.getHTML()).toBe(byShortcut)
  })

  it('危险粘贴被滤掉，合法结构还能编辑、还能撤销', () => {
    const ed = makeEditor('<p></p>')
    const html = sanitizePastedHtml(
      '<script>alert(1)</script><h2>标题</h2><p><strong>重点</strong></p>' +
        '<a href="&#106;avascript:alert(1)">坏链</a><ul><li>一项</li></ul>' +
        '<img src="x" onerror="alert(1)">',
    )
    ed.commands.setContent(html)
    const stored = ed.getHTML()
    expect(stored).not.toMatch(/<script|javascript:|onerror/i)
    expect(stored).toContain('标题')
    expect(stored).toContain('<strong>重点</strong>')
    expect(stored).toContain('一项')
    expect(stored).toContain('坏链')
    ed.commands.focus('end')
    ed.commands.insertContent('尾')
    expect(ed.state.doc.textContent).toContain('尾')
    ed.commands.undo()
    expect(ed.state.doc.textContent).not.toContain('尾')
  })

  it('纯文本粘贴不把尖括号变成标签', () => {
    const ed = makeEditor('<p></p>')
    ed.commands.setContent('<p></p>')
    ed.commands.insertContent(plainTextToPasteContent('<b>不是标签</b>\n第二行'))
    const html = ed.getHTML()
    expect(html).not.toContain('<b>不是标签</b>')
    expect(ed.state.doc.textContent).toContain('<b>不是标签</b>')
    expect(ed.state.doc.textContent).toContain('第二行')
    ed.commands.undo()
    expect(ed.state.doc.textContent).not.toContain('第二行')
  })

  it('按现有 HTML 再加载，标题、列表、链接、代码、素材图还在', () => {
    const ed = makeEditor(SAMPLE)
    const first = ed.getHTML()
    ed.commands.setContent(first)
    const second = ed.getHTML()
    expect(second).toContain('<h2>')
    expect(second).toContain('项目')
    expect(second).toContain('https://example.com/a')
    expect(second).toContain('<strong>加粗</strong>')
    expect(second).toContain('language-javascript')
    expect(second).toContain('const a = 1')
    expect(second).toContain('/media/asset-1')
    ed.commands.setContent(second)
    expect(ed.getHTML()).toBe(second)
  })
})
