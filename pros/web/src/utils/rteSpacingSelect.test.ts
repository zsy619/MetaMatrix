// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { LetterSpacing, letterSpacingTarget } from '../extensions/letterSpacing'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor(content = '<p>段落文字</p>') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      LetterSpacing,
      ParagraphAttrs,
    ],
    content,
  })
  return editor
}

describe('段距选项会写进当前段落', () => {
  it('段前、段后、首行缩进和文字方向都留在段落上', () => {
    const ed = makeEditor()
    ed.chain().focus('end').setParagraphSpacing({ marginTop: '2em', marginBottom: '1em' }).run()
    ed.chain().focus().setTextIndent('2em').setTextDir('rtl').run()
    const html = ed.getHTML()
    expect(html).toContain('margin-top: 2em')
    expect(html).toContain('margin-bottom: 1em')
    expect(html).toContain('text-indent: 2em')
    expect(html).toContain('dir="rtl"')
    ed.chain().focus().setParagraphSpacing({ marginTop: null }).setTextIndent(null).setTextDir(null).run()
    expect(ed.getHTML()).not.toContain('margin-top')
    expect(ed.getHTML()).not.toContain('text-indent')
    expect(ed.getHTML()).not.toContain('dir="rtl"')
  })

  it('光标没有选中文字时，字间距仍作用到这一段', () => {
    const ed = makeEditor()
    ed.commands.focus('end')
    const target = letterSpacingTarget(ed.state.selection)
    expect(target).toBeTruthy()
    ed.chain().focus().setTextSelection(target!).setLetterSpacing('0.2em').run()
    expect(ed.getHTML()).toContain('letter-spacing: 0.2em')
    expect(ed.getHTML()).toContain('段落文字')
  })
})
