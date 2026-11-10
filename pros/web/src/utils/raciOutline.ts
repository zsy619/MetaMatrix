import type { RaciTask } from '../types/canvas'

export interface RaciOutlineRow {
  task: RaciTask
  index: number
  level: number
  wbs: string
  hasChildren: boolean
  hidden: boolean
}

export function raciHasChildren(tasks: RaciTask[], id: string): boolean {
  return tasks.some((task) => task.parentId === id)
}

export function raciLevel(tasks: RaciTask[], task: RaciTask): number {
  let level = 0
  let parentId = task.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = tasks.find((item) => item.id === parentId)
    if (!parent) break
    level += 1
    parentId = parent.parentId
  }
  return level
}

function isHidden(tasks: RaciTask[], task: RaciTask): boolean {
  let parentId = task.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = tasks.find((item) => item.id === parentId)
    if (!parent) return false
    if (parent.collapsed) return true
    parentId = parent.parentId
  }
  return false
}

export function raciOutline(tasks: RaciTask[]): RaciOutlineRow[] {
  const counters: number[] = []
  return tasks.map((task, index) => {
    const level = raciLevel(tasks, task)
    counters.length = level + 1
    counters[level] = (counters[level] || 0) + 1
    return {
      task,
      index,
      level,
      wbs: counters.slice(0, level + 1).join('.'),
      hasChildren: raciHasChildren(tasks, task.id),
      hidden: isHidden(tasks, task),
    }
  })
}

function flattenRaci(tasks: RaciTask[]): RaciTask[] {
  const ids = new Set(tasks.map((task) => task.id))
  const children = new Map<string, RaciTask[]>()
  const roots: RaciTask[] = []
  for (const task of tasks) {
    if (task.parentId && ids.has(task.parentId)) {
      const list = children.get(task.parentId) || []
      list.push(task)
      children.set(task.parentId, list)
    } else {
      roots.push(task)
    }
  }
  const ordered: RaciTask[] = []
  const walk = (list: RaciTask[]) => {
    for (const task of list) {
      ordered.push(task)
      walk(children.get(task.id) || [])
    }
  }
  walk(roots)
  return ordered
}

export function indentRaci(tasks: RaciTask[], index: number): RaciTask[] {
  if (index <= 0) return tasks
  const previous = tasks[index - 1]
  const task = tasks[index]
  if (!previous || !task || previous.id === task.parentId) return tasks
  return flattenRaci(tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, parentId: previous.id } : item)))
}

export function outdentRaci(tasks: RaciTask[], index: number): RaciTask[] {
  const task = tasks[index]
  if (!task?.parentId) return tasks
  const parent = tasks.find((item) => item.id === task.parentId)
  return flattenRaci(
    tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, parentId: parent?.parentId || null } : item)),
  )
}

export function removeRaciTask(tasks: RaciTask[], id: string): RaciTask[] {
  const task = tasks.find((item) => item.id === id)
  if (!task || tasks.length <= 1) return tasks
  return flattenRaci(
    tasks
      .filter((item) => item.id !== id)
      .map((item) => ({
        ...item,
        parentId: item.parentId === id ? task.parentId || null : item.parentId,
      })),
  )
}
