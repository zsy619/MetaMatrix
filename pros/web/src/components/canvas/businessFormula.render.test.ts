// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('./PanelAttachments.vue', () => ({
  default: defineComponent({
    name: 'PanelAttachments',
    template: '<div class="pa-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import BusinessFormulaCanvas from './BusinessFormulaCanvas.vue'

describe('业务公式画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('搜索模板后只留下匹配项，点选后写入公式', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('business-formula')
    const wrapper = mount(BusinessFormulaCanvas, {
      props: { doc: store.current_data as never },
    })

    expect(wrapper.text()).toContain('电商零售')
    expect(wrapper.text()).toContain('餐饮连锁')

    await wrapper.get('input[placeholder="搜索模板名称 / key / emoji"]').setValue('餐饮')
    expect(wrapper.find('button[title="餐饮连锁"]').exists()).toBe(true)
    expect(wrapper.find('button[title="电商零售"]').exists()).toBe(false)

    await wrapper.get('button[title="餐饮连锁"]').trigger('click')
    expect(wrapper.get('textarea').element.value).toContain('餐饮营收')
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'BusinessFormulaCanvas.vue'),
      'utf8',
    )
    expect(source).toContain('max-height: none')
    expect(source).toContain('-webkit-line-clamp: unset')
    wrapper.unmount()
  })
})