// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'
import { Spoiler } from '../extensions/spoiler'
import { numberLines, panguSpace, squeezeSpaces, toFullWidth, toHalfWidth, uniqueLines } from './rteTextTidy'
import { applyTextTidy, spoilerRangeAt } from './rteTextPlay'
import { clearEditorFormat } from './rteClearFormat'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), ParagraphAttrs, Spoiler],
    content,
  })
  return editor
}

describe('文字整理', () => {
  it('全半角、中英文空格和多余空格按字符改写', () => {
    expect(toHalfWidth('ＡＢｃ　１２！')).toBe('ABc 12!')
    expect(toFullWidth('Ab 1!')).toBe('Ａｂ　１！')
    expect(panguSpace('使用Vue3和2026年')).toBe('使用 Vue3 和 2026 年')
    expect(panguSpace('使用 Vue3')).toBe('使用 Vue3')
    expect(squeezeSpaces('a  \u3000 b')).toBe('a b')
    expect(uniqueLines('甲\n乙\n甲')).toBe('甲\n乙')
    expect(numberLines('甲\n\n乙')).toBe('1. 甲\n\n2. 乙')
  })

  it('没选中时整理当前段，多段可以排序和去重', () => {
    const ed = makeEditor('<p>使用Vue3</p><p>香蕉</p><p>苹果</p><p>香蕉</p>')
    ed.commands.setTextSelection(2)
    expect(applyTextTidy(ed, 'pangu')).toBe('applied')
    expect(ed.getText()).toContain('使用 Vue3')
    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 })
    expect(applyTextTidy(ed, 'sortLines')).toBe('applied')
    const afterSort = ed.getText().split('\n').map((line) => line.trim()).filter(Boolean)
    expect(afterSort).toEqual(['苹果', '使用 Vue3', '香蕉', '香蕉'])
    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 })
    expect(applyTextTidy(ed, 'uniqueLines')).toBe('applied')
    expect(ed.getText().split('\n').map((line) => line.trim()).filter(Boolean)).toEqual(['苹果', '使用 Vue3', '香蕉'])
    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 })
    expect(applyTextTidy(ed, 'numberLines')).toBe('applied')
    expect(ed.getText()).toContain('1. 苹果')
    expect(ed.getText()).toContain('3. 香蕉')
  })

  it('只有一段时排序会要求选中多段', () => {
    const ed = makeEditor('<p>只有一段</p>')
    ed.commands.setTextSelection({ from: 1, to: 5 })
    expect(applyTextTidy(ed, 'sortLines')).toBe('need-lines')
  })
})

describe('揭晓文字和首字下沉', () => {
  it('揭晓文字可以切换，点击范围盖住整段标记', () => {
    const ed = makeEditor('<p>答案在这里</p>')
    ed.commands.setTextSelection({ from: 1, to: 3 })
    expect(ed.commands.toggleSpoiler()).toBe(true)
    expect(ed.getHTML()).toContain('rte-spoiler')
    expect(ed.getHTML()).toContain('data-revealed="0"')
    const range = spoilerRangeAt(ed.state.doc, 2)
    expect(range?.from).toBe(1)
    expect(range?.to).toBe(3)
    expect(range?.revealed).toBe(false)
  })

  it('首字下沉写在段落上，清除格式会去掉', () => {
    const ed = makeEditor('<p>段落开头</p>')
    ed.commands.setTextSelection(2)
    expect(ed.commands.toggleDropCap()).toBe(true)
    expect(ed.getHTML()).toContain('data-drop-cap="1"')
    expect(ed.getHTML()).toContain('rte-drop-cap')
    ed.commands.setTextSelection({ from: 1, to: 5 })
    expect(clearEditorFormat(ed)).toBe(true)
    expect(ed.getHTML()).not.toContain('data-drop-cap')
  })
})
