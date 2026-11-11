// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Columns, Column, columnsFrameVars } from './columns'
import { RteHorizontalRule } from './rteHorizontalRule'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ horizontalRule: false }),
      Columns,
      Column,
      RteHorizontalRule,
    ],
    content: '<p>甲</p>',
  })
  return editor
}

describe('分栏末列横线', () => {
  it('最后一列插入横线后，光标留在这一栏后面的空段里', () => {
    const ed = mount()
    ed.commands.setColumns(3)
    let lastColumnPara = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'column') return
      node.descendants((child, rel) => {
        if (child.type.name === 'paragraph') lastColumnPara = pos + 1 + rel
      })
    })
    expect(lastColumnPara).toBeGreaterThan(0)
    ed.commands.setTextSelection(lastColumnPara + 1)
    expect(ed.commands.insertHorizontalRule()).toBe(true)
    const { $from } = ed.state.selection
    expect($from.parent.isTextblock, ed.getHTML() + ' @' + $from.parent.type.name).toBe(true)
    let column = null as { type: { name: string }; lastChild: { type: { name: string } } | null } | null
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === 'column') column = $from.node(depth) as never
    }
    expect(column?.type.name, ed.getHTML()).toBe('column')
    expect(column?.lastChild?.type.name).toBe('paragraph')
    const html = ed.getHTML()
    const columns = html.split('data-type="column"').length - 1
    expect(columns).toBe(3)
    expect(html).toContain('<hr')
  })

  it('分栏外框样式写进变量', () => {
    expect(columnsFrameVars({ borderStyle: 'solid', borderWidth: 2, borderColor: '#112233', radius: 12, gap: 8 })).toContain('--rte-col-border:2px solid #112233')
    expect(columnsFrameVars({ borderStyle: 'none' })).toContain('--rte-col-border:none')
    expect(columnsFrameVars({ radius: 12 })).toContain('--rte-col-radius:12px')
  })
})
