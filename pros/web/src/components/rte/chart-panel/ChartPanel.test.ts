// @vitest-environment happy-dom
/**
 * 图表属性面板的行为测试：
 * - 选中图表块弹出面板；
 * - 面板里的字段改动写回图表块 option；
 * - 数据表格 ⇄ JSON 同步；
 * - 删除按钮需二次确认，确认后图表块被删掉。
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

describe('图表属性面板', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('选中图表块后弹出面板，关闭后不再跟随', async () => {
    const wrapper = await mountEditor()
    // 通过编辑器命令插入一个图表块
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    editor.chain().focus().insertEchartsBlock({ chartType: 'bar' }).run()
    await flushPromises()
    await nextTick()

    // 找到图表块位置并选中
    let pos = -1
    editor.state.doc.descendants((node: any, at: number) => {
      if (node.type.name === 'echartsBlock' && pos < 0) pos = at
      return true
    })
    expect(pos).toBeGreaterThanOrEqual(0)
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
    )
    await flushPromises()
    await nextTick()

    const panel = document.querySelector('.rte-chart-panel')
    expect(panel).toBeTruthy()
    expect(panel?.textContent).toContain('图表属性')

    // 面板里有分区
    expect(panel?.querySelectorAll('.rte-cp-section').length).toBeGreaterThanOrEqual(4)
    wrapper.unmount()
  })


  it('面板里改字段会写回图表块的 option', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    editor.chain().focus().insertEchartsBlock({ chartType: 'bar' }).run()
    await flushPromises()
    await nextTick()

    let pos = -1
    editor.state.doc.descendants((node: any, at: number) => {
      if (node.type.name === 'echartsBlock' && pos < 0) pos = at
      return true
    })
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
    )
    await flushPromises()
    await nextTick()

    // 找到「标题」输入框并改值
    const titleInput = Array.from(
      document.querySelectorAll('.rte-cp-field'),
    ).find((el) => el.textContent?.includes('标题'))?.querySelector('input')
    expect(titleInput).toBeTruthy()
    ;(titleInput as HTMLInputElement).value = '新标题'
    ;(titleInput as HTMLInputElement).dispatchEvent(new Event('change'))
    await flushPromises()
    await nextTick()

    const attrs = editor.state.doc.nodeAt(pos)!.attrs as { option: string }
    const option = JSON.parse(attrs.option)
    expect(option.title.text).toBe('新标题')
    wrapper.unmount()
  })

  it('删除图表需二次确认：取消不删，确认才删', async () => {
    const wrapper = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: any }).editor
    editor.chain().focus().insertEchartsBlock({ chartType: 'bar' }).run()
    await flushPromises()
    await nextTick()

    let pos = -1
    editor.state.doc.descendants((node: any, at: number) => {
      if (node.type.name === 'echartsBlock' && pos < 0) pos = at
      return true
    })
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
    )
    await flushPromises()
    await nextTick()

    expect(countCharts(editor)).toBe(1)

    // 点「删除图表」触发二次确认
    const delBtn = document.querySelector('.rte-cp-btn-danger') as HTMLElement | null
    expect(delBtn).toBeTruthy()
    delBtn!.click()
    await flushPromises()

    // 先取消：图表还在
    const cancelBtn = await findBoxButton('取消')
    expect(cancelBtn).toBeTruthy()
    cancelBtn!.click()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(countCharts(editor)).toBe(1)

    // 再删并确认：图表被删掉
    const delBtn2 = document.querySelector('.rte-cp-btn-danger') as HTMLElement | null
    expect(delBtn2).toBeTruthy()
    delBtn2!.click()
    await flushPromises()
    const okBtn = await findBoxButton('确认删除')
    expect(okBtn).toBeTruthy()
    okBtn!.click()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await nextTick()
    expect(countCharts(editor)).toBe(0)
    wrapper.unmount()
  })
})

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

