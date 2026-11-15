// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { afterEach, describe, expect, it } from 'vitest'
import { ref, shallowRef } from 'vue'
import { Callout } from '../../extensions/callout'
import { ParagraphAttrs } from '../../extensions/paragraphAttrs'
import { blockHandleTitle } from '../../utils/rteToolbarOptimize'
import {
  BLOCK_HANDLE_ROWS,
  BLOCK_HANDLE_TYPE_GRID,
  blockFaceFromNode,
} from './blockHandleMenu'
import { useBlockHandle } from './composables/useBlockHandle'

const DOC = '<p>你好世界</p><p>第二段</p>'

function mount(content = DOC) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    content,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      ParagraphAttrs,
      Callout,
    ],
  })
  const api = useBlockHandle({
    editor: shallowRef(editor),
    viewMode: () => ({ value: 'edit' }),
    rteRootEl: ref(null),
    expanded: () => false,
  })
  editor.commands.focus('start')
  api.openBlockMenuForSelection()
  return { editor, api }
}

function markColor(editor: Editor, markName: string): string {
  let color = ''
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === markName && mark.attrs.color) color = String(mark.attrs.color)
    }
  })
  return color
}

describe('左侧块菜单', () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors) editor.destroy()
    editors.length = 0
    document.body.innerHTML = ''
  })

  it('图标格两行，操作按飞书的分组往下排', () => {
    expect(BLOCK_HANDLE_TYPE_GRID.map((item) => item.glyph)).toEqual([
      'T',
      'H1',
      'H2',
      'H3',
      'H4',
      '1.',
      '•',
      '☑',
      '</>',
      '“',
      '—',
      '!',
    ])
    expect(BLOCK_HANDLE_ROWS.map((row) => row.label || row.id)).toEqual([
      '缩进和对齐',
      '颜色',
      '提示样式',
      'sep-1',
      '评论',
      '剪切',
      '复制',
      '创建副本',
      '上移',
      '下移',
      '删除',
      'sep-2',
      '在下方添加',
    ])
    const labels = [
      ...BLOCK_HANDLE_TYPE_GRID.map((item) => item.label),
      ...BLOCK_HANDLE_ROWS.map((row) => row.label || ''),
    ]
    for (const name of ['分享', '翻译', '转换为子文档', '保存为模板', '复制链接']) {
      expect(labels).not.toContain(name)
    }
  })

  it('块类型能从节点名还原到图标', () => {
    expect(blockFaceFromNode('heading', { level: 4 })).toBe('h4')
    expect(blockFaceFromNode('heading', { level: 5 })).toBe('')
    expect(blockFaceFromNode('codeBlock')).toBe('code')
    expect(blockFaceFromNode('horizontalRule')).toBe('hr')
    expect(blockFaceFromNode('callout', { variant: 'warn' })).toBe('warn')
    expect(blockFaceFromNode('paragraph')).toBe('paragraph')
    expect(blockHandleTitle('h4')).toBe('把这一块改成四级标题')
    expect(blockHandleTitle('cut')).toBe('把这一块复制到剪贴板后删除')
    expect(blockHandleTitle('clipboard')).toBe('把这一块复制到剪贴板')
    expect(blockHandleTitle('layout')).toBe('调整这一块的缩进和对齐')
  })

  it('菜单模板使用图标格，编辑器挂上对应操作', () => {
    const body = readFileSync('src/components/rte/RteDocumentBody.vue', 'utf8')
    const editor = readFileSync('src/components/RichTextEditor.vue', 'utf8')
    expect(body).toContain('BLOCK_HANDLE_TYPE_GRID')
    expect(body).toContain('BLOCK_HANDLE_ROWS')
    expect(body).not.toContain('转换为子文档')
    for (const name of [
      'hoveredBlockFace',
      'alignHoveredBlock',
      'indentHoveredBlock',
      'paintHoveredBlock',
      'cutHoveredBlock',
      'copyHoveredBlockClipboard',
    ]) {
      expect(editor).toContain(name)
    }
  })

  it('能改成标题、列表、代码、分隔线和提示', () => {
    const heading = mount()
    editors.push(heading.editor)
    expect(heading.api.hoveredBlockFace()).toBe('paragraph')
    heading.api.turnHoveredBlock('h4')
    expect(heading.editor.state.doc.child(0).type.name).toBe('heading')
    expect(heading.editor.state.doc.child(0).attrs.level).toBe(4)
    expect(heading.api.hoveredBlockFace()).toBe('h4')

    const list = mount()
    editors.push(list.editor)
    list.api.turnHoveredBlock('bullet')
    expect(list.editor.state.doc.child(0).type.name).toBe('bulletList')
    expect(list.editor.state.doc.child(0).textContent).toBe('你好世界')

    const code = mount()
    editors.push(code.editor)
    code.api.turnHoveredBlock('code')
    expect(code.editor.state.doc.child(0).type.name).toBe('codeBlock')
    expect(code.editor.state.doc.child(0).textContent).toBe('你好世界')

    const rule = mount()
    editors.push(rule.editor)
    rule.api.turnHoveredBlock('hr')
    expect(rule.editor.state.doc.child(0).textContent).toBe('你好世界')
    expect(rule.editor.state.doc.child(1).type.name).toBe('horizontalRule')

    const callout = mount()
    editors.push(callout.editor)
    callout.api.turnHoveredBlock('warn')
    expect(callout.editor.state.doc.child(0).type.name).toBe('callout')
    expect(callout.editor.state.doc.child(0).attrs.variant).toBe('warn')
    expect(callout.editor.state.doc.child(0).textContent).toBe('你好世界')
  })

  it('对齐、缩进、文字颜色和高亮作用在当前块', () => {
    const { editor, api } = mount()
    editors.push(editor)

    api.alignHoveredBlock('center')
    expect(editor.state.doc.child(0).attrs.textAlign).toBe('center')
    expect(api.hoveredBlockAlign()).toBe('center')

    api.indentHoveredBlock(1)
    expect(editor.state.doc.child(0).attrs.indent).toBe(1)
    api.indentHoveredBlock(-1)
    expect(editor.state.doc.child(0).attrs.indent).toBe(0)

    api.paintHoveredBlock('color', '#d83931')
    expect(markColor(editor, 'textStyle')).toBe('#d83931')
    api.paintHoveredBlock('highlight', '#fff3bf')
    expect(markColor(editor, 'highlight')).toBe('#fff3bf')
  })

  it('复制留在文档里，剪切写入剪贴板后才删除', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          written.push(text)
        },
      },
    })
    const copied = mount()
    editors.push(copied.editor)
    await copied.api.copyHoveredBlockClipboard()
    expect(written).toContain('你好世界')
    expect(copied.editor.state.doc.childCount).toBe(2)

    written.length = 0
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied')
        },
      },
    })
    const blocked = mount()
    editors.push(blocked.editor)
    await blocked.api.cutHoveredBlock()
    expect(blocked.editor.state.doc.child(0).textContent).toBe('你好世界')

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          written.push(text)
        },
      },
    })
    const cut = mount()
    editors.push(cut.editor)
    await cut.api.cutHoveredBlock()
    expect(written).toContain('你好世界')
    expect(cut.editor.state.doc.child(0).textContent).toBe('第二段')
    expect(cut.editor.state.doc.childCount).toBe(1)
  })
})
