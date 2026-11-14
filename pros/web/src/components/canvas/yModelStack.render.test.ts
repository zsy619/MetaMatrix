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
import YModelCanvas from './YModelCanvas.vue'
import type { YModelDocumentJSON } from '../../types/canvas'

describe('Y 模型', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('八个格子都在，中间的认知可以填写', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('y-model')
    const wrapper = mount(YModelCanvas, { props: { doc: store.current_data as YModelDocumentJSON } })
    for (const title of [
      '解决真正问题',
      '理解因：我的框架（1-5条）',
      '理解果：我的目标（TopN）',
      '使用现成模型/规律',
      '自己建模型',
      '提出新假设',
      '如何定性定量分析',
      '∴ 配套的组织和管理工具：',
    ]) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.text()).toContain('先写问题')
    const field = wrapper.get('input[aria-label="填写认知领域"]')
    await field.setValue('产品')
    expect((store.current_data as YModelDocumentJSON).center.blank).toBe('产品')
    wrapper.unmount()
  })
})
