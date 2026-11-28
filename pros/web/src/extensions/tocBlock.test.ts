// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlockIdentity } from './blockIdentity'
import { TocBlock } from './tocBlock'
import { outlineFromPmDoc } from '../utils/rteOutline'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function makeEditor(html: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false, undoRedo: false }), BlockIdentity, TocBlock],
    content: html,
  })
  editors.push(editor)
  return { host, editor }
}

describe('TocBlock', () => {
  it('同步标题并带上 data-block-id，点击条目跳到对应标题', () => {
    const { host, editor } = makeEditor(
      '<h2 data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">甲</h2><p>段</p><h2 data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">乙</h2>',
    )
    expect(editor.commands.insertToc()).toBe(true)
    const items = outlineFromPmDoc(editor.state.doc)
    const toc = host.querySelector('nav[data-type="toc"]')
    expect(toc).not.toBeNull()
    const buttons = [...host.querySelectorAll('.rte-toc-item')] as HTMLElement[]
    expect(buttons.map((el) => el.textContent)).toEqual(['甲', '乙'])
    const target = items.find((item) => item.text === '乙')
    expect(buttons[1]?.getAttribute('data-block-id')).toBe(target?.blockId || null)
    buttons[1]?.click()
    const $pos = editor.state.doc.resolve(editor.state.selection.from)
    let heading = ''
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d).type.name === 'heading') heading = $pos.node(d).textContent
    }
    expect(heading).toBe('乙')
  })
})
