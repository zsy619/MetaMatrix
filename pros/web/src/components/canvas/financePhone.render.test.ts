// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const dir = dirname(fileURLToPath(import.meta.url))

describe('财务报表窄屏金额单独成行', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('现金流量三栏都在，窄屏金额不再和项目挤在一行', () => {
    const source = readFileSync(join(dir, 'CashFlowCanvas.vue'), 'utf8')
    expect(source).toContain('grid-row: 1 / span 2')
    const store = useDocumentStore()
    store.loadFromTemplate('cash-flow')
    const wrapper = mount(CashFlowCanvas, { props: { doc: store.current_data as CashFlowDocumentJSON } })
    expect(wrapper.text()).toContain('经营活动')
    expect(wrapper.text()).toContain('投资活动')
    expect(wrapper.text()).toContain('筹资活动')
    expect(wrapper.findAll('input[aria-label="金额"]').length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('利润表三栏都在，窄屏金额不再和项目挤在一行', () => {
    const source = readFileSync(join(dir, 'IncomeStatementCanvas.vue'), 'utf8')
    expect(source).toContain('grid-row: 1 / span 2')
    const store = useDocumentStore()
    store.loadFromTemplate('income-statement')
    const wrapper = mount(IncomeStatementCanvas, { props: { doc: store.current_data as IncomeStatementDocumentJSON } })
    expect(wrapper.text()).toContain('营业收入')
    expect(wrapper.text()).toContain('营业成本')
    expect(wrapper.text()).toContain('期间费用')
    wrapper.unmount()
  })
})
