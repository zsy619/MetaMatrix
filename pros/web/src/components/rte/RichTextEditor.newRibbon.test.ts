// @vitest-environment happy-dom
/**
 * 新功能区按钮的自我测试：点栏目、点按钮，核对文档和界面真的变了。
 */
import { readFileSync } from 'node:fs'
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

async function clickMenu(label: string) {
  await nextTick()
  await flushPromises()
  const item = [...document.body.querySelectorAll('button')].find((button) => button.textContent === label)
  expect(item, `菜单 ${label}`).toBeTruthy()
  item!.click()
  await nextTick()
  await flushPromises()
}

async function answerPrompt(title: string, value: string, confirm: string) {
  await flushPromises()
  await nextTick()
  const dialog = document.querySelector(`[aria-label="${title}"]`)
  expect(dialog, title).toBeTruthy()
  const input = dialog!.querySelector('input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const ok = [...dialog!.querySelectorAll('button')].find((button) => button.textContent?.trim() === confirm)
  expect(ok, confirm).toBeTruthy()
  ok!.click()
  await nextTick()
  await flushPromises()
}

function selectImage(editor: Editor) {
  let imagePos = -1
  editor.state.doc.descendants((node, pos) => {
    if (imagePos < 0 && node.type.name === 'image') imagePos = pos
  })
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imagePos)))
}

describe('新功能区按钮', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('颜色按钮用分组色块和白色字形，底下留当前文字颜色', async () => {
    const css = readFileSync('src/components/rte/styles/editor.scoped.css', 'utf8')
    const rule = css.slice(css.indexOf('.rte-tool-icon.rte-color-icon {'))
    expect(rule.startsWith('.rte-tool-icon.rte-color-icon {')).toBe(true)
    const block = rule.slice(0, rule.indexOf('}') + 1)
    expect(block).toContain('var(--rte-icon-bg')
    expect(block).not.toContain('background: #fff')
    expect(css).toContain('.rte-color-icon .rte-ep-icon) {\n  color: #fff;')
    expect(css).toContain('.rte-color-icon::after')

    const wrapper = await mountEditor()
    await openRibbon(wrapper, '字体与颜色')
    const icon = wrapper.get('button[aria-label="文字颜色"] .rte-color-icon')
    expect(icon.attributes('style') || '').toContain('--rte-color-bar')
    expect(icon.find('svg').exists()).toBe(true)
    wrapper.unmount()
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

  it('全角、收空格、去重复行和给每行编号都写进正文', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<p>ABC</p>')
    editor.commands.setTextSelection(2)
    await openRibbon(wrapper, '整理')
    await clickTool(wrapper, '全角')
    expect(editor.getText()).toContain('ＡＢＣ')

    editor.commands.setContent('<p>甲  乙</p>')
    editor.commands.setTextSelection(2)
    await clickTool(wrapper, '收空格')
    expect(editor.getText()).toBe('甲 乙')

    editor.commands.setContent('<p>甲</p><p>甲</p><p>乙</p>')
    let from = -1
    let to = -1
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      if (from < 0) from = pos
      to = pos + node.nodeSize
    })
    editor.commands.setTextSelection({ from, to })
    await clickTool(wrapper, '整理')
    await clickMenu('去掉重复行')
    expect(editor.getText().split('\n').filter((line) => line === '甲')).toHaveLength(1)

    editor.commands.setContent('<p>甲</p>')
    editor.commands.setTextSelection(2)
    await clickTool(wrapper, '整理')
    await clickMenu('给每行编号')
    expect(editor.getText()).toContain('1. 甲')
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
    wrap!.click()
    await nextTick()
    expect(editor.getHTML()).toContain('wrap-left')
    await clickTool(wrapper, '排法')
    await clickMenu('居左')
    expect(editor.getHTML()).toContain('data-align="left"')
    await clickTool(wrapper, '排法')
    await clickMenu('右环绕')
    expect(editor.getHTML()).toContain('wrap-right')
    await clickTool(wrapper, '排法')
    await clickMenu('居右')
    expect(editor.getHTML()).toContain('data-align="right"')
    await clickTool(wrapper, '排法')
    await clickMenu('居中')
    expect(editor.getHTML()).toContain('data-align="center"')

    selectImage(editor)
    await clickTool(wrapper, '替代文本')
    await answerPrompt('替代文本', '产品图', '确认')
    expect(editor.getHTML()).toContain('alt="产品图"')

    selectImage(editor)
    await clickTool(wrapper, '换图')
    await answerPrompt('换图', 'https://example.com/new.png', '替换')
    expect(editor.getHTML()).toContain('https://example.com/new.png')
    expect(editor.getHTML()).toContain('alt="产品图"')

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

    const editor = editorOf(wrapper)
    editor.commands.setContent('<p>甲</p>')
    editor.commands.focus('end')
    await clickTool(wrapper, '分页符')
    expect(editor.getHTML()).toContain('data-page-break')

    await clickTool(wrapper, '页面')
    const header = document.querySelector('[aria-label="页面设置"] input[placeholder="每页顶部的内容"]') as HTMLInputElement
    expect(header).toBeTruthy()
    header.value = '机密'
    header.dispatchEvent(new Event('input', { bubbles: true }))
    const confirm = [...document.querySelectorAll('[aria-label="页面设置"] button')].find((button) => button.textContent?.trim() === '确认')
    expect(confirm).toBeTruthy()
    confirm!.click()
    await nextTick()
    await flushPromises()
    expect(wrapper.text()).toContain('机密')

    await clickTool(wrapper, '打印预览')
    const started = Date.now()
    while (!document.querySelector('[aria-label="打印预览"]') && Date.now() - started < 8000) {
      await flushPromises()
      await nextTick()
    }
    expect(document.querySelector('[aria-label="打印预览"]')).toBeTruthy()
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
    const beforeRows = editor.getHTML().split('<tr').length - 1
    await clickTool(wrapper, '行列')
    await clickMenu('向下插入行')
    expect(editor.getHTML().split('<tr').length - 1).toBe(beforeRows + 1)
    wrapper.unmount()
  })

  it('表格菜单的数量框默认 1，填几就插入几行或几列', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<table><tbody><tr><td><p>甲</p></td></tr></tbody></table>')
    let cell = -1
    editor.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.isText && node.text === '甲') cell = pos
    })
    editor.commands.setTextSelection(cell)
    await openRibbon(wrapper, '表格')
    await clickTool(wrapper, '表格')
    const insertGroup = [...document.querySelectorAll('.rte-table-menu button')].find((button) => (button.textContent || '').includes('插入') && !(button.textContent || '').includes('插入行'))
    insertGroup!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()
    const labels = ['向上插入行数量', '向下插入行数量', '向左插入列数量', '向右插入列数量']
    const inputs = labels.map((label) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null)
    expect(inputs.every(Boolean), '四个插入项各有数量').toBe(true)
    const input = inputs[1]!
    expect(input.value).toBe('1')
    expect(input.min).toBe('1')
    input!.value = '0'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    input!.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()
    expect(input!.value).toBe('1')
    input!.value = '3'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const rowsBefore = editor.getHTML().split('<tr').length - 1
    const rowButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.trim() === '向下插入行')
    expect(rowButton, '向下插入行').toBeTruthy()
    rowButton!.click()
    await nextTick()
    await flushPromises()
    expect(editor.getHTML().split('<tr').length - 1).toBe(rowsBefore + 3)
    let again = -1
    editor.state.doc.descendants((node, pos) => {
      if (again < 0 && node.isText && node.text === '甲') again = pos
    })
    editor.commands.setTextSelection(again)
    await clickTool(wrapper, '表格')
    const insertAgain = [...document.querySelectorAll('.rte-table-menu button')].find((button) => (button.textContent || '').includes('插入') && !(button.textContent || '').includes('插入行'))
    insertAgain!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()
    const inputAgain = document.querySelector('input[aria-label="向右插入列数量"]') as HTMLInputElement
    inputAgain.value = '2'
    inputAgain.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const colButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.trim() === '向右插入列')
    expect(colButton, '向右插入列').toBeTruthy()
    colButton!.click()
    await nextTick()
    await flushPromises()
    const firstRow = editor.getHTML().match(/<tr[\s\S]*?<\/tr>/)?.[0] ?? ''
    expect((firstRow.match(/<t[dh]/g) || []).length).toBe(3)
    wrapper.unmount()
  })

  it('表格右键按插入、删除、单元格、表头、数据分组', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<table><tbody><tr><td><p>甲</p></td></tr></tbody></table>')
    await nextTick()
    const cell = wrapper.get('.ProseMirror td').element
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }))
    await nextTick()
    const menu = document.querySelector('.rte-table-ctx')
    expect(menu, '右键菜单').toBeTruthy()
    const tops = [...menu!.querySelectorAll(':scope > .rte-table-ctx-group > button')].map((button) => (button.textContent || '').replace('▸', '').trim())
    expect(tops).toEqual(['插入', '单元格', '表头', '数据', '阅读', '删除'])
    expect(menu!.textContent).not.toContain('向上插入行')
    const insert = [...menu!.querySelectorAll(':scope > .rte-table-ctx-group > button')].find((button) => (button.textContent || '').includes('插入'))
    insert!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()
    expect(menu!.textContent).toContain('向上插入行')
    expect(menu!.textContent).toContain('向右插入列')
    expect(menu!.querySelector('input[aria-label="向下插入行数量"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('斑马纹写到表格节点上，偶数行底色和奇数行不同', async () => {
    const css = readFileSync('src/components/rte/styles/editor.global.css', 'utf8')
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent(
      '<table><tbody><tr><th><p>名</p></th></tr><tr><td><p>甲</p></td></tr><tr><td><p>乙</p></td></tr><tr><td><p>丙</p></td></tr></tbody></table>',
    )
    let cell = -1
    editor.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.isText && node.text === '甲') cell = pos
    })
    editor.commands.setTextSelection(cell)
    await openRibbon(wrapper, '表格')
    await clickTool(wrapper, '斑马纹')
    const table = wrapper.get('.ProseMirror table').element as HTMLTableElement
    expect(table.getAttribute('data-zebra')).toBe('1')
    const rows = [...table.querySelectorAll('tbody > tr')] as HTMLTableRowElement[]
    const header = getComputedStyle(rows[0].cells[0]).backgroundColor
    const even = getComputedStyle(rows[1].cells[0]).backgroundColor
    const odd = getComputedStyle(rows[2].cells[0]).backgroundColor
    expect(even.replace(/\s/g, '').toLowerCase()).toBe('#e7eefc')
    expect(odd).not.toBe(even)
    expect(header).not.toBe(even)
    await clickTool(wrapper, '斑马纹')
    expect(table.getAttribute('data-zebra')).toBeNull()
    expect(getComputedStyle(rows[1].cells[0]).backgroundColor.replace(/\s/g, '').toLowerCase()).not.toBe('#e7eefc')
    wrapper.unmount()
    style.remove()
  })

  it('表格阅读配色写到表格上，表头和偶数行换成所选颜色', async () => {
    const css = readFileSync('src/components/rte/styles/editor.global.css', 'utf8')
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent(
      '<table><tbody><tr><th><p>名</p></th></tr><tr><td><p>甲</p></td></tr><tr><td><p>乙</p></td></tr></tbody></table>',
    )
    let cell = -1
    editor.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.isText && node.text === '甲') cell = pos
    })
    editor.commands.setTextSelection(cell)
    await openRibbon(wrapper, '表格')
    await clickTool(wrapper, '表格')
    const read = [...document.querySelectorAll('.rte-table-menu button')].find((button) => (button.textContent || '').replace('▸', '').trim() === '阅读')
    expect(read, '阅读分组').toBeTruthy()
    read!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()
    await clickMenu('护眼绿')
    const table = wrapper.get('.ProseMirror table').element as HTMLTableElement
    expect(table.getAttribute('data-read')).toBe('green')
    expect(editor.getHTML()).toContain('data-read="green"')
    const rows = [...table.querySelectorAll('tbody > tr')] as HTMLTableRowElement[]
    expect(getComputedStyle(rows[0].cells[0]).backgroundColor.replace(/\s/g, '').toLowerCase()).toBe('#1f7a4d')
    expect(getComputedStyle(rows[1].cells[0]).backgroundColor.replace(/\s/g, '').toLowerCase()).toBe('#e7f6ee')
    expect(getComputedStyle(rows[2].cells[0]).backgroundColor.replace(/\s/g, '').toLowerCase()).not.toBe('#e7f6ee')
    let again = -1
    editor.state.doc.descendants((node, pos) => {
      if (again < 0 && node.isText && node.text === '甲') again = pos
    })
    editor.commands.setTextSelection(again)
    await clickTool(wrapper, '表格')
    const readAgain = [...document.querySelectorAll('.rte-table-menu button')].find((button) => (button.textContent || '').replace('▸', '').trim() === '阅读')
    readAgain!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()
    await clickMenu('关闭阅读')
    expect(table.getAttribute('data-read')).toBeNull()
    expect(editor.getHTML()).not.toContain('data-read=')
    wrapper.unmount()
    style.remove()
  })

  it('表格行列菜单可以按当前列降序', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent(
      '<table><tbody><tr><th><p>名</p></th></tr><tr><td><p>甲</p></td></tr><tr><td><p>乙</p></td></tr></tbody></table>',
    )
    let cell = -1
    editor.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.isText && node.text === '甲') cell = pos
    })
    editor.commands.setTextSelection(cell)
    await openRibbon(wrapper, '表格')
    await clickTool(wrapper, '行列')
    await clickMenu('按列降序')
    const text = editor.getText()
    expect(text.indexOf('乙')).toBeLessThan(text.indexOf('甲'))
    wrapper.unmount()
  })

  it('书写纸样会换成小红书、信纸和田字格', async () => {
    localStorage.removeItem('rte-writing-paper:panel-a')
    const wrapper = await mountEditor()
    await openRibbon(wrapper, '书写')
    const paperChip = (label: string) =>
      [...document.body.querySelectorAll('button.rte-paper-chip')].find((button) => button.textContent?.includes(label))
    expect(paperChip('小红书')?.querySelector('.rte-paper-swatch')?.getAttribute('data-paper')).toBe('xhs')
    expect(paperChip('默认')?.classList.contains('active')).toBe(true)
    paperChip('小红书')!.click()
    await nextTick()
    expect(wrapper.attributes('data-writing-paper')).toBe('xhs')
    expect(paperChip('小红书')?.classList.contains('active')).toBe(true)
    paperChip('信纸')!.click()
    await nextTick()
    expect(wrapper.attributes('data-writing-paper')).toBe('letter')
    paperChip('田字格')!.click()
    await nextTick()
    expect(wrapper.attributes('data-writing-paper')).toBe('tianzi')
    for (const [label, id] of [['米字格', 'mizi'], ['四线三格', 'english'], ['点阵', 'dot'], ['康奈尔', 'cornell'], ['竖排', 'vertical'], ['坐标纸', 'graph']] as const) {
      expect(paperChip(label)?.querySelector('.rte-paper-swatch')?.getAttribute('data-paper')).toBe(id)
      paperChip(label)!.click()
      await nextTick()
      expect(wrapper.attributes('data-writing-paper')).toBe(id)
    }
    expect(localStorage.getItem('rte-writing-paper:panel-a')).toBe('graph')
    paperChip('默认')!.click()
    await nextTick()
    expect(wrapper.attributes('data-writing-paper')).toBeUndefined()
    wrapper.unmount()
  })

  it('注音可以手填，也可以按汉字自动加拼音', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<p>银行</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    await openRibbon(wrapper, '字体与颜色')
    await clickTool(wrapper, '注音')
    const labels = [...document.body.querySelectorAll('button')].map((button) => button.textContent?.trim())
    expect(labels).toContain('手动填写')
    expect(labels).toContain('自动注音')
    await clickMenu('自动注音')
    const html = editor.getHTML()
    expect(html).toContain('data-ruby="yín"')
    expect(html).toContain('data-ruby="háng"')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    await clickTool(wrapper, '注音')
    await clickMenu('手动填写')
    const prompt = document.querySelector('[aria-label="注音 / 拼音"]')
    expect(prompt, '手动注音').toBeTruthy()
    const cancel = [...prompt!.querySelectorAll('button')].find((button) => button.textContent?.trim() === '取消')
    cancel!.click()
    await nextTick()
    editor.commands.setContent('<p>OK</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    await clickTool(wrapper, '注音')
    await clickMenu('自动注音')
    expect(editor.getHTML()).not.toContain('data-ruby')
    wrapper.unmount()
  })

  it('书写栏目能改段落方向和引用样式', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent('<p>甲乙</p>')
    editor.commands.setTextSelection(2)
    await openRibbon(wrapper, '书写')
    await clickTool(wrapper, '方向')
    await clickMenu('从右到左')
    expect(editor.getHTML()).toContain('dir="rtl"')
    editor.commands.setTextSelection(2)
    await clickTool(wrapper, '引用样式')
    await clickMenu('强调引用')
    expect(editor.getHTML()).toContain('data-quote-style="emphasis"')
    wrapper.unmount()
  })

  it('图片效果栏目能改圆角、阴影和边框', async () => {
    const wrapper = await mountEditor()
    const editor = editorOf(wrapper)
    editor.commands.setContent(`<p>甲</p><img src="${PIXEL}" alt="旧图">`)
    selectImage(editor)
    await openRibbon(wrapper, '图片效果')
    expect(toolButton(wrapper, '圆角')!.attributes('disabled')).toBeUndefined()
    await clickTool(wrapper, '圆角')
    await clickMenu('大圆')
    expect(editor.getHTML()).toContain('data-radius="16px"')
    selectImage(editor)
    await clickTool(wrapper, '阴影')
    await clickMenu('轻影')
    expect(editor.getHTML()).toContain('data-shadow')
    selectImage(editor)
    await clickTool(wrapper, '边框')
    await clickMenu('细边')
    expect(editor.getHTML()).toContain('data-border')
    wrapper.unmount()
  })
})
