import type { GanttLink, GanttLinkType, GanttTask, GanttTaskKind } from '../types/canvas'

/** Microsoft Project 另存 XML（MSPDI）后的甘特图。 */
export interface ProjectImport {
  title: string
  tasks: GanttTask[]
}

export type ProjectImportOutcome = ProjectImport | { error: string }

const LINK_TYPE: Record<string, GanttLinkType> = {
  '0': 'FF',
  '1': 'FS',
  '2': 'SS',
  '3': 'SF',
  FF: 'FF',
  FS: 'FS',
  SS: 'SS',
  SF: 'SF',
}

function elements(parent: Element, name: string): Element[] {
  return [...parent.children].filter((child) => child.localName.toLowerCase() === name.toLowerCase())
}

function first(parent: Element, name: string): Element | null {
  return elements(parent, name)[0] ?? null
}

function text(parent: Element, name: string): string {
  return first(parent, name)?.textContent?.trim() ?? ''
}

function flag(parent: Element, name: string): boolean {
  const value = text(parent, name)
  return value === '1' || value.toLowerCase() === 'true'
}

function projectDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value.trim())
  if (!match) return ''
  return `${match[1]} ${match[2]}`
}

function lagDays(tenths: number, minutesPerDay: number): number {
  const day = minutesPerDay > 0 ? minutesPerDay : 480
  return Math.round((tenths / 10 / day) * 100) / 100
}

function kindOf(milestone: boolean, summary: boolean): GanttTaskKind {
  if (summary) return 'summary'
  if (milestone) return 'milestone'
  return 'task'
}

/**
 * 解析 Microsoft Project 的 XML。
 * 开工、完成保留到分钟；手动任务用手动日期。
 * 前置任务的滞后按「十分之一分钟」换算成工作日。
 * UID 0 的项目摘要不进任务表。
 */
export function parseMicrosoftProjectXml(xml: string): ProjectImportOutcome {
  const source = xml.replace(/^\uFEFF/, '').trim()
  if (!source.startsWith('<')) return { error: '请在 Project 里另存为 XML 后再导入' }
  const doc = new DOMParser().parseFromString(source, 'text/xml')
  if (doc.querySelector('parsererror')) return { error: '这份 XML 无法读取' }
  const project = doc.documentElement
  if (!project || project.localName.toLowerCase() !== 'project') return { error: '这不是 Microsoft Project 的 XML' }

  const minutesPerDay = Number(text(project, 'MinutesPerDay')) || 480
  const tasksRoot = first(project, 'Tasks')
  const taskNodes = tasksRoot ? elements(tasksRoot, 'Task') : []
  if (!taskNodes.length) return { error: 'XML 里没有任务' }

  const raw = taskNodes
    .map((node, order) => ({ node, order, id: Number(text(node, 'ID')) }))
    .filter((item) => !flag(item.node, 'IsNull'))
    .sort((a, b) => (Number.isFinite(a.id) && Number.isFinite(b.id) ? a.id - b.id : a.order - b.order))

  const uidZero = raw.find((item) => text(item.node, 'UID') === '0')
  const summaryName = text(project, 'Title') || (uidZero ? text(uidZero.node, 'Name') : '')
  const rows = raw.filter((item) => !(text(item.node, 'UID') === '0' && (text(item.node, 'OutlineLevel') === '0' || text(item.node, 'OutlineLevel') === '')))
  if (!rows.length) return { error: 'XML 里没有可导入的任务' }

  const resources = new Map<string, string>()
  const resourceRoot = first(project, 'Resources')
  for (const node of resourceRoot ? elements(resourceRoot, 'Resource') : []) {
    const uid = text(node, 'UID')
    const name = text(node, 'Name')
    if (uid && Number(uid) > 0 && name) resources.set(uid, name)
  }
  const owners = new Map<string, string[]>()
  const assignmentRoot = first(project, 'Assignments')
  for (const node of assignmentRoot ? elements(assignmentRoot, 'Assignment') : []) {
    const taskUid = text(node, 'TaskUID')
    const name = resources.get(text(node, 'ResourceUID'))
    if (!taskUid || !name) continue
    const list = owners.get(taskUid) || []
    if (!list.includes(name)) list.push(name)
    owners.set(taskUid, list)
  }

  const tasks: GanttTask[] = []
  const uidToId = new Map<string, string>()
  const levels: number[] = []
  for (const item of rows) {
    const uid = text(item.node, 'UID') || String(item.order + 1)
    const id = `msp_${uid}`
    uidToId.set(uid, id)
    const level = Math.max(1, Number(text(item.node, 'OutlineLevel')) || 1)
    levels.push(level)
    const manual = flag(item.node, 'Manual')
    const start = projectDate(manual ? text(item.node, 'ManualStart') : '') || projectDate(text(item.node, 'Start'))
    const finish = projectDate(manual ? text(item.node, 'ManualFinish') : '') || projectDate(text(item.node, 'Finish')) || start
    if (!start) return { error: `任务「${text(item.node, 'Name') || uid}」没有开工时间` }
    const progress = Number(text(item.node, 'PercentComplete'))
    const baseline = elements(item.node, 'Baseline').find((node) => text(node, 'Number') === '' || text(node, 'Number') === '0')
    const baselineStart = baseline ? projectDate(text(baseline, 'Start')) : ''
    const baselineFinish = baseline ? projectDate(text(baseline, 'Finish')) : ''
    tasks.push({
      id,
      name: text(item.node, 'Name') || `任务 ${text(item.node, 'ID') || uid}`,
      start,
      end: finish,
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
      owner: (owners.get(uid) || []).join('、'),
      kind: 'task',
      parentId: null,
      predecessors: [],
      ...(baselineStart && baselineFinish ? { baselineStart, baselineEnd: baselineFinish } : {}),
    })
  }

  const stack: Array<{ id: string; level: number }> = []
  rows.forEach((item, index) => {
    const task = tasks[index]
    if (!task) return
    const level = levels[index] || 1
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop()
    task.parentId = stack.length ? stack[stack.length - 1]!.id : null
    stack.push({ id: task.id, level })
    const milestone = flag(item.node, 'Milestone')
    const summary = flag(item.node, 'Summary') || tasks.some((other) => other.parentId === task.id)
    task.kind = kindOf(milestone, summary)
    const links: GanttLink[] = []
    const seen = new Set<string>()
    for (const link of elements(item.node, 'PredecessorLink')) {
      const pred = uidToId.get(text(link, 'PredecessorUID'))
      if (!pred || pred === task.id || seen.has(pred)) continue
      seen.add(pred)
      const type = LINK_TYPE[(text(link, 'Type') || '1').toUpperCase()] || 'FS'
      const lag = lagDays(Number(text(link, 'LinkLag')) || 0, minutesPerDay)
      links.push({ taskId: pred, type, lag })
    }
    task.predecessors = links
  })

  // 子任务可能排在后面，摘要标志再按父子关系收一次。
  for (const task of tasks) {
    if (tasks.some((other) => other.parentId === task.id)) task.kind = 'summary'
  }

  const title = (typeof summaryName === 'string' && summaryName) || '项目甘特图'
  return { title, tasks }
}
