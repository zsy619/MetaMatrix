// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import {
  isDailyKanbanDoc,
  isRaciMatrixDoc,
  type BusinessModelCanvasDocumentJSON,
  type CashFlowDocumentJSON,
  type DailyKanbanDocumentJSON,
  type RaciMatrixDocumentJSON,
} from '../../types/canvas'
import BusinessModelCanvas from './BusinessModelCanvas.vue'
import CashFlowCanvas from './CashFlowCanvas.vue'
import DailyKanbanCanvas from './DailyKanbanCanvas.vue'
import RaciMatrixCanvas from './RaciMatrixCanvas.vue'

describe('经典画布铺满页面', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('每日看板四列颜色不同，卡片能右移', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('daily-kanban')
    const doc = store.current_data as DailyKanbanDocumentJSON
    const wrapper = mount(DailyKanbanCanvas, { props: { doc } })
    const columns = wrapper.findAll('[data-column]')
    expect(columns.map((column) => column.attributes('data-column'))).toEqual(['todo', 'doing', 'blocked', 'done'])
    const headers = columns.map((column) => column.attributes('style'))
    expect(new Set(headers).size).toBe(4)
    const before = doc.columns[0].cards[0].id
    await columns[0].findAll('button').find((button) => button.text() === '右移')!.trigger('click')
    expect(isDailyKanbanDoc(store.current_data) && store.current_data.columns[1].cards.some((card) => card.id === before)).toBe(true)
  })

  it('现金流量三块变色，净额等于三栏之和', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('cash-flow')
    const doc = store.current_data as CashFlowDocumentJSON
    const wrapper = mount(CashFlowCanvas, { props: { doc } })
    const sections = wrapper.findAll('[data-section]')
    expect(sections.map((section) => section.attributes('data-section'))).toEqual(['operating', 'investing', 'financing'])
    expect(new Set(sections.map((section) => section.attributes('style'))).size).toBe(3)
    expect(wrapper.get('.net').text()).toContain('+60')
    expect(wrapper.get('.net').classes()).toContain('is-in')
  })

  it('商业模式画布按九宫格占位，价值主张跨两行', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('business-model-canvas')
    const doc = store.current_data as BusinessModelCanvasDocumentJSON
    const wrapper = mount(BusinessModelCanvas, { props: { doc } })
    expect(wrapper.find('.bmc-cell--partners').exists()).toBe(true)
    expect(wrapper.find('.bmc-cell--value').exists()).toBe(true)
    expect(wrapper.find('.bmc-cell--costs').exists()).toBe(true)
    expect(wrapper.find('.bmc-cell--revenue').exists()).toBe(true)
    expect(wrapper.findAll('textarea')).toHaveLength(9)
    const value = wrapper.get('.bmc-cell--value').attributes('style') || ''
    const activities = wrapper.get('.bmc-cell--activities').attributes('style') || ''
    expect(value).not.toBe(activities)
  })

  it('RACI 工作缩进成树，降级后挂到上一行', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('raci-matrix')
    const doc = store.current_data as RaciMatrixDocumentJSON
    const wrapper = mount(RaciMatrixCanvas, { props: { doc } })
    expect(wrapper.findAll('tbody tr').length).toBe(7)
    expect(wrapper.text()).toContain('1.3.1')
    const dev = wrapper.findAll('tbody tr').find((row) => (row.get('input[aria-label="工作名称"]').element as HTMLInputElement).value === '开发')
    expect(dev?.attributes('data-level')).toBe('2')
    await dev!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '升级')!.trigger('click')
    const current = store.current_data
    expect(isRaciMatrixDoc(current) && current.tasks.find((task) => task.name === '开发')?.parentId).toBe('task_delivery')
  })
})
