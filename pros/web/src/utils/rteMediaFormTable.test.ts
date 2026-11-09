// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteImage } from '../extensions/rteImage'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { FormExtensions, collectFormIssues, duplicateFormNode, nextFormFieldName } from '../extensions/forms'
import { duplicateTableRow, equalizeTableColumns } from './rteTableLayout'

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(extensions: Editor['options']['extensions'], content = '<p>前</p>') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({ element: host, extensions, content })
  return editor
}

describe('图片题注', () => {
  it('题注显示在图片下方', () => {
    const ed = mount([
      StarterKit.configure({ dropcursor: false }),
      RteImage.configure({ inline: false, allowBase64: true }),
    ])
    ed.chain().focus('end').setImage({ src: PIXEL, alt: '左图' }).run()
    ed.chain().focus().updateAttributes('image', { caption: '左边说明' }).run()
    const caption = ed.view.dom.querySelector('.rte-image-caption')
    expect(caption?.textContent).toBe('左边说明')
  })
})

describe('表格行和列宽', () => {
  it('复制当前行，并把各列收成同样宽度', () => {
    const ed = mount([
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      RteTableHeader,
      RteTableCell,
    ])
    expect(ed.chain().focus('end').insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()).toBe(true)
    let cellPos = -1
    ed.state.doc.descendants((node, pos) => {
      if (cellPos >= 0) return false
      if (node.type.name !== 'tableCell') return
      cellPos = pos
      return false
    })
    const inside = cellPos + 2
    const tr = ed.state.tr.insertText('甲', inside)
    ed.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, inside + 1)))
    const before = ed.getHTML().match(/<tr/g)?.length || 0
    expect(duplicateTableRow(ed)).toBe(true)
    expect(ed.getHTML().match(/<tr/g)?.length).toBe(before + 1)
    expect(ed.getHTML().split('甲').length - 1).toBe(2)
    expect(equalizeTableColumns(ed, 140)).toBe(true)
    expect(ed.getHTML()).toContain('colwidth="140"')
    expect(equalizeTableColumns(ed, 140)).toBe(false)
  })
})

describe('表单检查和复制', () => {
  it('空的必填项会被点名，复制字段时名字错开', () => {
    expect(nextFormFieldName('title')).toBe('title_2')
    expect(nextFormFieldName('title_2')).toBe('title_3')
    const ed = mount([StarterKit, ...FormExtensions])
    expect(ed.chain().focus('end').insertFormTextInput({ name: 'title', label: '标题', value: '', required: true }).run()).toBe(true)
    const issues = collectFormIssues(ed.state.doc)
    expect(issues.map((issue) => issue.label)).toEqual(['标题'])
    expect(issues[0]?.reason).toBe('必填未填')
    expect(duplicateFormNode(ed, issues[0]!.pos)).toBe(true)
    const names: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'formTextInput') names.push(String(node.attrs.name))
    })
    expect(names).toEqual(['title', 'title_2'])
  })
})
