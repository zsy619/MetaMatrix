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
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteTableCell, RteTableHeader } from './rteTableCells'
import { Callout } from './callout'
import { Columns, Column } from './columns'
import { ToggleBlock } from './toggleBlock'
import { TabsBlock, TabPane } from './tabsBlock'

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
      Table,
      TableRow,
      RteTableCell,
      RteTableHeader,
      Callout,
      Columns,
      Column,
      ToggleBlock,
      TabsBlock,
      TabPane,
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

  function pressBackspace(ed: Editor) {
    const ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    const handled = ed.view.someProp('handleKeyDown', (f) => f(ed.view, ev))
    if (!handled) ed.commands.deleteRange({ from: ed.state.selection.from - 1, to: ed.state.selection.from })
  }

  it.each(['## ', '- ', '> ', '[ ] ', '``` '])('文末输入 %s 后退格一次回到原文字（TrailingNode 不打断撤回）', (m) => {
    const ed = makeEditor('<p>前段</p><p></p>')
    ed.commands.focus('end')
    type(ed, m)
    expect(ed.state.doc.child(1).type.name).not.toBe('paragraph')
    pressBackspace(ed)
    expect(ed.state.doc.child(1).type.name).toBe('paragraph')
    expect(ed.state.doc.child(1).textContent).toBe(m)
  })

  it('转换后继续输入文字，再退格只删字不撤回', () => {
    const ed = makeEditor('<p></p>')
    type(ed, '## 标')
    pressBackspace(ed)
    expect(first(ed).type.name).toBe('heading')
    expect(first(ed).textContent).toBe('')
  })

  it('组字结束（compositionend）后符合规则则转换', async () => {
    const ed = makeEditor('<p></p>')
    ed.commands.focus('end')
    ed.view.dispatch(ed.state.tr.insertText('## '))
    expect(first(ed).type.name).toBe('paragraph')
    ed.view.dom.dispatchEvent(new Event('compositionend', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(first(ed).type.name).toBe('heading')
  })

  it('全角 ＃／－／＞ 不转换（只认半角 Markdown 标记）', () => {
    const ed = makeEditor('<p></p>')
    type(ed, '＃ ')
    type(ed, '－ ')
    expect(first(ed).type.name).toBe('paragraph')
  })

  describe('容器内行为（飞书式）', () => {
    const cell = '<table><tbody><tr><td><p></p></td></tr></tbody></table>'
    const findPara = (ed: Editor, inside: string) => {
      let pos = -1
      ed.state.doc.descendants((n, p, parent) => {
        if (n.type.name === 'paragraph' && parent?.type.name === inside && n.content.size === 0 && pos < 0) pos = p + 1
      })
      return pos
    }
    const has = (ed: Editor, name: string) => {
      let f = false
      ed.state.doc.descendants((n) => {
        if (n.type.name === name) f = true
      })
      return f
    }
    const run = (html: string, inside: string, input: string) => {
      const ed = makeEditor(html)
      ed.commands.setTextSelection(findPara(ed, inside))
      type(ed, input)
      return ed
    }

    it.each([
      ['- ', 'bulletList', true],
      ['1. ', 'orderedList', true],
      ['[ ] ', 'taskList', true],
      ['## ', 'heading', false],
      ['> ', 'blockquote', false],
      ['``` ', 'codeBlock', false],
      ['---', 'horizontalRule', false],
    ])('表格单元格内 %s → %s 允许=%s', (input, node, ok) => {
      const ed = run(cell, 'tableCell', input)
      expect(has(ed, node)).toBe(ok)
      expect(has(ed, 'table')).toBe(true)
    })

    it.each([
      ['- ', 'bulletList', true],
      ['[ ] ', 'taskList', true],
      ['## ', 'heading', false],
      ['> ', 'blockquote', false],
      ['---', 'horizontalRule', false],
    ])('列表项第二段内 %s 允许=%s', (input, node, ok) => {
      const ed = run('<ol><li><p>首段</p><p></p></li></ol>', 'listItem', input)
      expect(has(ed, node)).toBe(ok)
    })

    it.each(['- ', '* ', '## ', '> ', '---'])('无序列表项首段输入 %s 不转换、文字保留', (input) => {
      const ed = run('<ul><li><p></p></li></ul>', 'listItem', input)
      expect(ed.state.doc.firstChild!.type.name).toBe('bulletList')
      expect(ed.state.doc.firstChild!.childCount).toBe(1)
      expect(ed.state.doc.firstChild!.textContent).toBe(input)
    })

    it.each([
      ['## ', 'heading', true],
      ['- ', 'bulletList', true],
      ['> ', 'blockquote', false],
      ['``` ', 'codeBlock', false],
      ['---', 'horizontalRule', false],
    ])('引用内 %s 允许=%s', (input, node, ok) => {
      const ed = run('<blockquote><p></p></blockquote>', 'blockquote', input)
      if (node === 'blockquote') {
        let depth = 0
        ed.state.doc.descendants((n) => {
          if (n.type.name === 'blockquote') depth += 1
        })
        expect(depth > 1).toBe(ok)
      } else expect(has(ed, node)).toBe(ok)
    })

    it.each(['# ', '- ', '> ', '1. ', '[ ] ', '---'])('标题内输入 %s 不转换、文字保留', (input) => {
      const ed = makeEditor('<h2></h2>')
      ed.commands.setTextSelection(1)
      type(ed, input)
      expect(first(ed).type.name).toBe('heading')
      expect(first(ed).attrs.level).toBe(2)
      expect(first(ed).textContent).toBe(input)
    })
  })

  describe('列表项首段改型（飞书式）', () => {
    const LISTS = {
      bullet: '<ul><li><p>甲</p></li><li><p></p></li><li><p>丙</p></li></ul>',
      ordered: '<ol><li><p>甲</p></li><li><p></p></li><li><p>丙</p></li></ol>',
      task: '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>甲</p></li><li data-type="taskItem" data-checked="false"><p></p></li><li data-type="taskItem" data-checked="false"><p>丙</p></li></ul>',
    }
    const emptyPos = (ed: Editor) => {
      let pos = -1
      ed.state.doc.descendants((n, p) => {
        if (pos < 0 && n.type.name === 'paragraph' && n.content.size === 0) pos = p + 1
      })
      return pos
    }
    const setup = (html: string, input: string) => {
      const ed = makeEditor(html)
      ed.commands.setTextSelection(emptyPos(ed))
      type(ed, input)
      return ed
    }

    it.each([
      ['bullet', '1. ', 'orderedList', 'listItem'],
      ['bullet', '[] ', 'taskList', 'taskItem'],
      ['ordered', '- ', 'bulletList', 'listItem'],
      ['ordered', '* ', 'bulletList', 'listItem'],
      ['ordered', '[ ] ', 'taskList', 'taskItem'],
      ['task', '- ', 'bulletList', 'listItem'],
      ['task', '1. ', 'orderedList', 'listItem'],
    ] as const)('%s 列表项首输入 %s → 整个列表转 %s，内容保留', (from, input, list, item) => {
      const ed = setup(LISTS[from], input)
      const l = first(ed)
      expect(l.type.name).toBe(list)
      expect(l.childCount).toBe(3)
      l.forEach((c) => expect(c.type.name).toBe(item))
      expect(l.textContent).toBe('甲丙')
      expect(ed.state.selection.$from.parent.type.name).toBe('paragraph')
    })

    it('[x] 改为待办时该项勾选', () => {
      const ed = setup(LISTS.bullet, '[x] ')
      expect(first(ed).child(1).attrs.checked).toBe(true)
      expect(first(ed).child(0).attrs.checked).toBe(false)
    })

    it('改型后继续输入落在原项', () => {
      const ed = setup(LISTS.bullet, '1. 乙')
      expect(first(ed).child(1).textContent).toBe('乙')
    })

    it.each(['1. ', '[] ', '- '])('改型后 Ctrl+Z 一次撤回为原列表 + 原文字：%s', (input) => {
      const html = input === '- ' ? LISTS.ordered : LISTS.bullet
      const ed = setup(html, input)
      const orig = input === '- ' ? 'orderedList' : 'bulletList'
      expect(first(ed).type.name).not.toBe(orig)
      ed.commands.undo()
      expect(first(ed).type.name).toBe(orig)
      expect(first(ed).child(1).textContent).toBe(input)
    })

    it.each(['1. ', '[] '])('改型后退格一次撤回：%s', (input) => {
      const ed = setup(LISTS.bullet, input)
      pressBackspace(ed)
      expect(first(ed).type.name).toBe('bulletList')
      expect(first(ed).child(1).textContent).toBe(input)
    })

    it('文末改型后退格撤回', () => {
      const ed = setup('<ul><li><p>甲</p></li><li><p></p></li></ul>', '1. ')
      expect(first(ed).type.name).toBe('orderedList')
      pressBackspace(ed)
      expect(first(ed).type.name).toBe('bulletList')
      expect(first(ed).child(1).textContent).toBe('1. ')
    })
  })

  describe('版式容器内行为', () => {
    const CONTAINERS = {
      column: '<div data-type="columns"><div data-type="column"><p></p></div><div data-type="column"><p>右</p></div></div>',
      toggleBlock: '<div data-type="toggle-block"><p></p></div>',
      tabPane: '',
      callout: '<div data-type="callout"><p></p></div>',
    } as Record<string, string>
    const ALL = [
      ['## ', 'heading'],
      ['- ', 'bulletList'],
      ['[ ] ', 'taskList'],
      ['> ', 'blockquote'],
      ['``` ', 'codeBlock'],
      ['---', 'horizontalRule'],
    ] as const
    const EXPECT: Record<string, string[]> = {
      column: ['heading', 'bulletList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule'],
      toggleBlock: ['heading', 'bulletList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule'],
      tabPane: ['heading', 'bulletList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule'],
      callout: ['heading', 'bulletList', 'taskList'],
    }
    const build = (name: string) => {
      const ed = makeEditor('<p></p>')
      if (name === 'tabPane') ed.commands.setContent({ type: 'doc', content: [{ type: 'tabsBlock', content: [{ type: 'tabPane', content: [{ type: 'paragraph' }] }, { type: 'tabPane', content: [{ type: 'paragraph', content: [{ type: 'text', text: '二' }] }] }] }] })
      else ed.commands.setContent(CONTAINERS[name])
      let pos = -1
      ed.state.doc.descendants((n, p, parent) => {
        if (pos < 0 && n.type.name === 'paragraph' && n.content.size === 0 && parent?.type.name === name) pos = p + 1
      })
      expect(pos).toBeGreaterThan(0)
      ed.commands.setTextSelection(pos)
      return ed
    }
    for (const name of Object.keys(EXPECT)) {
      it.each(ALL)(`${name} 内 %s → %s`, (input, node) => {
        const ed = build(name)
        type(ed, input)
        let inside = false
        ed.state.doc.descendants((n, _p, parent) => {
          if (n.type.name === node && parent?.type.name === name) inside = true
        })
        expect(inside).toBe(EXPECT[name].includes(node))
        let container = false
        ed.state.doc.descendants((n) => {
          if (n.type.name === name) container = true
        })
        expect(container).toBe(true)
      })
    }
  })

  describe('callout ::: 规则', () => {
    it('文末输入 ::: 空格 → 提示块；退格一次回到原文字', () => {
      const ed = makeEditor('<p>前段</p><p></p>')
      ed.commands.focus('end')
      type(ed, '::: ')
      expect(ed.state.doc.child(1).type.name).toBe('callout')
      pressBackspace(ed)
      expect(ed.state.doc.child(1).type.name).toBe('paragraph')
      expect(ed.state.doc.child(1).textContent).toBe('::: ')
    })

    it('文末 :::warn 空格 → 警告提示块；Ctrl+Z 一次撤回', () => {
      const ed = makeEditor('<p></p>')
      type(ed, ':::warn ')
      expect(first(ed).type.name).toBe('callout')
      expect(first(ed).attrs.variant).toBe('warn')
      ed.commands.undo()
      expect(first(ed).type.name).toBe('paragraph')
      expect(first(ed).textContent).toBe(':::warn ')
    })
  })

  describe('嵌套列表改型只改当前层', () => {
    const NESTED =
      '<ul><li><p>父甲</p><ol><li><p>子一</p></li><li><p></p></li></ol></li><li><p>父乙</p></li></ul>'
    const at = (ed: Editor) => {
      let pos = -1
      ed.state.doc.descendants((n, p) => {
        if (pos < 0 && n.type.name === 'paragraph' && n.content.size === 0) pos = p + 1
      })
      ed.commands.setTextSelection(pos)
    }
    it.each([
      ['- ', 'bulletList'],
      ['[] ', 'taskList'],
    ])('子列表（有序）项首 %s → 子列表转 %s，父列表仍是无序', (input, list) => {
      const ed = makeEditor(NESTED)
      at(ed)
      type(ed, input)
      const parent = first(ed)
      expect(parent.type.name).toBe('bulletList')
      expect(parent.childCount).toBe(2)
      const child = parent.child(0).child(1)
      expect(child.type.name).toBe(list)
      expect(child.textContent).toBe('子一')
      expect(parent.child(1).textContent).toBe('父乙')
      ed.commands.undo()
      expect(first(ed).child(0).child(1).type.name).toBe('orderedList')
    })

    it('父列表项首改型，子列表保持原类型', () => {
      const ed = makeEditor('<ul><li><p></p><ol><li><p>子一</p></li></ol></li><li><p>父乙</p></li></ul>')
      at(ed)
      type(ed, '1. ')
      expect(first(ed).type.name).toBe('orderedList')
      expect(first(ed).child(0).child(1).type.name).toBe('orderedList')
      expect(first(ed).child(0).child(1).textContent).toBe('子一')
      expect(first(ed).child(1).textContent).toBe('父乙')
    })

    it('待办子列表改无序，父待办勾选不变', () => {
      const ed = makeEditor(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>父</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p></p></li></ul></li></ul>',
      )
      at(ed)
      type(ed, '- ')
      expect(first(ed).type.name).toBe('taskList')
      expect(first(ed).child(0).attrs.checked).toBe(true)
      expect(first(ed).child(0).child(1).type.name).toBe('bulletList')
    })
  })

  describe('提示块内再输入 :::', () => {
    it.each(['::: ', ':::warn '])('提示块内 %s 不嵌套，文字保留', (input) => {
      const ed = makeEditor('<div data-type="callout"><p></p></div><p>尾</p>')
      ed.commands.setTextSelection(2)
      type(ed, input)
      let count = 0
      ed.state.doc.descendants((n) => {
        if (n.type.name === 'callout') count += 1
      })
      expect(count).toBe(1)
      expect(first(ed).textContent).toBe(input)
    })
  })

  describe('容器内组字结束后转换', () => {
    const HTML: Record<string, string> = {
      column: '<div data-type="columns"><div data-type="column"><p></p></div><div data-type="column"><p>右</p></div></div>',
      toggleBlock: '<div data-type="toggle-block"><p></p></div>',
      callout: '<div data-type="callout"><p></p></div>',
    }
    const mk = (name: string) => {
      const ed = makeEditor('<p></p>')
      if (name === 'tabPane')
        ed.commands.setContent({ type: 'doc', content: [{ type: 'tabsBlock', content: [{ type: 'tabPane', content: [{ type: 'paragraph' }] }, { type: 'tabPane', content: [{ type: 'paragraph' }] }] }] })
      else ed.commands.setContent(HTML[name])
      let pos = -1
      ed.state.doc.descendants((n, p, parent) => {
        if (pos < 0 && n.type.name === 'paragraph' && parent?.type.name === name) pos = p + 1
      })
      ed.commands.setTextSelection(pos)
      return ed
    }
    it.each(['column', 'tabPane', 'toggleBlock', 'callout'])('%s 内组字提交 "## " 后转标题；全角 ＃ 不转', async (name) => {
      const ed = mk(name)
      ed.view.dispatch(ed.state.tr.insertText('## '))
      ed.view.dom.dispatchEvent(new Event('compositionend', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      let h = false
      ed.state.doc.descendants((n, _p, parent) => {
        if (n.type.name === 'heading' && parent?.type.name === name) h = true
      })
      expect(h).toBe(true)
      const ed2 = mk(name)
      ed2.view.dispatch(ed2.state.tr.insertText('＃ '))
      ed2.view.dom.dispatchEvent(new Event('compositionend', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      let h2 = false
      ed2.state.doc.descendants((n) => {
        if (n.type.name === 'heading') h2 = true
      })
      expect(h2).toBe(false)
      ed2.destroy()
    })
  })
})
