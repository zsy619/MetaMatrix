// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import DailyKanbanCanvas from './DailyKanbanCanvas.vue'
import OkrCanvas from './OkrCanvas.vue'
import RiceCanvas from './RiceCanvas.vue'
import type { DailyKanbanDocumentJSON, OkrDocumentJSON, RiceDocumentJSON } from '../../types/canvas'

describe('计划画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('每日看板可以加卡片，并移到下一列', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('daily-kanban')
    const wrapper = mount(DailyKanbanCanvas, { props: { doc: store.current_data as DailyKanbanDocumentJSON } })
    const todo = wrapper.get('[data-column="todo"]')
    expect(todo.get('.count').text()).toBe('2')
    await todo.get('header button').trigger('click')
    expect(wrapper.get('[data-column="todo"] .count').text()).toBe('3')
    await wrapper.get('[data-column="todo"] [aria-label="移到下一列"]').trigger('click')
    expect(wrapper.get('[data-column="doing"] .count').text()).toBe('2')
    wrapper.unmount()
  })

  it('OKR 拖动进度后重算目标完成度', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('okr')
    const wrapper = mount(OkrCanvas, { props: { doc: store.current_data as OkrDocumentJSON } })
    const objective = wrapper.get('section[data-objective="obj_plan"]')
    expect(objective.get('header strong').text()).toBe('30%')
    const range = objective.get('input[type="range"]')
    await range.setValue('100')
    await range.trigger('input')
    expect(wrapper.get('section[data-objective="obj_plan"] header strong').text()).toBe('60%')
    wrapper.unmount()
  })

  it('RICE 改覆盖人数后按分数重排', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('rice')
    const wrapper = mount(RiceCanvas, { props: { doc: store.current_data as RiceDocumentJSON } })
    const first = wrapper.get('.row')
    expect((first.get('.name').element as HTMLInputElement).value).toBe('里程碑写入 RACI')
    expect(first.get('.score').text()).toBe('360')
    const reach = first.get('input[aria-label="覆盖人数"]')
    await reach.setValue('0')
    await reach.trigger('change')
    expect(wrapper.get('.row .name').element).toHaveProperty('value', '甘特图按依赖排程')
    expect(wrapper.get('.row .score').text()).toBe('320')
    wrapper.unmount()
  })
})
