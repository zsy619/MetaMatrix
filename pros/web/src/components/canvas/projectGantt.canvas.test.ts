// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import { isProjectGanttDoc, type ProjectGanttDocumentJSON } from '../../types/canvas'
import ProjectGanttCanvas from './ProjectGanttCanvas.vue'

function mountGantt() {
  const store = useDocumentStore()
  store.loadFromTemplate('project-gantt')
  const doc = store.current_data as ProjectGanttDocumentJSON
  const wrapper = mount(ProjectGanttCanvas, { props: { doc } })
  return { store, wrapper, doc }
}

describe('项目甘特图', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('画出摘要条、里程碑、关键路径和依赖箭头', () => {
    const { wrapper } = mountGantt()
    const names = wrapper.findAll('input[aria-label="任务名称"]').map((input) => (input.element as HTMLInputElement).value)
    expect(names).toContain('版本发布')
    expect(names).toContain('需求澄清')
    expect((wrapper.get('input[aria-label="甘特图标题"]').element as HTMLInputElement).value).toBe('项目甘特图')
    expect(wrapper.find('.bar.summary').exists()).toBe(true)
    expect(wrapper.find('.milestone.critical').exists()).toBe(true)
    expect(wrapper.findAll('.bar.critical').length).toBeGreaterThan(2)
    expect(wrapper.findAll('.links > path.chart-flow-line').length).toBeGreaterThan(2)
    expect(wrapper.find('.links > path.chart-flow-line.is-selected').exists()).toBe(true)
    expect(wrapper.find('.baseline').exists()).toBe(true)
    const head = wrapper.get('.chart-head')
    expect(head.attributes('style')).toContain('width: 100%')
    expect(head.attributes('style')).toMatch(/min-width:\s*\d+px/)
    expect(wrapper.get('.chart-body').attributes('style')).toContain('width: 100%')
    const col = wrapper.get('.col').attributes('style') || ''
    expect(col).toContain('left: 0%')
    expect(col).toContain('%')
    const ticks = wrapper.findAll('.ticks span')
    expect(ticks.length).toBeGreaterThan(1)
    const headMin = Number((head.attributes('style') || '').match(/min-width:\s*(\d+)px/)?.[1])
    expect(headMin).toBe(ticks.length * 16)
    const docRow = wrapper.findAll('tbody tr').find((row) => row.get('input[aria-label="任务名称"]').element instanceof HTMLInputElement && (row.get('input[aria-label="任务名称"]').element as HTMLInputElement).value === '文档')
    expect(docRow).toBeTruthy()
    expect(Number(docRow!.get('[data-slack]').attributes('data-slack'))).toBeGreaterThan(0)
    expect(docRow!.attributes('data-critical')).toBe('0')
  })

  it('降级、按依赖排程和插入里程碑写回文档', async () => {
    const { store, wrapper } = mountGantt()
    const docRow = wrapper.findAll('tbody tr').find((row) => (row.get('input[aria-label="任务名称"]').element as HTMLInputElement).value === '文档')
    await docRow!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '降级')!.trigger('click')
    const afterIndent = store.current_data
    expect(isProjectGanttDoc(afterIndent)).toBe(true)
    if (!isProjectGanttDoc(afterIndent)) return
    expect(afterIndent.tasks.find((task) => task.name === '文档')?.parentId).toBe('gantt_2')
    expect(afterIndent.tasks.find((task) => task.id === 'gantt_2')?.kind).toBe('summary')

    await wrapper.findAll('button').find((button) => button.text() === '按依赖排程')!.trigger('click')
    expect(wrapper.get('[role="status"]').text()).toBe('已按依赖排程')
    const scheduled = store.current_data
    if (!isProjectGanttDoc(scheduled)) return
    expect(scheduled.tasks.find((task) => task.name === '方案设计')?.start).toBe('2026-11-16')

    await wrapper.findAll('button').find((button) => button.text() === '插入里程碑')!.trigger('click')
    const inserted = store.current_data
    expect(isProjectGanttDoc(inserted) && inserted.tasks.some((task) => task.kind === 'milestone' && task.name === '里程碑')).toBe(true)

    await wrapper.findAll('button').find((button) => button.text() === '日')!.trigger('click')
    expect(isProjectGanttDoc(store.current_data) && store.current_data.scale).toBe('day')
  })

  it('旧的平铺任务仍能画出横条', async () => {
    const { store, wrapper } = mountGantt()
    store.mutateCanvas((doc) => {
      if (!isProjectGanttDoc(doc)) return
      doc.tasks = [{ id: 'a', name: '旧任务', start: '2026-11-09', end: '2026-11-13', progress: 10, owner: '甲' }]
    })
    await nextTick()
    expect((wrapper.get('input[aria-label="任务名称"]').element as HTMLInputElement).value).toBe('旧任务')
    expect(wrapper.find('.bar').exists()).toBe(true)
    expect(wrapper.find('.bar.summary').exists()).toBe(false)
    expect(wrapper.find('.milestone').exists()).toBe(false)
  })

  it('拖动中间竖线改变左栏宽度', async () => {
    const { wrapper } = mountGantt()
    const split = wrapper.get('.split').element as HTMLElement
    const grid = wrapper.get('.grid').element as HTMLElement
    vi.spyOn(split, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 1000,
      top: 0,
      height: 400,
      right: 1100,
      bottom: 400,
      x: 100,
      y: 0,
      toJSON() { return {} },
    })
    const bar = wrapper.get('[aria-label="调节左右面板宽度"]')
    expect(bar.attributes('role')).toBe('separator')
    await bar.trigger('pointerdown', { button: 0, clientX: 700, pointerId: 1 })
    bar.element.dispatchEvent(new PointerEvent('pointermove', { clientX: 640, pointerId: 1 }))
    await nextTick()
    expect((grid as HTMLElement).style.width).toBe('540px')
    bar.element.dispatchEvent(new PointerEvent('pointerup', { clientX: 640, pointerId: 1 }))
    await bar.trigger('keydown', { key: 'ArrowRight' })
    expect((grid as HTMLElement).style.width).toBe('556px')
    await bar.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect((grid as HTMLElement).style.width).toBe('508px')
  })
})
