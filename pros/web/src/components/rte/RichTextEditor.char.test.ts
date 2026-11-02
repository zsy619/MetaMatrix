// @vitest-environment happy-dom
/** 富文本挂载特征：对外契约、HTML 和画布 JSON。 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { RTE_CTX } from './context'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'

const FIXTURE = '<h2>标题</h2><p>一段<strong>加粗</strong>文字</p>'

async function mountEditor(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: 'fixture',
  } as unknown as CanvasDocumentJSON
  store.dirty = false
  let marks = 0
  const note = () => {
    if (store.dirty) {
      marks += 1
      store.dirty = false
    }
  }
  const wrapper = mount(RichTextEditor, {
    props: {
      modelValue: FIXTURE,
      panelId: 'panel-a',
      ...props,
    },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  await viWait(wrapper)
  return { wrapper, store, marks: () => marks, note }
}

async function viWait(wrapper: ReturnType<typeof mount>) {
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
}

describe('RichTextEditor 特征', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('compact 与 expanded 都能挂载，并暴露五个方法', async () => {
    const compact = await mountEditor({ compact: true, expanded: false })
    expect(compact.wrapper.classes()).toContain('compact')
    expect(compact.wrapper.classes()).not.toContain('expanded')
    const exposed = compact.wrapper.vm as unknown as Record<string, unknown>
    for (const key of ['focusEditor', 'editor', 'onDraftBackup', 'openRtePrompt', 'openRteConfirm']) {
      expect(exposed[key], key).toBeTruthy()
    }
    const ctx = (compact.wrapper.vm.$ as unknown as {
      provides: Record<symbol, { props: { panelId: string }; editor: unknown }>
    }).provides[RTE_CTX]
    expect(ctx?.props.panelId).toBe('panel-a')
    expect(ctx?.editor).toBeTruthy()
    compact.wrapper.unmount()

    const expanded = await mountEditor({ compact: false, expanded: true })
    expect(expanded.wrapper.classes()).toContain('expanded')
    expect(expanded.wrapper.find('.ProseMirror').exists()).toBe(true)
    expanded.wrapper.unmount()
  })

  it('fixture 文档的 HTML 保留标题和加粗', async () => {
    const { wrapper } = await mountEditor()
    const editor = (wrapper.vm as unknown as { editor: { getHTML: () => string } }).editor
    const html = editor.getHTML()
    expect(html).toContain('标题')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<h2>')
    wrapper.unmount()
  })

  it('页面大小、页边距和工具栏顺序写入画布 JSON，并计 markDirty', async () => {
    const { wrapper, store, marks, note } = await mountEditor({ expanded: true })
    const size = wrapper.get('select[aria-label="页面大小"]')
    await size.setValue('a4')
    note()
    const margin = wrapper.get('select[aria-label="页边距"]')
    await margin.setValue('narrow')
    note()
    store.setPanelToolbarOrder('panel-a', ['text', 'insert', 'more'])
    note()
    expect(store.current_data?.pageSizeByPanelId).toEqual({ 'panel-a': 'a4' })
    expect(store.current_data?.pageMarginByPanelId).toEqual({
      'panel-a': { preset: 'narrow', top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
    })
    expect(store.current_data?.toolbarGroupOrderByPanelId).toEqual({
      'panel-a': ['type', 'marks', 'align', 'list', 'insert', 'history', 'color', 'paragraph', 'table', 'blocks', 'notes', 'review', 'view', 'other'],
    })
    expect(marks()).toBeGreaterThanOrEqual(3)
    wrapper.unmount()
  })

  it('最大化时可以同时挂两个实例', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const one = mount(RichTextEditor, {
      props: { modelValue: '<p>甲</p>', expanded: true, panelId: 'one' },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    const two = mount(RichTextEditor, {
      props: { modelValue: '<p>乙</p>', expanded: true, panelId: 'two' },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    await viWait(one)
    await viWait(two)
    expect(document.querySelectorAll('.ProseMirror').length).toBe(2)
    one.unmount()
    two.unmount()
  })
})
