// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { BlockIdentity, collectIdentityNodes, readBlockId } from './blockIdentity'
import { DATABASE_BLOCK_NAME, DatabaseBlock } from './databaseBlock'
import { firstFilterableField, payloadFromAttrs } from './databaseBlockSheet'
import { applyRemoteUpdate } from '../components/knowledge/collab/yDocCollab'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function mountCollab(doc: Y.Doc) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false, undoRedo: false }),
      BlockIdentity,
      DatabaseBlock,
      Collaboration.configure({ document: doc }),
    ],
  })
  editors.push(editor)
  return editor
}

function databaseNode(ed: Editor) {
  return collectIdentityNodes(ed.state.doc).find(({ node }) => node.type.name === DATABASE_BLOCK_NAME)
}

describe('databaseBlock 块内协同', () => {
  it('双编辑器改同一块不丢稳定 data-block-id', () => {
    const yA = new Y.Doc()
    const edA = mountCollab(yA)
    edA.commands.insertDatabaseBlock({ title: '协同表' })
    const first = databaseNode(edA)
    expect(first).toBeTruthy()
    const id = readBlockId(first!.node)
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)

    const yB = new Y.Doc()
    applyRemoteUpdate(yB, Y.encodeStateAsUpdate(yA))
    const edB = mountCollab(yB)
    expect(readBlockId(databaseNode(edB)!.node)).toBe(id)

    const payload = payloadFromAttrs(databaseNode(edB)!.node.attrs)
    const field = firstFilterableField(payload)!
    const row = payload.sheet.rows[0]!
    expect(edB.commands.updateDatabaseBlockCell(row.id, field.id, '协同改名')).toBe(true)
    expect(edB.commands.setDatabaseBlockView('kanban')).toBe(true)
    expect(readBlockId(databaseNode(edB)!.node)).toBe(id)

    applyRemoteUpdate(yA, Y.encodeStateAsUpdate(yB))
    const after = databaseNode(edA)!
    expect(readBlockId(after.node)).toBe(id)
    const synced = payloadFromAttrs(after.node.attrs)
    expect(synced.sheet.rows[0]!.cells[field.id]).toBe('协同改名')
    expect(synced.sheet.views.find((view) => view.id === synced.activeViewId)?.type).toBe('kanban')
    const idsA = collectIdentityNodes(edA.state.doc).map(({ node }) => readBlockId(node))
    const idsB = collectIdentityNodes(edB.state.doc).map(({ node }) => readBlockId(node))
    expect(idsA).toEqual(idsB)
  })
})
