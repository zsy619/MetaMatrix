// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'
import { RteImage } from '../extensions/rteImage'
import { deepOptimizeDocument, tidyInlineText } from './rteDeepOptimize'
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

describe('行内整理', () => {
  it('收紧空格、重复标点和中英文间距', () => {
    const tidy = tidyInlineText('你好  世界！！Hello世界')
    expect(tidy.text).toBe('你好 世界！Hello 世界')
    expect(tidy.spaces).toBe(true)
    expect(tidy.punct).toBe(true)
    expect(tidy.gap).toBe(true)
  })

  it('网址本身不拆开，句子其余部分仍补间距', () => {
    expect(tidyInlineText('见https://a.com了解更多Hello世界').text).toBe('见https://a.com了解更多 Hello 世界')
  })

  it('全角空格收成普通空格', () => {
    expect(tidyInlineText('你好\u3000\u3000世界').text).toBe('你好 世界')
  })

  it('整段只有空白时清掉这段文字', () => {
    const ed = makeEditor('<p>   </p><p>留</p>')
    expect(() => deepOptimizeDocument(ed)).not.toThrow()
    expect(ed.getText()).toContain('留')
    expect(ed.getText().replace(/\s/g, '')).toBe('留')
  })

  it('汉字旁边的省略号和破折号收成中文形式', () => {
    expect(tidyInlineText('你好...世界').text).toBe('你好……世界')
    expect(tidyInlineText('你好--世界').text).toBe('你好——世界')
    expect(tidyInlineText('Hello...world').text).toBe('Hello...world')
  })

  it('去掉零宽字符、段首段尾空白，并收起汉字和标点之间的空格', () => {
    const tidy = tidyInlineText(' 你\u200b好 ，世界 ')
    expect(tidy.text).toBe('你好，世界')
    expect(tidy.invisible).toBe(true)
    expect(tidy.edge).toBe(true)
    expect(tidy.punct).toBe(true)
  })
})

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

  it('整理空格和标点，代码块保持原样', () => {
    const ed = makeEditor('<p></p>')
    ed.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '你好  世界！！Hello世界' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: '你好  世界' }] },
      ],
    })
    const result = deepOptimizeDocument(ed)
    const html = ed.getHTML()
    expect(html).toContain('你好 世界！Hello 世界')
    expect(html).toContain('你好  世界')
    expect(result.changes.some((item) => item.detail.includes('连续空格'))).toBe(true)
    expect(result.changes.some((item) => item.detail.includes('重复标点'))).toBe(true)
    expect(result.changes.some((item) => item.detail.includes('中英文间距'))).toBe(true)
    expect(result.lines.some((line) => line.text.includes('措辞、图表数据和评论保持原样'))).toBe(true)
    expect(ed.getHTML()).toContain('<pre><code>你好  世界</code></pre>')
  })

  it('无效列表序号改回 1，链接地址去掉两端空白', () => {
    const ed = makeEditor('<ol start="0"><li><p>甲</p></li></ol><p><a href="https://example.com">链</a></p>')
    let listPos = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'orderedList' && listPos < 0) listPos = pos
      if (!node.isText || node.text !== '链') return
      const link = node.marks.find((mark) => mark.type.name === 'link')
      if (!link) return
      ed.view.dispatch(
        ed.state.tr.addMark(pos, pos + node.nodeSize, link.type.create({ ...link.attrs, href: ' https://example.com ' })),
      )
    })
    const list = ed.state.doc.nodeAt(listPos)
    if (list) ed.view.dispatch(ed.state.tr.setNodeMarkup(listPos, undefined, { ...list.attrs, start: 0 }))
    const result = deepOptimizeDocument(ed)
    expect(ed.state.doc.nodeAt(listPos)?.attrs.start).toBe(1)
    expect(ed.getHTML()).toContain('href="https://example.com"')
    expect(ed.getHTML()).not.toContain('href=" https://example.com "')
    expect(result.changes.some((item) => item.detail.includes('无效列表序号'))).toBe(true)
    expect(result.changes.some((item) => item.detail.includes('链接地址两端'))).toBe(true)
  })

  it('没有替代文本时用题注补上', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const ed = new Editor({
      element: host,
      extensions: [StarterKit, RteImage.configure({ inline: false, allowBase64: true })],
      content: '<img src="https://example.com/a.png" data-caption="封面">',
    })
    editor = ed
    const result = deepOptimizeDocument(ed)
    expect(ed.state.doc.firstChild?.attrs.alt).toBe('封面')
    expect(ed.state.doc.firstChild?.attrs.caption).toBe('图 1：封面')
    expect(result.changes.some((item) => item.detail.includes('替代文本'))).toBe(true)
  })
})
