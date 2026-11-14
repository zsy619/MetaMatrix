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
import DualTriangleHumanAiCanvas from './DualTriangleHumanAiCanvas.vue'
import type { DualTriangleDocumentJSON } from '../../types/canvas'

describe('人类三角与 AI 三角', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('两排六格和提醒都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('dual-triangle-human-ai')
    const wrapper = mount(DualTriangleHumanAiCanvas, {
      props: { doc: store.current_data as DualTriangleDocumentJSON },
    })
    expect(wrapper.text()).toContain('人类三角')
    expect(wrapper.text()).toContain('AI三角')
    for (const title of ['审美', '体系', '创造力', '场景', '数据', '基本功']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.text()).toContain('提醒1')
    expect(wrapper.findAll('.hai-cell')).toHaveLength(6)
    wrapper.unmount()
  })
})
