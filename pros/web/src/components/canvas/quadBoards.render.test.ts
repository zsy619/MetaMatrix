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
import ImpactEffortCanvas from './ImpactEffortCanvas.vue'
import StakeholderCanvas from './StakeholderCanvas.vue'
import type { ImpactEffortDocumentJSON, StakeholderDocumentJSON } from '../../types/canvas'

describe('四格画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('影响努力四格和取舍说明都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('impact-effort')
    const wrapper = mount(ImpactEffortCanvas, {
      props: { doc: store.current_data as ImpactEffortDocumentJSON },
    })
    expect(wrapper.text()).toContain('高影响、低努力的立刻做')
    for (const title of ['立刻做', '排进计划', '有空再做', '尽量别做']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.grid section')).toHaveLength(4)
    wrapper.unmount()
  })

  it('干系人四格和接触说明都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('stakeholder-map')
    const wrapper = mount(StakeholderCanvas, {
      props: { doc: store.current_data as StakeholderDocumentJSON },
    })
    expect(wrapper.text()).toContain('再写下一步怎么接触')
    for (const title of ['重点管理', '保持满意', '随时告知', '监督即可']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.grid section')).toHaveLength(4)
    wrapper.unmount()
  })
})
