// @vitest-environment happy-dom
/** 代码块行号 / 自动换行：属性落在 pre 上，行号不进正文，缺省不改变旧 HTML。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { RteCodeBlockLowlight, codeBlockLineCount } from './codeHighlight'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      RteCodeBlockLowlight,
    ],
    content,
  })
  return editor
}

const SAMPLE = '<pre><code class="language-javascript">const a = 1\nconst b = 2</code></pre>'

function selectInside(ed: Editor) {
  ed.commands.setTextSelection(2)
}

describe('代码块行号与换行', () => {
  it('缺省不写行号和换行属性', () => {
    const ed = makeEditor(SAMPLE)
    const html = ed.getHTML()
    expect(html).not.toContain('data-line-numbers')
    expect(html).not.toContain('data-word-wrap')
    expect(ed.view.dom.querySelector('.rte-code-gutter')).toBeNull()
    expect(ed.getAttributes('codeBlock').language).toBe('javascript')
  })

  it('打开后写入 HTML，行号按逻辑行，且不进文本', () => {
    const ed = makeEditor(SAMPLE)
    selectInside(ed)
    ed.chain().focus().updateAttributes('codeBlock', { lineNumbers: true, wordWrap: true }).run()
    const html = ed.getHTML()
    expect(html).toContain('data-line-numbers="1"')
    expect(html).toContain('data-word-wrap="1"')
    expect(html).toContain('language-javascript')
    const gutter = ed.view.dom.querySelector('.rte-code-gutter')
    expect(gutter?.textContent).toBe('1\n2')
    expect(ed.state.doc.textContent).toBe('const a = 1\nconst b = 2')
    expect(ed.state.doc.textContent).not.toContain('1\n2')
  })

  it('关掉之后属性从 HTML 里消失，再读回来仍是关', () => {
    const ed = makeEditor(SAMPLE)
    selectInside(ed)
    ed.chain().focus().updateAttributes('codeBlock', { lineNumbers: true }).run()
    ed.chain().focus().updateAttributes('codeBlock', { lineNumbers: false, wordWrap: false }).run()
    const html = ed.getHTML()
    expect(html).not.toContain('data-line-numbers')
    ed.destroy()
    editor = undefined
    const again = makeEditor(html)
    expect(again.getAttributes('codeBlock').lineNumbers).toBe(false)
    expect(again.getAttributes('codeBlock').wordWrap).toBe(false)
  })

  it('带属性的 HTML 能还原', () => {
    const ed = makeEditor(
      '<pre data-line-numbers="1" data-word-wrap="1"><code class="language-python">print(1)\nprint(2)\nprint(3)</code></pre>',
    )
    expect(ed.getAttributes('codeBlock').lineNumbers).toBe(true)
    expect(ed.getAttributes('codeBlock').wordWrap).toBe(true)
    expect(ed.getAttributes('codeBlock').language).toBe('python')
    expect(ed.view.dom.querySelector('.rte-code-gutter')?.textContent).toBe('1\n2\n3')
  })

  it('行数按换行计，空块算 1 行', () => {
    expect(codeBlockLineCount('')).toBe(1)
    expect(codeBlockLineCount('a\nb')).toBe(2)
    expect(codeBlockLineCount('a\n')).toBe(2)
  })
})
