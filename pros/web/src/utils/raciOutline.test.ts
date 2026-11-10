import { describe, expect, it } from 'vitest'
import type { RaciTask } from '../types/canvas'
import { indentRaci, outdentRaci, raciOutline, removeRaciTask } from './raciOutline'

function task(partial: Partial<RaciTask> & Pick<RaciTask, 'id' | 'name'>): RaciTask {
  return { cells: {}, ...partial }
}

describe('RACI 大纲', () => {
  const tasks = [
    task({ id: 'a', name: '交付' }),
    task({ id: 'b', name: '开发', parentId: 'a' }),
    task({ id: 'c', name: '测试', parentId: 'b' }),
  ]

  it('按父子缩进编号，折叠后藏起子孙', () => {
    const rows = raciOutline(tasks)
    expect(rows.map((row) => [row.wbs, row.level])).toEqual([
      ['1', 0],
      ['1.1', 1],
      ['1.1.1', 2],
    ])
    const collapsed = raciOutline(tasks.map((item) => (item.id === 'a' ? { ...item, collapsed: true } : item)))
    expect(collapsed.filter((row) => !row.hidden).map((row) => row.task.id)).toEqual(['a'])
  })

  it('降级升级，删除父工作时子工作挂回上一级', () => {
    const flat = [task({ id: 'a', name: 'A' }), task({ id: 'b', name: 'B' }), task({ id: 'c', name: 'C' })]
    const indented = indentRaci(flat, 1)
    expect(indented[1].parentId).toBe('a')
    const nested = indentRaci(indented, 2)
    expect(nested[2].parentId).toBe('b')
    expect(outdentRaci(nested, 2)[2].parentId).toBe('a')
    const removed = removeRaciTask(nested, 'b')
    expect(removed.find((item) => item.id === 'c')?.parentId).toBe('a')
  })

  it('升级后原父工作的子树仍排在一起', () => {
    const tasks = [
      task({ id: 'root', name: '根' }),
      task({ id: 'build', name: '交付', parentId: 'root' }),
      task({ id: 'dev', name: '开发', parentId: 'build' }),
      task({ id: 'test', name: '测试', parentId: 'build' }),
    ]
    const next = outdentRaci(tasks, 2)
    expect(next.map((item) => item.id)).toEqual(['root', 'build', 'test', 'dev'])
    expect(next.find((item) => item.id === 'dev')?.parentId).toBe('root')
    const rows = raciOutline(next)
    expect(rows.find((row) => row.task.id === 'test')?.wbs).toBe('1.1.1')
    expect(rows.find((row) => row.task.id === 'dev')?.wbs).toBe('1.2')
  })
})