// @vitest-environment happy-dom
/**
 * 图表操作落点测试（块内操作条移除 + 属性面板操作真的生效）：
 *
 * 1. 图表块内不再出现操作条（无「ECharts 图表 / 类型下拉 / 编辑数据 / 删除」）；
 * 2. 属性面板改图表类型 → chartType 与 option 一起写回文档；
 * 3. 属性面板删除：确认弹窗期间选中态丢失（宿主回写）时，确认后仍能删掉；
 * 4. 属性面板删除后，宿主把旧 HTML 整篇回写 → 图表块不能复活。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import RichTextEditor from '../../RichTextEditor.vue'
import { useDocumentStore } from '../../../stores/document'
import type { CanvasDocumentJSON } from '../../../types/canvas'

const FIXTURE = '<p>正文</p>'

async function mountEditor() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: 'fixture',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: FIXTURE, panelId: 'panel-a', expanded: true },
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

function countCharts(editor: any): number {
  let count = 0
  editor.state.doc.descendants((node: any) => {
    if (node.type.name === 'echartsBlock') count += 1
    return true
  })
  return count
}

/** 找到最新一个 ElMessageBox 上文字匹配的按钮。 */
async function findBoxButton(text: string): Promise<HTMLElement | null> {
  for (let i = 0; i < 40; i += 1) {
    await flushPromises()
    await nextTick()
    const boxes = Array.from(document.querySelectorAll('.el-message-box')) as HTMLElement[]
    const box = boxes[boxes.length - 1]
    if (box) {
      const btns = Array.from(box.querySelectorAll('button')) as HTMLElement[]
      const hit = btns.find((btn) => btn.textContent?.includes(text))
      if (hit) return hit
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return null
}

describe('图表操作落点', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('图表块内不再有操作条（无类型下拉 / 编辑数据 / 删除）', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    await openPanelOnChart(editor)

    const block = document.querySelector('.rte-echarts-block') as HTMLElement
    expect(block).toBeTruthy()
    expect(block.querySelector('.rte-echarts-toolbar')).toBeNull()
    expect(block.querySelector('select')).toBeNull()
    expect(block.querySelector('button')).toBeNull()
    const text = block.textContent || ''
    expect(text).not.toContain('编辑数据')
    expect(text).not.toContain('删除')
    expect(text).not.toContain('ECharts 图表')
    wrapper.unmount()
  })

  it('属性面板改图表类型：chartType 与 option 一起写回文档', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    const pos = await openPanelOnChart(editor)

    const select = document.querySelector('.rte-cp-type-select') as HTMLSelectElement
    expect(select).toBeTruthy()
    select.value = 'pie'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    await nextTick()

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { chartType: string; option: string }
    expect(attrs.chartType).toBe('pie')
    const option = JSON.parse(attrs.option)
    expect(option.series[0].type).toBe('pie')
    wrapper.unmount()
  })

  it('删除：确认期间选中态丢失，确认后仍删得掉', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    await openPanelOnChart(editor)
    expect(countCharts(editor)).toBe(1)

    const delBtn = document.querySelector('.rte-cp-btn-danger') as HTMLElement | null
    expect(delBtn).toBeTruthy()
    delBtn!.click()
    await flushPromises()

    // 确认弹窗期间：宿主回写内容导致选区变化 → 面板目标被清空
    let paraPos = -1
    editor.state.doc.descendants((node: any, at: number) => {
      if (node.type.name === 'paragraph' && paraPos < 0) paraPos = at
      return true
    })
    expect(paraPos).toBeGreaterThanOrEqual(0)
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, paraPos + 1)),
    )
    await flushPromises()
    await nextTick()
    // 面板确实因为选区变化而关闭了（目标已被清空）
    expect(document.querySelector('.rte-chart-panel')).toBeNull()

    const okBtn = await findBoxButton('确认删除')
    expect(okBtn).toBeTruthy()
    okBtn!.click()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await nextTick()
    expect(countCharts(editor)).toBe(0)
    wrapper.unmount()
  })

  it('删除确认弹窗挂在 body 上，并带「不被编辑器遮挡」的标记 class', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    await openPanelOnChart(editor)

    const delBtn = document.querySelector('.rte-cp-btn-danger') as HTMLElement | null
    expect(delBtn).toBeTruthy()
    delBtn!.click()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await nextTick()

    // 遮罩挂在 body 上（不在编辑器 DOM 里）→ 不会被编辑器的 overflow / 层级裁掉
    const overlay = document.querySelector(
      '.el-overlay.is-message-box.rte-chart-delete-confirm',
    ) as HTMLElement | null
    expect(overlay).toBeTruthy()
    expect(document.body.contains(overlay!)).toBe(true)
    expect(overlay!.closest('.rte-root')).toBeNull()
    // 标记 class 由 editor.global.css 的 z-index 规则接手（盖过编辑器层级）
    const box = document.querySelector('.el-message-box') as HTMLElement | null
    expect((box?.textContent || '').includes('删除图表')).toBe(true)
    wrapper.unmount()
  })

  it('删除后宿主整篇回写旧 HTML：图表块不复活', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    await openPanelOnChart(editor)
    const htmlBefore = editor.getHTML()

    const delBtn = document.querySelector('.rte-cp-btn-danger') as HTMLElement | null
    expect(delBtn).toBeTruthy()
    delBtn!.click()
    await flushPromises()
    const okBtn = await findBoxButton('确认删除')
    expect(okBtn).toBeTruthy()
    okBtn!.click()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await nextTick()
    expect(countCharts(editor)).toBe(0)

    // 宿主把旧 HTML 整篇写回来（回声）：图表块不能复活
    editor.commands.setContent(htmlBefore, { emitUpdate: false })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await nextTick()
    expect(countCharts(editor)).toBe(0)
    wrapper.unmount()
  })
})
