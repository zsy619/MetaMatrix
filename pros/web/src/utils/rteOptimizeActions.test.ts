// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { continueOrderedList, promoteTableHeader } from './rteOptimizeActions'
import { ImageGroup } from '../extensions/imageGroup'
import { setGroupLayout } from '../extensions/imageGroupOps'
import { RteImage } from '../extensions/rteImage'
import { deepOptimizeDocument } from './rteDeepOptimize'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor(content: string, withTable = false) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      ...(withTable
        ? [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell]
        : []),
      RteImage.configure({ inline: false, allowBase64: true }),
      ImageGroup,
    ],
    content,
  })
  return editor
}

describe('优化动作', () => {
  it('有序列表接上上一段的编号', () => {
    const ed = makeEditor('<ol><li><p>甲</p></li><li><p>乙</p></li></ol><ol><li><p>丙</p></li></ol>')
    let listPos = 0
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'orderedList') listPos = pos
    })
    expect(continueOrderedList(ed.view, listPos)).toBe(true)
    expect(ed.getHTML()).toContain('start="3"')
  })

  it('第一行可以标成表头', () => {
    const ed = makeEditor('<table><tbody><tr><td><p>名称</p></td><td><p>数量</p></td></tr></tbody></table>', true)
    let tablePos = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table' && tablePos < 0) tablePos = pos
    })
    expect(tablePos).toBeGreaterThanOrEqual(0)
    expect(promoteTableHeader(ed.view, tablePos)).toBe(true)
    expect(ed.getHTML()).toContain('<th')
  })

  it('两张图可以排成上下两行', () => {
    const ed = makeEditor(
      '<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="https://example.com/a.png" alt="甲"><img src="https://example.com/b.png" alt="乙"></div></div>',
    )
    const result = deepOptimizeDocument(ed)
    const line = result.lines.find((item) => item.actions?.some((action) => action.id === 'layoutRows'))
    expect(line?.text).toContain('上下')
    expect(setGroupLayout(ed.view, line!.actions![0]!.pos, 'rows')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('rows')
    const row = ed.view.dom.querySelector('.rte-image-group-row') as HTMLElement
    expect(row.style.flexDirection).toBe('column')
  })

  it('报告开头写出自动处理和待处理的数量', () => {
    const ed = makeEditor('<p>你好  世界</p>')
    const result = deepOptimizeDocument(ed)
    expect(result.lines[0]?.text.startsWith('优化报告：')).toBe(true)
    expect(result.lines[0]?.done).toBe(true)
  })
})
