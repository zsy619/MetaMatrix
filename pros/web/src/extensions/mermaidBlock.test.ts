// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MermaidBlock } from './mermaidBlock'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.querySelector('.rte-tabs-menu')?.remove()
})

function mermaidCount(ed: Editor) {
  let count = 0
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'mermaidBlock') count += 1
  })
  return count
}

describe('流程图菜单', () => {
  it('左侧省略号里可以添加流程图', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit.configure({ link: false }), MermaidBlock],
      content: '<p></p>',
    })
    expect(editor.chain().focus('end').insertMermaidBlock().run()).toBe(true)
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const more = host.querySelector('.rte-mermaid-more')
    expect(more).toBeInstanceOf(HTMLButtonElement)
    ;(more as HTMLButtonElement).click()
    const labels = [...document.querySelectorAll('.rte-tabs-menu-item')].map((el) => el.textContent)
    expect(labels).toEqual(['添加', '删除'])
    const add = [...document.querySelectorAll<HTMLButtonElement>('.rte-tabs-menu-item')].find(
      (el) => el.textContent === '添加',
    )
    add?.click()
    expect(mermaidCount(editor)).toBe(2)
    expect(document.querySelector('.rte-tabs-menu')).toBeNull()
  })
})
