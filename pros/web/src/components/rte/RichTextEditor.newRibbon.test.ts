// @vitest-environment happy-dom
/**
 * 新功能区按钮的自我测试：点栏目、点按钮，核对文档和界面真的变了。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function mountEditor() {
  localStorage.removeItem('rte-ribbon-tab')
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: '新按钮',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: '<p>甲</p>', panelId: 'panel-a', expanded: true },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
  return wrapper
}

function editorOf(wrapper: ReturnType<typeof mount>): Editor {
  const vm = wrapper.vm as unknown as { editor?: Editor & { value?: Editor } }
  const editor = vm.editor && 'state' in vm.editor ? vm.editor : vm.editor?.value
  if (!editor) throw new Error('编辑器还没挂上')
  return editor
}

async function openRibbon(wrapper: ReturnType<typeof mount>, label: string) {
  const tab = wrapper.findAll('button.rte-ribbon-tab').find((button) => button.text() === label)
  expect(tab, `栏目 ${label}`).toBeTruthy()
  await tab!.trigger('click')
  await nextTick()
}

function toolButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button.rte-tool').find((button) => (button.text() || '').includes(label))
}

async function clickTool(wrapper: ReturnType<typeof mount>, label: string) {
  const button = toolButton(wrapper, label)
  expect(button, `按钮 ${label}`).toBeTruthy()
  await button!.trigger('click')
  await nextTick()
  await flushPromises()
}

describe('新功能区按钮', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('整理栏目把全角收成半角，并给中英文补空格', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<p>ＡＢＣ甲A</p>')
    editor.commands.setTextSelection(2)
    await openRibbon(wrapper, '整理')
    await clickTool(wrapper, '半角')
    expect(editor.getText()).toContain('ABC')
    expect(editor.getText()).not.toContain('Ａ')
    editor.commands.setTextSelection(2)
    await clickTool(wrapper, '中英空格')
    expect(editor.getText()).toMatch(/甲 A/)
    wrapper.unmount()
  })

  it('整理下级菜单可以按行排序', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<p>乙</p><p>甲</p>')
    let from = -1
    let to = -1
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      if (node.text === '乙' && from < 0) from = pos
      if (node.text === '甲') to = pos + node.nodeSize
    })
    editor.commands.setTextSelection({ from, to })
    await openRibbon(wrapper, '整理')
    await clickTool(wrapper, '整理')
    const item = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '按行排序')
    expect(item).toBeTruthy()
    item!.click()
    await nextTick()
    await flushPromises()
    const text = editor.getText()
    expect(text.indexOf('甲')).toBeLessThan(text.indexOf('乙'))
    wrapper.unmount()
  })

  it('没有选中图片时，换图和替代文本不能点', async () => {
    const wrapper = await mountEditor()
    await openRibbon(wrapper, '图片')
    expect(toolButton(wrapper, '换图')!.attributes('disabled')).toBeDefined()
    expect(toolButton(wrapper, '替代文本')!.attributes('disabled')).toBeDefined()
    expect(toolButton(wrapper, '排法')!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('选中图片后可以改成左环绕，揭晓和首字写进正文', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent(`<p>甲乙</p><img src="${PIXEL}" alt="旧图"><p>丙</p>`)
    let imagePos = -1
    editor.state.doc.descendants((node, pos) => {
      if (imagePos < 0 && node.type.name === 'image') imagePos = pos
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imagePos)))
    await openRibbon(wrapper, '图片')
    expect(toolButton(wrapper, '排法')!.attributes('disabled')).toBeUndefined()
    await clickTool(wrapper, '排法')
    const wrap = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '左环绕')
    expect(wrap).toBeTruthy()
    wrap!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(editor.getHTML()).toContain('wrap-left')

    editor.commands.setTextSelection(2)
    await clickTool(wrapper, '揭晓')
    expect(editor.getHTML()).toContain('spoiler')
    editor.commands.setTextSelection(2)
    await clickTool(wrapper, '首字')
    expect(editor.getHTML()).toContain('data-drop-cap')
    wrapper.unmount()
  })

  it('页面栏目能打开参考线，并记住打印时印出链接', async () => {
    const wrapper = await mountEditor()
    await openRibbon(wrapper, '页面')
    await clickTool(wrapper, '参考线')
    expect(wrapper.classes()).toContain('is-paper-guide')
    await clickTool(wrapper, '印出链接')
    expect(wrapper.classes()).toContain('is-print-urls')
    await clickTool(wrapper, '印出链接')
    expect(wrapper.classes()).not.toContain('is-print-urls')
    wrapper.unmount()
  })

  it('表格栏目能上斑马纹、均分列宽、插入公式并按列升序', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent(
      '<table><tbody><tr><th><p>名</p></th><th><p>数</p></th></tr><tr><td><p>乙</p></td><td><p>2</p></td></tr><tr><td><p>甲</p></td><td><p>1</p></td></tr></tbody></table>',
    )
    let cell = -1
    editor.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.isText && node.text === '乙') cell = pos
    })
    editor.commands.setTextSelection(cell)
    await openRibbon(wrapper, '表格')
    await clickTool(wrapper, '升序')
    const sorted = editor.getText()
    expect(sorted.indexOf('甲')).toBeLessThan(sorted.indexOf('乙'))
    let again = -1
    editor.state.doc.descendants((node, pos) => {
      if (again < 0 && node.isText && node.text === '乙') again = pos
    })
    editor.commands.setTextSelection(again)
    await clickTool(wrapper, '斑马纹')
    expect(editor.getHTML()).toContain('data-zebra="1"')
    await clickTool(wrapper, '均分列')
    expect(editor.getHTML()).toContain('colwidth="160"')
    await clickTool(wrapper, '格公式')
    expect(editor.getText()).toContain('=SUM(ABOVE)')
    await clickTool(wrapper, '冻结表头')
    expect(wrapper.classes()).toContain('is-table-sticky')
    await clickTool(wrapper, '冻结首列')
    expect(wrapper.classes()).toContain('is-table-col-sticky')
    wrapper.unmount()
  })
})
