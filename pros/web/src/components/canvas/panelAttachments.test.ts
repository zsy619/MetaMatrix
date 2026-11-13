// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import PanelAttachments from './PanelAttachments.vue'

describe('画布资料条', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useDocumentStore().loadFromTemplate('swot')
  })

  it('没有资料时只留一个入口，点开才出现添加文件和链接', async () => {
    const wrapper = mount(PanelAttachments, { props: { panelId: 'block:strengths', compact: true } })
    expect(wrapper.get('button').text()).toBe('添加资料')
    expect(wrapper.text()).not.toContain('+ 添加文件')
    expect(wrapper.find('.pa-empty').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('+ 添加文件')
    expect(wrapper.text()).toContain('+ 添加链接')
    wrapper.unmount()
  })
})
