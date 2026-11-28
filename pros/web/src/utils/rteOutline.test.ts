// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlockIdentity } from '../extensions/blockIdentity'
import {
  findOutlineElement,
  outlineFromHTML,
  outlineFromPmDoc,
  selectOutlineHeading,
} from './rteOutline'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

describe('outlineFromHTML', () => {
  it('抽出 h1–h6 与 data-block-id，跳过空标题', () => {
    const html =
      '<h1 data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">一级</h1>' +
      '<h2 id="sec">二级</h2><h5 data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">五级</h5>' +
      '<h3>   </h3>'
    const items = outlineFromHTML(html)
    expect(items).toEqual([
      { level: 1, text: '一级', blockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { level: 2, text: '二级', htmlId: 'sec' },
      { level: 5, text: '五级', blockId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ])
  })
})

describe('大纲跳转', () => {
  it('优先按块身份定位，重名标题不会跳错', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.innerHTML =
      '<h2 data-block-id="id-a">相同</h2><h2 data-block-id="id-b">相同</h2>'
    const el = findOutlineElement(host, { level: 2, text: '相同', blockId: 'id-b' })
    expect(el).not.toBeNull()
    expect(el?.getAttribute('data-block-id')).toBe('id-b')
  })

  it('在编辑器里把光标移到对应标题', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor({
      element: host,
      extensions: [StarterKit.configure({ dropcursor: false, undoRedo: false }), BlockIdentity],
      content:
        '<h2 data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">甲</h2><p>段</p><h2 data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">乙</h2>',
    })
    editors.push(editor)
    const items = outlineFromPmDoc(editor.state.doc)
    const target = items.find((item) => item.text === '乙')
    expect(target?.blockId).toBeTruthy()
    expect(selectOutlineHeading(editor, target!)).toBe(true)
    const $pos = editor.state.doc.resolve(editor.state.selection.from)
    let heading = ''
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d).type.name === 'heading') heading = $pos.node(d).textContent
    }
    expect(heading).toBe('乙')
  })
})
