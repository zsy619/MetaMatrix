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
    template: '<div class="rte-stub ProseMirror">{{ modelValue }}</div>',
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

const TITLES = ['民主', '落实', '激发', '点燃', '投入', '高效', '学习', '责任', '务实', '良性']

describe('科学开会十大原则', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('十条原则的备注卡都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('scientific-meeting-10p')
    const wrapper = mount(ScientificMeeting10pCanvas, {
      props: { doc: store.current_data as ScientificMeeting10pDocumentJSON },
    })
    expect(wrapper.findAll('.sm10p-card')).toHaveLength(10)
    for (const title of TITLES) expect(wrapper.text()).toContain(title)
    wrapper.unmount()
  })
})
