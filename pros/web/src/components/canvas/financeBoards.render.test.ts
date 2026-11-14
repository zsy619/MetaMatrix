// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import CashFlowCanvas from './CashFlowCanvas.vue'
import IncomeStatementCanvas from './IncomeStatementCanvas.vue'
import type { CashFlowDocumentJSON, IncomeStatementDocumentJSON } from '../../types/canvas'

describe('财务画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('利润表改金额后重算毛利，并能再加一行', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('income-statement')
    const wrapper = mount(IncomeStatementCanvas, {
      props: { doc: store.current_data as IncomeStatementDocumentJSON },
    })
    expect(wrapper.text()).toContain('毛利 +160')
    const amount = wrapper.get('section[data-section="revenue"] input[aria-label="金额"]')
    await amount.setValue('300')
    await amount.trigger('change')
    expect(wrapper.text()).toContain('毛利 +260')
    const before = wrapper.findAll('section[data-section="expense"] input[aria-label="项目"]').length
    await wrapper.get('section[data-section="expense"] footer button').trigger('click')
    expect(wrapper.findAll('section[data-section="expense"] input[aria-label="项目"]')).toHaveLength(before + 1)
    wrapper.unmount()
  })

  it('现金流量三块和净额都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('cash-flow')
    const wrapper = mount(CashFlowCanvas, {
      props: { doc: store.current_data as CashFlowDocumentJSON },
    })
    for (const title of ['经营活动', '投资活动', '筹资活动']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.text()).toContain('净额 +60')
    expect(wrapper.findAll('section')).toHaveLength(3)
    wrapper.unmount()
  })
})
