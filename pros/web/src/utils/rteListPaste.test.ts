// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
import { RteImage } from '../extensions/rteImage'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { retargetList } from './rteListContinue'
import { pasteTsvIntoTable } from './rteRound7'
import { sanitizePastedHtml, unwrapSinglePastedList } from './rtePasteClean'
import { keepCropOnReplace } from './rteImageCrop'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content: string, extra: unknown[] = []) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit, ListStyleAttrs, ...extra],
    content,
  })
  return editor
}

describe('列表、表格粘贴和换图', () => {
  it('有序列表改成无序列表时文字还在，编号样式和缩进分开', () => {
    const ed = mount('<ol start="3" data-list-style="lower-alpha"><li><p>甲</p></li></ol>')
    ed.commands.setTextSelection(2)
    expect(retargetList(ed, 'bulletList')).toBe(true)
    expect(ed.getHTML()).toContain('<ul>')
    expect(ed.getHTML()).toContain('甲')
    expect(ed.getHTML()).not.toContain('<ol')
    ed.commands.setTextSelection(2)
    expect(ed.commands.padListItem(1)).toBe(true)
    expect(ed.getHTML()).toContain('data-pad="1"')
    expect(ed.getHTML()).not.toContain('data-list-style')
  })

  it('列表里再粘贴列表时拆掉外层', () => {
    expect(unwrapSinglePastedList('<ul><li>甲</li><li>乙</li></ul>')).toContain('<li>甲</li>')
    expect(unwrapSinglePastedList('<p>甲</p><ul><li>乙</li></ul>')).toContain('<p>甲</p>')
  })

  it('粘贴表格丢掉命名空间，留下合并和文字，并收起重复图号', async () => {
    const html = sanitizePastedHtml(
      '<p><o:p>甲</o:p></p><table xmlns:w="urn:schemas-microsoft-com:office:word"><tr><td colspan="2">合并</td></tr></table>' +
        '<img src="data:image/png;base64,aaaa" alt="图"><p>图 1 销售趋势</p><nav>导航</nav>',
    )
    expect(html).toContain('甲')
    expect(html).toContain('colspan="2"')
    expect(html).toContain('合并')
    expect(html).not.toContain('xmlns')
    expect(html).not.toContain('<nav')
    expect(html).toContain('data-caption="销售趋势"')
    expect(html).not.toContain('图 1')
    const wrapped = sanitizePastedHtml(
      '<p><img src="https://example.com/a.png" alt="趋势"></p><p>图 1 销售趋势</p>',
    )
    expect(wrapped).toContain('data-caption="销售趋势"')
    expect(wrapped).not.toContain('图 1')
    const figure = sanitizePastedHtml(
      '<figure><img src="https://example.com/b.png" alt="章节"><figcaption>图 2-1：季度对比</figcaption></figure>',
    )
    expect(figure).toContain('data-caption="季度对比"')
    expect(figure).not.toContain('图 2-1')
    const ed = mount(wrapped, [RteImage.configure({ inline: false, allowBase64: true })])
    let caption = ''
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'image') caption = String(node.attrs.caption || '')
    })
    expect(caption).toBe('销售趋势')
    await new Promise((resolve) => queueMicrotask(resolve))
    const group = sanitizePastedHtml(
      '<div data-type="image-group" data-layout="mix" data-ratios="1,2,1" data-stack-at="1" data-stack-side="right"><img src="data:image/png;base64,aaaa" alt="甲"></div>',
    )
    expect(group).toContain('data-type="image-group"')
    expect(group).toContain('data-layout="mix"')
    expect(group).toContain('data-ratios="1,2,1"')
    expect(group).toContain('data-stack-side="right"')
  })

  it('光标在表格里时按制表符填格，日期列仍是日期', () => {
    const ed = mount('<table><tbody><tr><th><p>日期</p></th><th><p>数量</p></th></tr><tr><td><p></p></td><td><p></p></td></tr></tbody></table>', [
      Table.configure({ resizable: false }),
      TableRow,
      RteTableHeader,
      RteTableCell,
    ])
    let pos = -1
    ed.state.doc.descendants((node, at) => {
      if (pos < 0 && node.type.name === 'tableCell') pos = at + 2
    })
    ed.commands.setTextSelection(pos)
    expect(pasteTsvIntoTable(ed, '44927\t8')).toBe(true)
    expect(ed.getText()).toContain('2023-01-01')
    expect(ed.getText()).toContain('8')
  })

  it('合并单元格后粘贴按屏幕上的列填入', () => {
    const ed = mount(
      `<table><tbody>
        <tr><td colspan="2"><p>合</p></td><td><p>右</p></td></tr>
        <tr><td><p>a</p></td><td><p>b</p></td><td><p>c</p></td></tr>
      </tbody></table>`,
      [Table.configure({ resizable: false }), TableRow, RteTableHeader, RteTableCell],
    )
    let pos = -1
    ed.state.doc.descendants((node, at) => {
      if (pos < 0 && node.type.name === 'tableCell' && node.textContent === '合') pos = at + 2
    })
    ed.commands.setTextSelection(pos)
    expect(pasteTsvIntoTable(ed, '甲\t乙')).toBe(true)
    const texts: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') texts.push(node.textContent)
    })
    expect(texts).toEqual(['甲', '乙', 'a', 'b', 'c'])

    let left = -1
    ed.state.doc.descendants((node, at) => {
      if (left < 0 && node.type.name === 'tableCell' && node.textContent === 'a') left = at + 2
    })
    ed.commands.setTextSelection(left)
    expect(pasteTsvIntoTable(ed, '"甲\t内"\t乙\t丙')).toBe(true)
    const next: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') next.push(node.textContent)
    })
    expect(next).toEqual(['甲', '乙', '甲\t内', '乙', '丙'])
  })

  it('换图保留题注、裁剪和替代文本', () => {
    const next = keepCropOnReplace(
      { src: 'old', alt: '旧图', caption: '图注', cropAspect: '1', cropZoom: 1.2 },
      'new',
    )
    expect(next.src).toBe('new')
    expect(next.alt).toBe('旧图')
    expect(next.caption).toBe('图注')
    expect(next.cropAspect).toBe('1')
    expect(next.cropZoom).toBe(1.2)
  })
})
