// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import { undoDepth } from '@tiptap/pm/history'
import { applyFontSizeToSelection } from '../components/rte/selectionFormat'
import { ImageGroup } from '../extensions/imageGroup'
import { setGroupRatios } from '../extensions/imageGroupOps'
import { RteImage } from '../extensions/rteImage'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.getElementById('rte-image-group-layout')?.remove()
})

describe('一次手势一步撤销', () => {
  it('连续改字号只占一步撤销', () => {
    const host = document.createElement('div')
    editor = new Editor({
      element: host,
      extensions: [StarterKit, TextStyle, FontSize],
      content: '<p>甲乙</p>',
    })
    editor.commands.setTextSelection({ from: 1, to: 3 })
    applyFontSizeToSelection(editor, '12pt')
    applyFontSizeToSelection(editor, '18pt')
    expect(editor.getHTML()).toContain('18pt')
    expect(undoDepth(editor.state)).toBe(1)
    editor.commands.undo()
    expect(editor.getHTML()).not.toContain('font-size')
  })

  it('连续拖比例只占一步撤销', () => {
    const host = document.createElement('div')
    editor = new Editor({
      element: host,
      extensions: [StarterKit.configure({ dropcursor: false }), RteImage.configure({ inline: false }), ImageGroup],
      content:
        '<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="https://example.com/a.png"><img src="https://example.com/b.png"><img src="https://example.com/c.png"></div></div>',
    })
    let groupPos = -1
    editor.state.doc.descendants((node, at) => {
      if (node.type.name === 'imageGroup' && groupPos < 0) groupPos = at
    })
    expect(setGroupRatios(editor.view, groupPos, [1, 1, 1])).toBe(true)
    expect(setGroupRatios(editor.view, groupPos, [3, 1, 1])).toBe(true)
    expect(undoDepth(editor.state)).toBe(1)
    editor.commands.undo()
    expect(editor.state.doc.firstChild?.attrs.ratioMode).toBeNull()
  })
})
