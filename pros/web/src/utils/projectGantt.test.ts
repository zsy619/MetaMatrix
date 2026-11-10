import { describe, expect, it } from 'vitest'
import type { GanttTask } from '../types/canvas'
import {
  applyDependencySchedule,
  analyzeSchedule,
  formatPredecessors,
  indentTask,
  outdentTask,
  outlineRows,
  parsePredecessors,
  removeGanttTask,
  shiftWorkDays,
} from './projectGantt'
import { dayNumber } from './classicCanvases'

function task(partial: Partial<GanttTask> & Pick<GanttTask, 'id' | 'name' | 'start' | 'end'>): GanttTask {
  return { progress: 0, owner: '', ...partial }
}

describe('项目甘特排程', () => {
  it('FS 跨过周末，lag 0 从下一工作日开始', () => {
    const friday = dayNumber('2026-11-13')!
    expect(shiftWorkDays(friday, 1)).toBe(dayNumber('2026-11-16'))
    expect(shiftWorkDays(friday, 2)).toBe(dayNumber('2026-11-17'))
    expect(shiftWorkDays(friday, 0)).toBe(friday)
  })

  it('按依赖排程写入 FS/SS/FF/SF，并让摘要条包住子任务', () => {
    const tasks = [
      task({ id: 's', name: '摘要', start: '2026-11-01', end: '2026-11-02', kind: 'summary' }),
      task({ id: 'a', name: '需求', start: '2026-11-09', end: '2026-11-13', parentId: 's' }),
      task({
        id: 'b',
        name: '方案',
        start: '2026-11-09',
        end: '2026-11-13',
        parentId: 's',
        predecessors: [{ taskId: 'a', type: 'FS', lag: 1 }],
      }),
      task({
        id: 'c',
        name: '并行',
        start: '2026-11-09',
        end: '2026-11-10',
        parentId: 's',
        predecessors: [{ taskId: 'a', type: 'SS', lag: 0 }],
      }),
      task({
        id: 'd',
        name: '收尾',
        start: '2026-11-09',
        end: '2026-11-11',
        parentId: 's',
        predecessors: [{ taskId: 'b', type: 'FF', lag: 0 }],
      }),
      task({
        id: 'e',
        name: '里程碑',
        start: '2026-11-09',
        end: '2026-11-09',
        kind: 'milestone',
        parentId: 's',
        predecessors: [{ taskId: 'a', type: 'SF', lag: 0 }],
      }),
    ]
    const scheduled = applyDependencySchedule(tasks)
    expect(scheduled.cyclic).toBe(false)
    const byId = new Map(scheduled.tasks.map((item) => [item.id, item]))
    expect(byId.get('b')?.start).toBe('2026-11-17')
    expect(byId.get('b')?.end).toBe('2026-11-23')
    expect(byId.get('c')?.start).toBe('2026-11-09')
    expect(byId.get('d')?.end).toBe('2026-11-23')
    expect(byId.get('e')?.start).toBe('2026-11-09')
    expect(byId.get('e')?.end).toBe('2026-11-09')
    expect(byId.get('s')?.start).toBe('2026-11-09')
    expect(byId.get('s')?.end).toBe('2026-11-23')
    expect(byId.get('s')?.kind).toBe('summary')
  })

  it('没有前置任务的日期保持不动，成环时不改日期', () => {
    const manual = [
      task({ id: 'a', name: '手工', start: '2026-11-18', end: '2026-11-20' }),
      task({ id: 'b', name: '环', start: '2026-11-09', end: '2026-11-10', predecessors: [{ taskId: 'c', type: 'FS', lag: 0 }] }),
      task({ id: 'c', name: '环', start: '2026-11-09', end: '2026-11-10', predecessors: [{ taskId: 'b', type: 'FS', lag: 0 }] }),
    ]
    const kept = applyDependencySchedule(manual)
    expect(kept.cyclic).toBe(true)
    expect(kept.tasks[0].start).toBe('2026-11-18')
    expect(kept.tasks[1].start).toBe('2026-11-09')
  })

  it('关键路径是时差为 0 的链，并行短任务有时差', () => {
    const tasks = [
      task({ id: 'a', name: '需求', start: '2026-11-09', end: '2026-11-13' }),
      task({ id: 'b', name: '方案', start: '2026-11-16', end: '2026-11-20', predecessors: [{ taskId: 'a', type: 'FS', lag: 0 }] }),
      task({ id: 'c', name: '文档', start: '2026-11-09', end: '2026-11-09' }),
    ]
    const rows = analyzeSchedule(tasks)
    expect(rows.get('a')?.critical).toBe(true)
    expect(rows.get('b')?.critical).toBe(true)
    expect(rows.get('b')?.slack).toBe(0)
    expect(rows.get('c')?.critical).toBe(false)
    expect(rows.get('c')?.slack).toBeGreaterThan(0)
  })

  it('前置任务文本用行号，FS+0 省略类型', () => {
    const tasks = [
      task({ id: 'a', name: 'A', start: '2026-11-09', end: '2026-11-10' }),
      task({ id: 'b', name: 'B', start: '2026-11-09', end: '2026-11-10' }),
      task({
        id: 'c',
        name: 'C',
        start: '2026-11-09',
        end: '2026-11-10',
        predecessors: [
          { taskId: 'a', type: 'FS', lag: 0 },
          { taskId: 'b', type: 'SS', lag: -1 },
        ],
      }),
    ]
    expect(formatPredecessors(tasks, tasks[2])).toBe('1,2SS-1')
    expect(parsePredecessors('2FS+1, 3SS-1', tasks).map((link) => [link.taskId, link.type, link.lag])).toEqual([
      ['b', 'FS', 1],
      ['c', 'SS', -1],
    ])
    expect(parsePredecessors('1.2', tasks)).toEqual([])
  })

  it('降级升级折叠，删除后子任务挂回上一级', () => {
    const tasks = [
      task({ id: 'a', name: 'A', start: '2026-11-09', end: '2026-11-13' }),
      task({ id: 'b', name: 'B', start: '2026-11-16', end: '2026-11-18' }),
      task({ id: 'c', name: 'C', start: '2026-11-19', end: '2026-11-20', predecessors: [{ taskId: 'b', type: 'FS', lag: 0 }] }),
    ]
    const indented = indentTask(tasks, 1)
    expect(indented[1].parentId).toBe('a')
    expect(indented[0].kind).toBe('summary')
    expect(indented[0].start).toBe('2026-11-16')
    expect(indented[0].end).toBe('2026-11-18')
    const nested = indentTask(indented, 2)
    expect(nested[2].parentId).toBe('b')
    const collapsed = outlineRows(nested.map((item, index) => (index === 0 ? { ...item, collapsed: true } : item)))
    expect(collapsed[1].hidden).toBe(true)
    expect(collapsed[2].hidden).toBe(true)
    const outdented = outdentTask(nested, 2)
    expect(outdented[2].parentId).toBe('a')
    const removed = removeGanttTask(nested, 'b')
    expect(removed.map((item) => item.id)).toEqual(['a', 'c'])
    expect(removed.find((item) => item.id === 'c')?.parentId).toBe('a')
    expect(removed.find((item) => item.id === 'c')?.predecessors).toEqual([])
  })
})
