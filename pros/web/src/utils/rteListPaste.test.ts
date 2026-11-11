// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
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

  it('粘贴表格丢掉命名空间，留下合并和文字，并收起重复图号', () => {
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
