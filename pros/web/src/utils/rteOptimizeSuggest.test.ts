// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImageGroup } from '../extensions/imageGroup'
import { setGroupLayout } from '../extensions/imageGroupOps'
import { RteImage } from '../extensions/rteImage'
import { SuggestionDelete, SuggestionInsert } from '../extensions/suggestionMarks'
import { SuggestionMode } from '../extensions/suggestionMode'
import { deepOptimizeDocument } from './rteDeepOptimize'
import { collectSuggestionRanges, dispatchSuggestionDecision } from './rteSuggestions'

let editor: Editor | undefined
let suggesting = true

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.getElementById('rte-image-group-layout')?.remove()
})

function mount(content: string) {
  suggesting = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      RteImage.configure({ inline: false, allowBase64: true }),
      ImageGroup,
      SuggestionInsert,
      SuggestionDelete,
      SuggestionMode.configure({
        enabled: () => suggesting,
        author: () => ({ id: 'u1', name: '甲' }),
      }),
    ],
    content,
  })
  return editor
}

describe('深优化记成修订', () => {
  it('建议模式下题注改写可接受或拒绝', () => {
    const ed = mount('<img src="https://example.com/a.png" data-caption="封面">')
    deepOptimizeDocument(ed)
    const image = ed.state.doc.firstChild
    expect(image?.attrs.caption).toBe('图 1：封面')
    expect(image?.attrs.captionBefore).toBe('封面')
    expect(collectSuggestionRanges(ed.state.doc).some((range) => range.structural === 'caption')).toBe(true)
    dispatchSuggestionDecision(ed, 'reject')
    expect(ed.state.doc.firstChild?.attrs.caption).toBe('封面')
    expect(ed.state.doc.firstChild?.attrs.captionBefore).toBeNull()
    deepOptimizeDocument(ed)
    dispatchSuggestionDecision(ed, 'accept')
    expect(ed.state.doc.firstChild?.attrs.caption).toBe('图 1：封面')
    expect(collectSuggestionRanges(ed.state.doc).some((range) => range.structural === 'caption')).toBe(false)
  })

  it('建议模式下套用图片组布局可拒绝', () => {
    const ed = mount(
      '<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="https://example.com/a.png"><img src="https://example.com/b.png"><img src="https://example.com/c.png"></div></div>',
    )
    let groupPos = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'imageGroup' && groupPos < 0) groupPos = pos
    })
    expect(setGroupLayout(ed.view, groupPos, '12', { suggest: true })).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('12')
    expect(ed.state.doc.firstChild?.attrs.layoutBefore).toBe('row')
    expect(collectSuggestionRanges(ed.state.doc).some((range) => range.authorName.includes('图片组改为 12'))).toBe(true)
    dispatchSuggestionDecision(ed, 'reject')
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('row')
    expect(ed.state.doc.firstChild?.attrs.layoutBefore).toBeNull()
  })

  it('直接编辑时题注立即生效，不留修订', () => {
    suggesting = false
    const ed = mount('<img src="https://example.com/a.png" data-caption="封面">')
    suggesting = false
    deepOptimizeDocument(ed)
    expect(ed.state.doc.firstChild?.attrs.caption).toBe('图 1：封面')
    expect(ed.state.doc.firstChild?.attrs.captionBefore).toBeNull()
    expect(collectSuggestionRanges(ed.state.doc)).toEqual([])
  })
})
