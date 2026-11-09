// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  TabPane,
  TabsBlock,
  addTabPane,
  moveTabPane,
  removeTabPane,
  renameTabPane,
} from './tabsBlock'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function titlesOf(ed: Editor): string[] {
  const titles: string[] = []
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'tabPane') titles.push(String(node.attrs.title))
  })
  return titles
}

function blockPos(ed: Editor): number {
  let pos = -1
  ed.state.doc.descendants((node, p) => {
    if (pos < 0 && node.type.name === 'tabsBlock') pos = p
  })
  return pos
}

function activeOf(ed: Editor): number {
  let active = -1
  ed.state.doc.descendants((node) => {
    if (active < 0 && node.type.name === 'tabsBlock') active = Number(node.attrs.active ?? 0)
  })
  return active
}

describe('多标签操作', () => {
  it('可以添加、改名、排序和删除', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, TabsBlock, TabPane],
      content: '<p></p>',
    })
    expect(editor.chain().focus('end').insertTabsBlock(['概览', '细节']).run()).toBe(true)
    const pos = blockPos(editor)
    const add = editor.state.tr
    expect(addTabPane(add, pos)).toBe(true)
    editor.view.dispatch(add)
    expect(titlesOf(editor)).toEqual(['概览', '细节', '新标签'])
    expect(activeOf(editor)).toBe(2)
    const names: string[] = []
    const $from = editor.state.selection.$from
    for (let depth = $from.depth; depth > 0; depth -= 1) names.push($from.node(depth).type.name)
    expect(names).toContain('tabPane')

    const rename = editor.state.tr
    expect(renameTabPane(rename, blockPos(editor), 2, '说明')).toBe(true)
    editor.view.dispatch(rename)
    expect(titlesOf(editor)).toEqual(['概览', '细节', '说明'])

    const move = editor.state.tr
    expect(moveTabPane(move, blockPos(editor), 2, 0)).toBe(true)
    editor.view.dispatch(move)
    expect(titlesOf(editor)).toEqual(['说明', '概览', '细节'])
    expect(activeOf(editor)).toBe(0)

    const remove = editor.state.tr
    expect(removeTabPane(remove, blockPos(editor), 0)).toBe(true)
    editor.view.dispatch(remove)
    expect(titlesOf(editor)).toEqual(['概览', '细节'])
    expect(activeOf(editor)).toBe(0)

    let left = blockPos(editor)
    editor.view.dispatch(editor.state.tr.setNodeMarkup(left, undefined, { active: 1 }))
    left = blockPos(editor)
    const once = editor.state.tr
    expect(removeTabPane(once, left, 0)).toBe(true)
    editor.view.dispatch(once)
    expect(titlesOf(editor)).toEqual(['细节'])
    const last = editor.state.tr
    expect(removeTabPane(last, blockPos(editor), 0)).toBe(true)
    editor.view.dispatch(last)
    expect(blockPos(editor)).toBe(-1)
  })
})
