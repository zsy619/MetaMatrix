// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { LetterSpacing } from '../extensions/letterSpacing'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'
import { clearEditorFormat } from './rteClearFormat'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      LetterSpacing,
      ParagraphAttrs,
    ],
    content: '<h2 style="text-align: center">标题</h2><p>正文</p>',
  })
  return editor
}

describe('清除格式一次撤销', () => {
  it('加粗、颜色、高亮、首行缩进和标题一次清掉，撤销一次全部回来', () => {
    const ed = makeEditor()
    ed.commands.setTextSelection({ from: 1, to: 3 })
    ed.chain().setBold().setColor('#d83931').setHighlight({ color: '#fff3bf' }).setTextIndent('2em').run()
    const before = ed.getHTML()
    expect(before).toContain('<strong>')
    expect(before).toMatch(/text-indent:\s*2em/)
    const from = ed.state.selection.from
    const to = ed.state.selection.to
    expect(clearEditorFormat(ed)).toBe(true)
    const cleared = ed.getHTML()
    expect(cleared).not.toContain('<strong>')
    expect(cleared).not.toContain('text-indent')
    expect(cleared).not.toContain('fff3bf')
    expect(cleared).not.toContain('<h2')
    expect(ed.state.selection.from).toBe(from)
    expect(ed.state.selection.to).toBe(to)
    expect(ed.commands.undo()).toBe(true)
    expect(ed.getHTML()).toBe(before)
    expect(ed.commands.redo()).toBe(true)
    expect(ed.getHTML()).toBe(cleared)
  })
})
