// @vitest-environment happy-dom
/**
 * 图表属性面板的「落盘」链路测试：
 * - 面板改字段 → 图表块 option → 编辑器 HTML → 重新加载后仍在（真落盘）；
 * - 父组件把旧 HTML 回写回来（回声）时，面板的值不会被冲掉；
 * - 表格 ⇄ JSON 双向同步；
 * - 数据接口配置随图表块属性持久化。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { NodeSelection } from '@tiptap/pm/state'
import RichTextEditor from '../../RichTextEditor.vue'
import { useDocumentStore } from '../../../stores/document'
import type { CanvasDocumentJSON } from '../../../types/canvas'

const FIXTURE = '<p>正文</p>'

async function mountEditor(modelValue = FIXTURE) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: 'fixture',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue, panelId: 'panel-a', expanded: true },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
  await flushPromises()
  return wrapper
}

/** 插入一个图表块并选中它，返回编辑器与图表块位置。 */
async function openPanelOnChart(editor: any) {
  editor.chain().focus().insertEchartsBlock({ chartType: 'bar' }).run()
  await flushPromises()
  await nextTick()
  let pos = -1
  editor.state.doc.descendants((node: any, at: number) => {
    if (node.type.name === 'echartsBlock' && pos < 0) pos = at
    return true
  })
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  await flushPromises()
  await nextTick()
  return pos
}

/** 面板里按标签找输入框。 */
function findInput(label: string, root: ParentNode = document): HTMLInputElement | null {
  const rows = Array.from(root.querySelectorAll('.rte-cp-field'))
  const row = rows.find((el) => el.querySelector('.rte-cp-field-label')?.textContent?.includes(label))
  return (row?.querySelector('input,select,textarea') as HTMLInputElement) || null
}

async function setInput(el: Element | null, value: string) {
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('change'))
  await flushPromises()
  await nextTick()
}

describe('图表属性面板落盘链路', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('改字段 → option → HTML → 重新加载后仍在', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    const pos = await openPanelOnChart(editor)

    await setInput(findInput('标题'), '落盘标题')

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { option: string }
    expect(JSON.parse(attrs.option).title.text).toBe('落盘标题')

    const html = editor.getHTML()
    expect(html).toContain('落盘标题')

    // 重新加载（模拟重新打开文档）
    wrapper.unmount()
    document.body.innerHTML = ''
    const again = await mountEditor(html)
    const editor2 = (again.vm as unknown as { editor: any }).editor
    let option = ''
    editor2.state.doc.descendants((node: any) => {
      if (node.type.name === 'echartsBlock') option = node.attrs.option
      return true
    })
    expect(JSON.parse(option).title.text).toBe('落盘标题')
    again.unmount()
  })

  it('父组件回写旧 HTML（回声）时，面板里的改动不被冲掉', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    const pos = await openPanelOnChart(editor)

    const before = editor.getHTML()
    await setInput(findInput('标题'), '不被冲掉')
    expect(JSON.parse((editor.state.doc.nodeAt(pos)!.attrs as { option: string }).option).title.text).toBe(
      '不被冲掉',
    )

    // 模拟父组件把旧内容回写回来（整篇 setContent）
    editor.commands.setContent(before, { emitUpdate: false })
    await flushPromises()
    await nextTick()

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { option: string }
    expect(JSON.parse(attrs.option).title.text).toBe('不被冲掉')
    wrapper.unmount()
  })

  it('表格改单元格 → option 的 series.data 同步；切到 JSON 视图内容一致', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    const pos = await openPanelOnChart(editor)

    // 表格里改第 1 行第 1 个数值
    const cell = document.querySelectorAll('.rte-cp-table tbody tr')[0]!.querySelectorAll('input')[1]!
    await setInput(cell, '999')

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { option: string }
    const option = JSON.parse(attrs.option)
    expect(option.series[0].data[0]).toBe(999)

    // 切到 JSON 视图：文本里应包含改后的数值
    const jsonTab = Array.from(document.querySelectorAll('.rte-cp-tab')).find(
      (el) => el.textContent?.trim() === 'JSON',
    ) as HTMLElement
    jsonTab.click()
    await flushPromises()
    await nextTick()
    const jsonArea = document.querySelector('.rte-cp-json-wrap textarea') as HTMLTextAreaElement
    expect(jsonArea.value).toContain('999')
    wrapper.unmount()
  })

  it('JSON 视图改数据 → 表格同步', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    const pos = await openPanelOnChart(editor)

    const jsonTab = Array.from(document.querySelectorAll('.rte-cp-tab')).find(
      (el) => el.textContent?.trim() === 'JSON',
    ) as HTMLElement
    jsonTab.click()
    await flushPromises()
    await nextTick()
    const jsonArea = document.querySelector('.rte-cp-json-wrap textarea') as HTMLTextAreaElement
    await setInput(
      jsonArea,
      JSON.stringify({ categories: ['甲'], series: [{ name: '本年', data: [11, 22] }] }),
    )

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { option: string }
    const option = JSON.parse(attrs.option)
    expect(option.series[0].data).toEqual([11, 22])

    // 切回表格：类目应显示「甲」
    const tableTab = Array.from(document.querySelectorAll('.rte-cp-tab')).find(
      (el) => el.textContent?.trim() === '表格',
    ) as HTMLElement
    tableTab.click()
    await flushPromises()
    await nextTick()
    const firstCategory = document.querySelectorAll('.rte-cp-table tbody tr')[0]!.querySelector('input')!
    expect((firstCategory as HTMLInputElement).value).toBe('甲')
    wrapper.unmount()
  })

  it('数据接口配置随图表块属性持久化（不含明文密钥）', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    const pos = await openPanelOnChart(editor)

    await setInput(findInput('请求地址'), 'https://example.com/api/data')
    await setInput(findInput('刷新间隔'), '30')

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { dataSource: string }
    const config = JSON.parse(attrs.dataSource)
    expect(config.url).toBe('https://example.com/api/data')
    expect(config.refreshInterval).toBe(30)
    // 配置里没有明文密钥
    expect(attrs.dataSource).not.toContain('Bearer')
    expect(JSON.stringify(config)).not.toContain('secret-token')
    wrapper.unmount()
  })
})
