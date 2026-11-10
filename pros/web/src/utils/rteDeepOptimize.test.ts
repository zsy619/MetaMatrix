// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'
import { deepOptimizeDocument } from './rteDeepOptimize'
import { filterFindMatches } from './rteFindReplace'

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
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      ParagraphAttrs,
    ],
    content,
  })
  return editor
}

describe('深度优化', () => {
  it('一次整理跳级标题、首行缩进、不安全链接和连续空段', () => {
    const ed = makeEditor(
      [
        '<h1>甲</h1>',
        '<h3 data-text-indent="2em">乙</h3>',
        '<p></p><p></p><p></p><p>留</p>',
        '<ul><li><p data-text-indent="2em">列表</p></li></ul>',
        '<p><a href="javascript:alert(1)">点我</a></p>',
        '<p data-text-indent="2em">正文缩进</p>',
      ].join(''),
    )
    const link = ed.schema.marks.link
    if (!link) throw new Error('缺少链接标记')
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText || node.text !== '点我') return
      ed.view.dispatch(ed.state.tr.addMark(pos, pos + node.nodeSize, link.create({ href: 'javascript:alert(1)' })))
    })
    const result = deepOptimizeDocument(ed)
    const html = ed.getHTML()
    expect(html).toContain('<h2')
    expect(html).not.toContain('<h3')
    expect(html.match(/<p><\/p>/g)?.length ?? 0).toBe(1)
    expect(html).not.toContain('<a')
    expect(html).toContain('正文缩进')
    expect(html).toContain('data-text-indent="2em"')
    expect(html).not.toContain('<li><p data-text-indent')
    expect(result.changes.length).toBeGreaterThan(0)
    ed.commands.undo()
    expect(ed.getHTML()).toContain('<h3')
    expect(ed.getHTML()).toContain('<a')
  })

  it('查找可以只留在标题里', () => {
    const ed = makeEditor('<h1>苹果</h1><p>苹果</p>')
    const all: Array<{ from: number; to: number }> = []
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const index = node.text.indexOf('苹果')
      if (index >= 0) all.push({ from: pos + index, to: pos + index + 2 })
    })
    expect(all).toHaveLength(2)
    expect(filterFindMatches(ed.state.doc, all, 'heading')).toHaveLength(1)
    expect(filterFindMatches(ed.state.doc, all, 'all')).toHaveLength(2)
  })
})
