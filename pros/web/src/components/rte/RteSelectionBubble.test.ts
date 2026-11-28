// @vitest-environment happy-dom
/**
 * 选区浮动工具条：
 * - 跨段落选区应用字号 / 字体 / 对齐时，选区覆盖的所有段落一起生效；
 * - 工具条出现条件：空选区、代码块、图表块内不出现。
 *
 * 说明：整编辑器集成用例（挂载 RichTextEditor）放在文件末尾，默认跳过，
 * 需要时用 `RTE_FULL_EDITOR=1 npx vitest run src/components/rte/RteSelectionBubble.test.ts` 打开。
 */
import { Editor, Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, FontSize, FontFamily } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { describe, expect, it } from 'vitest'
import {
  applyFontFamilyToSelection,
  applyFontSizeToSelection,
  applyTextAlignToSelection,
  resolveFontSizeToken,
} from './selectionFormat'
import { useSelectionBubble } from './composables/useSelectionBubble'

/** 假的图表块（原子节点），只为验证「图表块内不出现工具条」。 */
const FakeChartBlock = Node.create({
  name: 'echartsBlock',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-echarts-block]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-echarts-block': '1' }]
  },
})

const TWO_PARAGRAPHS = '<p>第一段落文字</p><p>第二段落文字</p><p>第三段落文字</p>'

function createEditor(content = TWO_PARAGRAPHS): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ codeBlock: {} }),
      TextStyle,
      FontSize,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FakeChartBlock,
    ],
    content,
  })
}

/** 选中从第一段开头到第二段结尾（跨段落）。 */
function selectAcrossParagraphs(editor: Editor): { from: number; to: number } {
  const from = 2
  const to = 2 + '第一段落文字'.length + 1 + '第二段落文字'.length
  editor.commands.setTextSelection({ from, to })
  return { from, to }
}

/** 取出每个顶层段落里文本节点的 fontSize / fontFamily。 */
function collectParagraphTextStyles(editor: Editor): Array<{ fontSize: string; fontFamily: string }> {
  const rows: Array<{ fontSize: string; fontFamily: string }> = []
  editor.state.doc.forEach((node) => {
    let fontSize = ''
    let fontFamily = ''
    node.forEach((child) => {
      for (const mark of child.marks || []) {
        if (mark.type.name === 'textStyle') {
          fontSize = mark.attrs.fontSize || fontSize
          fontFamily = mark.attrs.fontFamily || fontFamily
        }
      }
    })
    rows.push({ fontSize, fontFamily })
  })
  return rows
}

describe('字号输入', () => {
  it('中文号和磅值都能解析', () => {
    expect(resolveFontSizeToken('小四')).toBe('12pt')
    expect(resolveFontSizeToken('五号')).toBe('10.5pt')
    expect(resolveFontSizeToken('12')).toBe('12pt')
    expect(resolveFontSizeToken('12px')).toBe('12px')
    expect(resolveFontSizeToken('默认')).toBe('')
  })
})

describe('选区浮动工具条 · 跨段落应用格式', () => {
  it('跨段落选区应用字号：两段都生效，第三段不受影响', () => {
    const editor = createEditor()
    const { from, to } = selectAcrossParagraphs(editor)
    expect(editor.state.selection.from).toBe(from)
    expect(editor.state.selection.to).toBe(to)
    expect(editor.state.selection.$from.parent.textContent).toContain('第一段落文字')
    expect(editor.state.selection.$to.parent.textContent).toContain('第二段落文字')

    applyFontSizeToSelection(editor, '20px')

    const styles = collectParagraphTextStyles(editor)
    expect(styles[0]!.fontSize).toBe('20px')
    expect(styles[1]!.fontSize).toBe('20px')
    expect(styles[2]!.fontSize).toBe('')
    editor.destroy()
  })

  it('跨段落选区应用字体：两段都生效', () => {
    const editor = createEditor()
    selectAcrossParagraphs(editor)

    applyFontFamilyToSelection(editor, 'Georgia, "Times New Roman", serif')

    const styles = collectParagraphTextStyles(editor)
    expect(styles[0]!.fontFamily).toBe('Georgia, "Times New Roman", serif')
    expect(styles[1]!.fontFamily).toBe('Georgia, "Times New Roman", serif')
    expect(styles[2]!.fontFamily).toBe('')
    editor.destroy()
  })

  it('跨段落选区应用对齐：两段都生效', () => {
    const editor = createEditor()
    selectAcrossParagraphs(editor)

    applyTextAlignToSelection(editor, 'center')

    const aligns: string[] = []
    editor.state.doc.forEach((node) => {
      aligns.push(String(node.attrs.textAlign || ''))
    })
    expect(aligns[0]).toBe('center')
    expect(aligns[1]).toBe('center')
    expect(aligns[2]).toBe('')
    editor.destroy()
  })

  it('取消字号后选区内的字号被移除', () => {
    const editor = createEditor()
    selectAcrossParagraphs(editor)
    applyFontSizeToSelection(editor, '20px')
    applyFontSizeToSelection(editor, '')

    const styles = collectParagraphTextStyles(editor)
    expect(styles[0]!.fontSize).toBe('')
    expect(styles[1]!.fontSize).toBe('')
    editor.destroy()
  })
})

describe('选区浮动工具条 · 出现条件', () => {
  function shouldShowOf(editor: Editor) {
    const { selectionBubbleShouldShow } = useSelectionBubble({
      editor: { value: editor } as never,
      viewMode: () => ({ value: 'edit' }),
      isImageNodeSelected: () => false,
    })
    return selectionBubbleShouldShow
  }

  it('空选区不出现', () => {
    const editor = createEditor()
    const shouldShow = shouldShowOf(editor)
    expect(shouldShow({ editor, from: 2, to: 2 })).toBe(false)
    editor.destroy()
  })

  it('正文选区出现', () => {
    const editor = createEditor()
    const shouldShow = shouldShowOf(editor)
    expect(shouldShow({ editor, from: 2, to: 6 })).toBe(true)
    editor.destroy()
  })

  it('代码块内不出现', () => {
    const editor = createEditor('<p>普通段落</p><pre><code>const a = 1</code></pre>')
    const shouldShow = shouldShowOf(editor)
    let codeFrom = -1
    let codeTo = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') {
        codeFrom = pos + 2
        codeTo = pos + 2 + 'const a = 1'.length
      }
      return true
    })
    expect(codeFrom).toBeGreaterThan(0)
    expect(shouldShow({ editor, from: codeFrom, to: codeTo })).toBe(false)
    editor.destroy()
  })

  it('图表块内不出现', () => {
    const editor = createEditor('<p>普通段落</p><div data-echarts-block="1"></div>')
    const shouldShow = shouldShowOf(editor)
    let chartPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'echartsBlock') chartPos = pos
      return true
    })
    expect(chartPos).toBeGreaterThanOrEqual(0)
    expect(shouldShow({ editor, from: chartPos, to: chartPos + 1 })).toBe(false)
    editor.destroy()
  })

  it('非编辑态不出现', () => {
    const editor = createEditor()
    const { selectionBubbleShouldShow } = useSelectionBubble({
      editor: { value: editor } as never,
      viewMode: () => ({ value: 'preview' }),
      isImageNodeSelected: () => false,
    })
    expect(selectionBubbleShouldShow({ editor, from: 2, to: 6 })).toBe(false)
    editor.destroy()
  })
})

/** 整编辑器集成（默认跳过：整包加载 RichTextEditor 很重，按需打开）。 */
describe.skipIf(!process.env.RTE_FULL_EDITOR)('选区浮动工具条 · 整编辑器集成', () => {
  it('顶部工具栏的字号命令对跨段落选区同样生效', async () => {
    const { default: RichTextEditor } = await import('../RichTextEditor.vue')
    const { RTE_BINDINGS } = await import('./bindings')
    const { createPinia, setActivePinia } = await import('pinia')
    const { useDocumentStore } = await import('../../stores/document')
    const { mount } = await import('@vue/test-utils')
    const { nextTick } = await import('vue')

    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: 'fixture',
    } as never
    const wrapper = mount(RichTextEditor, {
      props: { modelValue: TWO_PARAGRAPHS, panelId: 'panel-a', expanded: true },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    for (let i = 0; i < 50 && !wrapper.find('.ProseMirror').exists(); i += 1) {
      await nextTick()
    }
    const editor = (wrapper.vm as unknown as { editor: Editor }).editor
    const provides = (wrapper.vm.$ as unknown as { provides: Record<symbol, any> }).provides
    const bindings = provides[RTE_BINDINGS] as Record<string, any>

    selectAcrossParagraphs(editor)
    bindings.applyFontSize('20px')
    const styles = collectParagraphTextStyles(editor)
    expect(styles[0]!.fontSize).toBe('20px')
    expect(styles[1]!.fontSize).toBe('20px')
    wrapper.unmount()
  })
})
