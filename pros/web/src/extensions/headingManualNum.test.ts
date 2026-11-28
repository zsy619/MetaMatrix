// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HeadingManualNum, headingHasManualNumber } from './headingManualNum'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

describe('手写标题编号不叠自动编号', () => {
  it('认出「1.」和「1.2 」，普通标题不算', () => {
    expect(headingHasManualNumber('1. 概述')).toBe(true)
    expect(headingHasManualNumber('1.2 范围')).toBe(true)
    expect(headingHasManualNumber('概述')).toBe(false)
    expect(headingHasManualNumber('2024年')).toBe(false)
  })

  it('手写编号的标题带标记，普通标题不带', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, HeadingManualNum],
      content: '<h1>1. 概述</h1><h2>范围</h2>',
    })
    const headings = editor.view.dom.querySelectorAll('h1, h2')
    expect(headings[0]?.getAttribute('data-manual-num')).toBe('1')
    expect(headings[1]?.hasAttribute('data-manual-num')).toBe(false)
  })
})
