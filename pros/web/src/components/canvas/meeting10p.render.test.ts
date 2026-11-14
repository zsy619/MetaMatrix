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
import ScientificMeeting10pCanvas from './ScientificMeeting10pCanvas.vue'
import type { ScientificMeeting10pDocumentJSON } from '../../types/canvas'

describe('科学会议十原则', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('十个滑块都在，拖动民主会改分数', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('scientific-meeting-10p')
    const wrapper = mount(ScientificMeeting10pCanvas, {
      props: { doc: store.current_data as ScientificMeeting10pDocumentJSON },
    })
    const sliders = wrapper.findAll('input[type="range"]')
    expect(sliders).toHaveLength(10)
    const democratic = wrapper.get('input[aria-label="民主 滑块"]')
    expect((democratic.element as HTMLInputElement).value).toBe('82')
    await democratic.setValue('40')
    await democratic.trigger('input')
    expect((store.current_data as ScientificMeeting10pDocumentJSON).scores.democratic).toBe(40)
    expect(wrapper.get('.sm10p-slider-val').text()).toBe('40')
    wrapper.unmount()
  })
})
