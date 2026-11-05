// @vitest-environment happy-dom
/** Markdown 输入规则：逐字键入触发、代码内不触发、undoInputRule 一次撤回。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { RteCodeBlockLowlight } from './codeHighlight'
import { RteHorizontalRule } from './rteHorizontalRule'
import { RteBlockquote } from './rteBlockquote'
import { RteMarkdownInputRules } from './rteMarkdownInputRules'

let editor: Editor | undefined
afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function makeEditor(content = '<p></p>') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ codeBlock: false, blockquote: false, horizontalRule: false, link: false, underline: false }),
      RteCodeBlockLowlight,
      RteBlockquote,
      RteHorizontalRule,
      TaskList,
      TaskItem.configure({ nested: true }),
      RteMarkdownInputRules,
    ],
    content,
  })
  return editor
}

/** 模拟逐字键入：先让 handleTextInput（输入规则）处理，未处理则直接插入。 */
function type(ed: Editor, text: string) {
  for (const ch of text) {
    const { view } = ed
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to))
  }
}

const first = (ed: Editor) => ed.state.doc.firstChild!

describe('rteMarkdownInputRules', () => {
  it.each([1, 2, 3, 4, 5, 6])('%i 个 # + 空格 → H%i', (n) => {
    const ed = makeEditor()
    type(ed, '#'.repeat(n) + ' 标题')
    expect(first(ed).type.name).toBe('heading')
    expect(first(ed).attrs.level).toBe(n)
    expect(first(ed).textContent).toBe('标题')
  })

  it('####### 不触发', () => {
    const ed = makeEditor()
    type(ed, '####### x')
    expect(first(ed).type.name).toBe('paragraph')
  })

  it.each(['-', '*', '+'])('%s + 空格 → 无序列表', (m) => {
    const ed = makeEditor()
    type(ed, `${m} 项`)
    expect(first(ed).type.name).toBe('bulletList')
    expect(first(ed).textContent).toBe('项')
  })

  it('1. 空格 → 有序列表', () => {
    const ed = makeEditor()
    type(ed, '1. 项')
    expect(first(ed).type.name).toBe('orderedList')
    expect(first(ed).attrs.start).toBe(1)
  })

  it.each([
    ['[] ', false],
    ['[ ] ', false],
    ['[x] ', true],
  ])('%s → 待办 checked=%s', (m, checked) => {
    const ed = makeEditor()
    type(ed, `${m}事项`)
    expect(first(ed).type.name).toBe('taskList')
    expect(first(ed).firstChild!.attrs.checked).toBe(checked)
    expect(first(ed).textContent).toBe('事项')
  })

  it('> 空格 → 引用', () => {
    const ed = makeEditor()
    type(ed, '> 引文')
    expect(first(ed).type.name).toBe('blockquote')
  })

  it('``` 空格 → 代码块；```ts 带语言', () => {
    const ed = makeEditor()
    type(ed, '``` ')
    expect(first(ed).type.name).toBe('codeBlock')
    expect(first(ed).attrs.language).toBeNull()
    editor!.destroy()
    const ed2 = makeEditor()
    type(ed2, '```ts ')
    expect(first(ed2).type.name).toBe('codeBlock')
    expect(first(ed2).attrs.language).toBe('ts')
  })

  it.each(['---', '*** '])('%s → 分割线', (m) => {
    const ed = makeEditor()
    type(ed, m)
    expect(first(ed).type.name).toBe('horizontalRule')
  })

  it('只在段首触发：段中输入 "# " 不转换', () => {
    const ed = makeEditor('<p>前文</p>')
    ed.commands.setTextSelection(3)
    type(ed, ' # - > ``` ---')
    expect(first(ed).type.name).toBe('paragraph')
    expect(ed.state.doc.childCount).toBe(1)
  })

  it('代码块内不触发', () => {
    const ed = makeEditor('<pre><code></code></pre>')
    ed.commands.setTextSelection(1)
    type(ed, '# - > ---\n')
    expect(first(ed).type.name).toBe('codeBlock')
    expect(first(ed).textContent).toContain('# - > ---')
    let other = false
    ed.state.doc.descendants((n) => {
      if (['heading', 'bulletList', 'blockquote', 'horizontalRule'].includes(n.type.name)) other = true
    })
    expect(other).toBe(false)
  })

  it('行内代码中不触发', () => {
    const ed = makeEditor('<p><code>x</code></p>')
    ed.commands.setTextSelection(1)
    type(ed, '# ')
    expect(first(ed).type.name).toBe('paragraph')
  })

  it.each([
    ['## ', '## '],
    ['- ', '- '],
    ['> ', '> '],
    ['---', '---'],
    ['[x] ', '[x] '],
    ['``` ', '``` '],
  ])('转换后 Ctrl+Z（undo）一次撤回为原文字：%s', (input, text) => {
    const ed = makeEditor()
    type(ed, input)
    expect(first(ed).type.name).not.toBe('paragraph')
    expect(ed.commands.undo()).toBe(true)
    expect(first(ed).type.name).toBe('paragraph')
    expect(ed.state.doc.textContent).toBe(text)
  })

  it('紧接转换的 undoInputRule 撤回为原文字（无尾随段落追加时）', () => {
    const ed = makeEditor('<p></p><p>后文</p>')
    ed.commands.setTextSelection(1)
    type(ed, '## ')
    expect(first(ed).type.name).toBe('heading')
    expect(ed.commands.undoInputRule()).toBe(true)
    expect(first(ed).type.name).toBe('paragraph')
    expect(first(ed).textContent).toBe('## ')
  })
})
