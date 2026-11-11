// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Ruby } from './ruby'
import { TianziGrid, tianziCharKey } from './rteTianziGrid'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit, Ruby, TianziGrid],
    content,
  })
  return editor
}

describe('拼音田字格', () => {
  it('打开后每个字占一格，注音写在这一格上', () => {
    const ed = mount('<p>汉字</p>')
    ed.commands.setTextSelection({ from: 1, to: 2 })
    ed.commands.setRuby('hàn')
    ed.view.dispatch(ed.state.tr.setMeta(tianziCharKey, true))
    const cells = [...ed.view.dom.querySelectorAll('.rte-tianzi-char')]
    expect(cells.map((cell) => cell.textContent)).toEqual(['汉', '字'])
    expect(cells[0]?.getAttribute('data-ruby')).toBe('hàn')
    expect(cells[1]?.hasAttribute('data-ruby')).toBe(false)
  })

  it('关掉田字格后不再包格子', () => {
    const ed = mount('<p>字</p>')
    ed.view.dispatch(ed.state.tr.setMeta(tianziCharKey, true))
    expect(ed.view.dom.querySelectorAll('.rte-tianzi-char').length).toBe(1)
    ed.view.dispatch(ed.state.tr.setMeta(tianziCharKey, false))
    expect(ed.view.dom.querySelectorAll('.rte-tianzi-char').length).toBe(0)
  })
})