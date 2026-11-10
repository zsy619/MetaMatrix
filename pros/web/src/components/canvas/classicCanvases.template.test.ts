// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { cloneTemplate, isTemplateId, TEMPLATE_META, useDocumentStore } from '../../stores/document'
import {
  isBusinessModelCanvasDoc,
  isCashFlowDoc,
  isDailyKanbanDoc,
  isProjectGanttDoc,
  isRaciMatrixDoc,
} from '../../types/canvas'
import { cycleRaci, ganttBar, ganttWindow, sumAmounts } from '../../utils/classicCanvases'

describe('经典管理画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('五张画布都登记在模板库', () => {
    for (const id of ['project-gantt', 'raci-matrix', 'daily-kanban', 'business-model-canvas', 'cash-flow'] as const) {
      expect(isTemplateId(id)).toBe(true)
      expect(TEMPLATE_META[id].name.length).toBeGreaterThan(0)
      expect(TEMPLATE_META[id].description.length).toBeGreaterThan(0)
    }
  })

  it('甘特图按日期画出横条，并能追加任务', () => {
    const doc = cloneTemplate('project-gantt')
    expect(isProjectGanttDoc(doc)).toBe(true)
    if (!isProjectGanttDoc(doc)) return
    const window = ganttWindow(doc.tasks)
    const first = ganttBar(doc.tasks[0], window)
    const later = ganttBar(doc.tasks[2], window)
    expect(later.left).toBeGreaterThan(first.left)
    const store = useDocumentStore()
    store.loadFromTemplate('project-gantt')
    store.mutateCanvas((current) => {
      if (!isProjectGanttDoc(current)) return
      current.tasks = [...current.tasks, { id: 'extra', name: '缓冲', start: '2026-12-08', end: '2026-12-12', progress: 0, owner: '' }]
    })
    expect(isProjectGanttDoc(store.current_data) && store.current_data.tasks.some((task) => task.id === 'extra')).toBe(true)
  })

  it('RACI 格子按空 R A C I 循环', () => {
    expect(cycleRaci('')).toBe('R')
    expect(cycleRaci('R')).toBe('A')
    expect(cycleRaci('I')).toBe('')
    const doc = cloneTemplate('raci-matrix')
    expect(isRaciMatrixDoc(doc)).toBe(true)
  })

  it('每日看板能把卡片移到下一列', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('daily-kanban')
    const before = isDailyKanbanDoc(store.current_data) ? store.current_data.columns[0].cards[0].id : ''
    store.mutateCanvas((doc) => {
      if (!isDailyKanbanDoc(doc)) return
      const card = doc.columns[0].cards[0]
      doc.columns = doc.columns.map((column, index) => {
        if (index === 0) return { ...column, cards: column.cards.filter((item) => item.id !== card.id) }
        if (index === 1) return { ...column, cards: [...column.cards, card] }
        return column
      })
    })
    expect(isDailyKanbanDoc(store.current_data) && store.current_data.columns[1].cards.some((card) => card.id === before)).toBe(true)
  })

  it('商业模式画布有九格，现金流量净额等于三栏之和', () => {
    const model = cloneTemplate('business-model-canvas')
    expect(isBusinessModelCanvasDoc(model)).toBe(true)
    if (isBusinessModelCanvasDoc(model)) expect(model.blocks).toHaveLength(9)
    const cash = cloneTemplate('cash-flow')
    expect(isCashFlowDoc(cash)).toBe(true)
    if (!isCashFlowDoc(cash)) return
    cash.sections[0].lines[0].amount = 100
    cash.sections[0].lines[1].amount = -40
    cash.sections[1].lines[0].amount = -30
    cash.sections[2].lines[0].amount = 20
    const net = cash.sections.reduce((sum, section) => sum + sumAmounts(section.lines), 0)
    expect(net).toBe(50)
  })
})
