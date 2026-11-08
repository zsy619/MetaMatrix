// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { MathDisplay, MathInline, formulaTexIssue } from './math'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

describe('公式确认', () => {
  it('不完整的 TeX 会说明原因，合法公式没有错误', () => {
    expect(formulaTexIssue('')).toMatch(/请输入/)
    expect(formulaTexIssue('\\frac{')).toBeTruthy()
    expect(formulaTexIssue('E=mc^2')).toBeNull()
  })

  it('插入后撤销能去掉公式；选中已有公式再改只替换这一处', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, MathInline, MathDisplay],
      content: '<p>前文</p>',
    })
    const ed = editor
    ed.commands.focus('end')
    expect(ed.chain().focus().insertMathInline({ tex: 'a+b' }).run()).toBe(true)
    expect(ed.getHTML()).toContain('data-tex="a+b"')
    expect(ed.commands.undo()).toBe(true)
    expect(ed.getHTML()).not.toContain('data-tex="a+b"')
    expect(ed.commands.redo()).toBe(true)

    let pos = -1
    ed.state.doc.descendants((node, at) => {
      if (node.type.name === 'mathInline' && pos < 0) pos = at
    })
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)))
    expect(ed.chain().focus().updateAttributes('mathInline', { tex: 'c+d' }).run()).toBe(true)
    expect(ed.getHTML()).toContain('data-tex="c+d"')
    expect(ed.getHTML()).not.toContain('data-tex="a+b"')
    expect(ed.commands.undo()).toBe(true)
    expect(ed.getHTML()).toContain('data-tex="a+b"')
  })
})
