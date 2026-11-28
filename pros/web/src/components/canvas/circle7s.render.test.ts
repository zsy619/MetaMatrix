// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('../RichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'RichTextEditor',
    props: { modelValue: { type: String, default: '' } },
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  }),
}))

vi.mock('./PanelAttachments.vue', () => ({
  default: defineComponent({
    name: 'PanelAttachments',
    template: '<div class="pa-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import GoldenCircleCanvas from './GoldenCircleCanvas.vue'
import SevenSCanvas from './SevenSCanvas.vue'
import type { GoldenCircleDocumentJSON, SevenSDocumentJSON } from '../../types/canvas'
import { isGoldenCircleDoc } from '../../types/canvas'

describe('黄金圈和 7S', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('黄金圈从为什么写起，主题能留下', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('golden-circle')
    const wrapper = mount(GoldenCircleCanvas, { props: { doc: store.current_data as GoldenCircleDocumentJSON } })
    const ids = wrapper.findAll('[data-block]').map((node) => node.attributes('data-block'))
    expect(ids).toEqual(['why', 'how', 'what'])
    const topic = wrapper.get('[data-block="why"] input[aria-label="内容主题"]')
    await topic.setValue('让决定可回看')
    await topic.trigger('blur')
    const doc = store.current_data
    expect(isGoldenCircleDoc(doc) && doc.blocks.find((block) => block.id === 'why')?.keyword).toBe('让决定可回看')
    wrapper.unmount()
  })

  it('7S 七格都在，共同价值观横跨中间', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('seven-s')
    const wrapper = mount(SevenSCanvas, { props: { doc: store.current_data as SevenSDocumentJSON } })
    for (const title of ['战略', '结构', '系统', '共同价值观', '风格', '人员', '技能']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('section')).toHaveLength(7)
    expect(wrapper.get('[data-block="shared"]').classes()).toContain('shared')
    wrapper.unmount()
  })
})
