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
  it('可以直接改步骤名称、加一步，并从省略号复制', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit.configure({ link: false }), MermaidBlock],
      content: '<p></p>',
    })
    expect(editor.chain().focus('end').insertMermaidBlock().run()).toBe(true)
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    const inputs = [...host.querySelectorAll<HTMLInputElement>('.rte-mermaid-step input')]
    expect(inputs.map((input) => input.value)).toEqual(['开始', '处理', '结束'])
    inputs[0].value = '起步'
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.getHTML()).toContain('起步')
    const add = [...host.querySelectorAll('button')].find((button) => button.textContent === '加一步')
    add?.click()
    expect(editor.getHTML()).toContain('新步骤')
    const down = [...host.querySelectorAll('button')].find((button) => button.textContent === '纵向')
    down?.click()
    expect(editor.getHTML()).toContain('flowchart TD')
    const more = host.querySelector('.rte-mermaid-more')
    expect(more).toBeInstanceOf(HTMLButtonElement)
    ;(more as HTMLButtonElement).click()
    const labels = [...document.querySelectorAll('.rte-tabs-menu-item')].map((el) => el.textContent)
    expect(labels).toEqual(['复制', '删除'])
    const copy = [...document.querySelectorAll<HTMLButtonElement>('.rte-tabs-menu-item')].find(
      (el) => el.textContent === '复制',
    )
    copy?.click()
    expect(mermaidCount(editor)).toBe(2)
    expect(document.querySelector('.rte-tabs-menu')).toBeNull()
  })
})
