// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import StarterKit from '@tiptap/starter-kit'
import { SuggestionDelete, SuggestionInsert } from './suggestionMarks'
import { dispatchSuggestionDecision } from '../utils/rteSuggestions'
import { BlockIdentity, collectIdentityNodes, readBlockId } from './blockIdentity'
import { DATABASE_BLOCK_NAME, DatabaseBlock } from './databaseBlock'
import { payloadFromAttrs, firstFilterableField } from './databaseBlockSheet'
import {
  BlockPermissionGuard,
  canEditRange,
  setBlockPermissionGuardState,
} from './blockPermissionGuard'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content = '<p></p>') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      BlockIdentity,
      DatabaseBlock,
      SuggestionInsert,
      SuggestionDelete,
      BlockPermissionGuard,
    ],
    content,
  })
  return editor
}

function paragraphId(ed: Editor, index = 0) {
  const rows = collectIdentityNodes(ed.state.doc).filter(({ node }) => node.type.name === 'paragraph')
  return { ...rows[index]!, id: readBlockId(rows[index]!.node) }
}

describe('编辑器内块级只读', () => {
  it('readonly 块不能改内容或删除，旁路块仍可改', () => {
    const ed = mount('<p>锁定这段</p><p>可以改</p>')
    const locked = paragraphId(ed, 0)
    const open = paragraphId(ed, 1)
    expect(locked.id).toBeTruthy()
    setBlockPermissionGuardState(ed, {
      role: 'owner',
      canWrite: true,
      permissions: { [locked.id!]: 'readonly' },
    })
    ed.chain().setTextSelection(locked.pos + 1).insertContent('非法').run()
    expect(ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n')).toContain('锁定这段')
    expect(ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n')).not.toContain('非法')

    const before = ed.state.doc.nodeSize
    ed.chain().setNodeSelection(locked.pos).deleteSelection().run()
    expect(ed.state.doc.nodeSize).toBe(before)
    expect(readBlockId(ed.state.doc.nodeAt(locked.pos)!)).toBe(locked.id)

    ed.chain().setTextSelection(open.pos + 1).insertContent('已改').run()
    expect(ed.state.doc.textContent).toContain('已改')
  })

  it('无 canWrite 时不能改任何带身份的块', () => {
    const ed = mount('<p>正文</p>')
    const row = paragraphId(ed, 0)
    setBlockPermissionGuardState(ed, { role: 'viewer', canWrite: false, permissions: {} })
    expect(canEditRange(ed, row.pos + 1, row.pos + 2)).toBe(false)
    ed.chain().setTextSelection(row.pos + 1).insertContent('x').run()
    expect(ed.state.doc.textContent).toBe('正文')
  })

  it('建议模式接受/拒绝不能改只读块，但可处理未锁定块', () => {
    const ed = mount('<p>锁定</p><p>开放</p>')
    const locked = paragraphId(ed, 0)
    const open = paragraphId(ed, 1)
    const insert = ed.schema.marks.suggestionInsert
    const tr = ed.state.tr
      .addMark(locked.pos + 1, locked.pos + 1 + '锁定'.length, insert.create({ id: 's-lock', authorId: 'a', authorName: 'A' }))
      .addMark(open.pos + 1, open.pos + 1 + '开放'.length, insert.create({ id: 's-open', authorId: 'a', authorName: 'A' }))
    ed.view.dispatch(tr)
    setBlockPermissionGuardState(ed, {
      role: 'editor',
      canWrite: true,
      permissions: { [locked.id!]: 'readonly' },
    })
    expect(dispatchSuggestionDecision(ed, 'accept')).toBe(true)
    const html = ed.getHTML()
    expect(html).toContain('data-suggestion="insert"')
    expect(html).toContain('s-lock')
    expect(html).not.toContain('s-open')
  })

  it('只读数据库块不能改单元格', () => {
    const ed = mount()
    ed.commands.insertDatabaseBlock({ title: '表' })
    const row = collectIdentityNodes(ed.state.doc).find(({ node }) => node.type.name === DATABASE_BLOCK_NAME)!
    const id = readBlockId(row.node)
    const payload = payloadFromAttrs(row.node.attrs)
    const field = firstFilterableField(payload)!
    const target = payload.sheet.rows[0]!
    setBlockPermissionGuardState(ed, {
      role: 'owner',
      canWrite: true,
      permissions: { [id!]: 'readonly' },
    })
    expect(ed.commands.updateDatabaseBlockCell(target.id, field.id, '不该写进去')).toBe(true)
    const after = payloadFromAttrs(collectIdentityNodes(ed.state.doc).find(({ node }) => node.type.name === DATABASE_BLOCK_NAME)!.node.attrs)
    expect(after.sheet.rows[0]!.cells[field.id]).not.toBe('不该写进去')
    expect(after.sheet.rows[0]!.cells[field.id]).toBe(payload.sheet.rows[0]!.cells[field.id])
  })

  it('协同远端更新仍可写入只读块，不把协同收包挡掉', () => {
    const ed = mount('<p>锁定这段</p>')
    const locked = paragraphId(ed, 0)
    setBlockPermissionGuardState(ed, {
      role: 'owner',
      canWrite: true,
      permissions: { [locked.id!]: 'readonly' },
    })
    const tr = ed.state.tr.insertText('远端', locked.pos + 1)
    tr.setMeta(ySyncPluginKey, { isChangeOrigin: true })
    ed.view.dispatch(tr)
    expect(ed.state.doc.textContent).toContain('远端')
  })
})
