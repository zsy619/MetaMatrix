import type { GanttLink, GanttLinkType, GanttTask } from '../types/canvas'
import { dayNumber } from './classicCanvases'

const MS_DAY = 86_400_000

export interface GanttOutline {
  task: GanttTask
  index: number
  level: number
  wbs: string
  hasChildren: boolean
  hidden: boolean
}

export interface GanttAnalysisRow {
  id: string
  duration: number
  earlyStart: number
  earlyFinish: number
  lateStart: number
  lateFinish: number
  slack: number
  critical: boolean
}

export interface ScheduleResult {
  tasks: GanttTask[]
  cyclic: boolean
}

interface Span {
  es: number
  ef: number
  dur: number
}

export function isoFromDay(day: number): string {
  const date = new Date(day * MS_DAY)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${dayOfMonth}`
}

export function shiftIso(iso: string, deltaDays: number): string {
  const day = dayNumber(iso)
  if (day == null) return iso
  const next = isoFromDay(day + deltaDays)
  const time = /(?:[ T])(\d{2}:\d{2})$/.exec(iso.trim())
  return time ? `${next} ${time[1]}` : next
}

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/

/** 开工、完成：yyyy-MM-dd HH:mm。没有时间的旧日期按 00:00。 */
export function parseGanttDateTime(value: string): { day: number; minutes: number } | null {
  const match = DATE_TIME.exec(value.trim())
  if (!match) return null
  const day = dayNumber(`${match[1]}-${match[2]}-${match[3]}`)
  if (day == null) return null
  const hour = match[4] == null ? 0 : Number(match[4])
  const minute = match[5] == null ? 0 : Number(match[5])
  if (hour > 23 || minute > 59) return null
  return { day, minutes: hour * 60 + minute }
}

export function ganttHasTime(value: string): boolean {
  return /[ T]\d{2}:\d{2}$/.test(value.trim())
}

export function formatGanttDateTime(value: string): string {
  const parsed = parseGanttDateTime(value)
  if (!parsed) return ''
  const hour = String(Math.floor(parsed.minutes / 60)).padStart(2, '0')
  const minute = String(parsed.minutes % 60).padStart(2, '0')
  return `${isoFromDay(parsed.day)} ${hour}:${minute}`
}

/** 交给 datetime-local 的值。 */
export function ganttDateTimeLocal(value: string): string {
  const text = formatGanttDateTime(value)
  return text ? text.replace(' ', 'T') : ''
}

export function normalizeGanttDateTime(value: string): string | null {
  const parsed = parseGanttDateTime(value.trim().replace('T', ' '))
  if (!parsed) return null
  return formatGanttDateTime(value.trim().replace('T', ' '))
}

/** 横条区间。纯日期的完成日含当天；带时间则停在那一分钟。 */
export function ganttRange(start: string, end: string): { from: number; to: number } | null {
  const a = parseGanttDateTime(start)
  const b = parseGanttDateTime(end)
  if (!a || !b) return null
  const from = a.day + (ganttHasTime(start) ? a.minutes / 1440 : 0)
  const to = b.day + (ganttHasTime(end) ? b.minutes / 1440 : 1)
  return from <= to ? { from, to } : { from: to, to: from }
}

export function isWeekend(day: number): boolean {
  const dow = new Date(day * MS_DAY).getUTCDay()
  return dow === 0 || dow === 6
}

/** 从某一天起再走 delta 个工作日。0 表示停在当天。 */
export function shiftWorkDays(day: number, delta: number): number {
  if (delta === 0) return day
  let cursor = day
  let left = Math.abs(delta)
  const step = delta > 0 ? 1 : -1
  while (left > 0) {
    cursor += step
    if (!isWeekend(cursor)) left -= 1
  }
  return cursor
}

export function workingDaysInclusive(start: number, end: number): number {
  if (end < start) return 0
  let count = 0
  for (let day = start; day <= end; day += 1) {
    if (!isWeekend(day)) count += 1
  }
  return count
}

export function finishFromStart(start: number, duration: number): number {
  if (duration <= 0) return start
  return shiftWorkDays(start, duration - 1)
}

export function startFromFinish(finish: number, duration: number): number {
  if (duration <= 0) return finish
  return shiftWorkDays(finish, -(duration - 1))
}

function slackDays(early: number, late: number): number {
  if (late === early) return 0
  if (late > early) return workingDaysInclusive(early, late) - 1
  return -(workingDaysInclusive(late, early) - 1)
}

export function taskHasChildren(tasks: GanttTask[], id: string): boolean {
  return tasks.some((task) => task.parentId === id)
}

function childrenOf(tasks: GanttTask[], id: string): GanttTask[] {
  return tasks.filter((task) => task.parentId === id)
}

export function leafDescendants(tasks: GanttTask[], id: string): GanttTask[] {
  const kids = childrenOf(tasks, id)
  if (!kids.length) return []
  return kids.flatMap((kid) => (taskHasChildren(tasks, kid.id) ? leafDescendants(tasks, kid.id) : [kid]))
}

export function taskLevel(tasks: GanttTask[], task: GanttTask): number {
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

function isHidden(tasks: GanttTask[], task: GanttTask): boolean {
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

export function outlineRows(tasks: GanttTask[]): GanttOutline[] {
  const counters: number[] = []
  return tasks.map((task, index) => {
    const level = taskLevel(tasks, task)
    counters.length = level + 1
    counters[level] = (counters[level] || 0) + 1
    return {
      task,
      index,
      level,
      wbs: counters.slice(0, level + 1).join('.'),
      hasChildren: taskHasChildren(tasks, task.id),
      hidden: isHidden(tasks, task),
    }
  })
}

function storedSpan(task: GanttTask): Span {
  const start = dayNumber(task.start) ?? 0
  const end = dayNumber(task.end) ?? start
  const es = Math.min(start, end)
  const ef = Math.max(start, end)
  if (task.kind === 'milestone') return { es, ef: es, dur: 0 }
  return { es, ef, dur: Math.max(1, workingDaysInclusive(es, ef)) }
}

export function taskDuration(tasks: GanttTask[], task: GanttTask): number {
  if (taskHasChildren(tasks, task.id)) {
    const leaves = leafDescendants(tasks, task.id)
    const starts = leaves.map((leaf) => dayNumber(leaf.start)).filter((day): day is number => day != null)
    const ends = leaves.map((leaf) => dayNumber(leaf.end)).filter((day): day is number => day != null)
    if (!starts.length || !ends.length) return 0
    return workingDaysInclusive(Math.min(...starts), Math.max(...ends))
  }
  return storedSpan(task).dur
}

export function formatSuccessors(tasks: GanttTask[], task: GanttTask): string {
  const indexOf = new Map(tasks.map((item, index) => [item.id, index + 1]))
  return tasks
    .filter((item) => (item.predecessors || []).some((link) => link.taskId === task.id))
    .map((item) => String(indexOf.get(item.id)))
    .filter(Boolean)
    .join(',')
}

export function formatPredecessors(tasks: GanttTask[], task: GanttTask): string {
  const indexOf = new Map(tasks.map((item, index) => [item.id, index + 1]))
  return (task.predecessors || [])
    .map((link) => {
      const id = indexOf.get(link.taskId)
      if (!id) return ''
      const type = link.type || 'FS'
      const lag = link.lag || 0
      const lagText = lag === 0 ? '' : `${lag > 0 ? '+' : ''}${lag}`
      if (type === 'FS' && lag === 0) return String(id)
      return `${id}${type}${lagText}`
    })
    .filter(Boolean)
    .join(',')
}

export function parsePredecessors(text: string, tasks: GanttTask[]): GanttLink[] {
  const links: GanttLink[] = []
  const seen = new Set<string>()
  const pattern = /(?<!\d\.)(\d+)(?!\.\d)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?/gi
  for (const match of text.matchAll(pattern)) {
    const index = Number(match[1]) - 1
    const pred = tasks[index]
    if (!pred || seen.has(pred.id)) continue
    seen.add(pred.id)
    links.push({
      taskId: pred.id,
      type: (match[2] || 'FS').toUpperCase() as GanttLinkType,
      lag: match[3] ? Number(match[3]) : 0,
    })
  }
  return links
}

function minimumStart(predStart: number, predFinish: number, duration: number, link: GanttLink): number {
  const lag = link.lag || 0
  if (link.type === 'SS') return shiftWorkDays(predStart, lag)
  if (link.type === 'FF') return startFromFinish(shiftWorkDays(predFinish, lag), duration)
  if (link.type === 'SF') return startFromFinish(shiftWorkDays(predStart, lag), duration)
  return shiftWorkDays(predFinish, 1 + lag)
}

export function analyzeSchedule(tasks: GanttTask[]): Map<string, GanttAnalysisRow> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const leaves = tasks.filter((task) => !taskHasChildren(tasks, task.id))
  const leafIds = new Set(leaves.map((task) => task.id))
  const spans = new Map(leaves.map((task) => [task.id, storedSpan(task)]))
  const projectFinish = Math.max(0, ...[...spans.values()].map((span) => span.ef))
  const successors = new Map<string, GanttLink[]>()
  const outdegree = new Map(leaves.map((task) => [task.id, 0]))
  for (const task of leaves) {
    for (const link of task.predecessors || []) {
      if (!leafIds.has(link.taskId)) continue
      const list = successors.get(link.taskId) || []
      list.push({ taskId: task.id, type: link.type || 'FS', lag: link.lag || 0 })
      successors.set(link.taskId, list)
      outdegree.set(link.taskId, (outdegree.get(link.taskId) || 0) + 1)
    }
  }
  const late = new Map<string, { ls: number; lf: number }>()
  const queue = leaves.filter((task) => (outdegree.get(task.id) || 0) === 0).map((task) => task.id)
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const span = spans.get(id)!
    let lfCap = projectFinish
    let lsCap = span.dur <= 0 ? projectFinish : startFromFinish(projectFinish, span.dur)
    for (const link of successors.get(id) || []) {
      const succ = late.get(link.taskId)
      if (!succ) continue
      const lag = link.lag || 0
      if (link.type === 'SS') lsCap = Math.min(lsCap, shiftWorkDays(succ.ls, -lag))
      else if (link.type === 'FF') lfCap = Math.min(lfCap, shiftWorkDays(succ.lf, -lag))
      else if (link.type === 'SF') lsCap = Math.min(lsCap, shiftWorkDays(succ.lf, -lag))
      else lfCap = Math.min(lfCap, shiftWorkDays(succ.ls, -(1 + lag)))
    }
    const point = Math.min(lsCap, lfCap)
    const ls = span.dur <= 0 ? point : Math.min(lsCap, startFromFinish(lfCap, span.dur))
    const lf = span.dur <= 0 ? point : finishFromStart(ls, span.dur)
    late.set(id, { ls, lf })
    const task = byId.get(id)
    for (const link of task?.predecessors || []) {
      if (!leafIds.has(link.taskId) || seen.has(link.taskId)) continue
      outdegree.set(link.taskId, (outdegree.get(link.taskId) || 1) - 1)
      if ((outdegree.get(link.taskId) || 0) <= 0) queue.push(link.taskId)
    }
  }
  const rows = new Map<string, GanttAnalysisRow>()
  for (const task of leaves) {
    const span = spans.get(task.id)!
    const fallbackLs = span.dur <= 0 ? projectFinish : startFromFinish(projectFinish, span.dur)
    const timing = late.get(task.id) || { ls: fallbackLs, lf: span.dur <= 0 ? projectFinish : finishFromStart(fallbackLs, span.dur) }
    const slack = slackDays(span.es, timing.ls)
    rows.set(task.id, {
      id: task.id,
      duration: span.dur,
      earlyStart: span.es,
      earlyFinish: span.ef,
      lateStart: timing.ls,
      lateFinish: timing.lf,
      slack,
      critical: slack <= 0,
    })
  }
  for (const task of tasks) {
    if (!taskHasChildren(tasks, task.id)) continue
    const leavesUnder = leafDescendants(tasks, task.id)
    const childRows = leavesUnder.map((leaf) => rows.get(leaf.id)).filter((row): row is GanttAnalysisRow => !!row)
    const starts = childRows.map((row) => row.earlyStart)
    const ends = childRows.map((row) => row.earlyFinish)
    const critical = childRows.some((row) => row.critical)
    const slack = childRows.length ? Math.min(...childRows.map((row) => row.slack)) : 0
    rows.set(task.id, {
      id: task.id,
      duration: taskDuration(tasks, task),
      earlyStart: starts.length ? Math.min(...starts) : 0,
      earlyFinish: ends.length ? Math.max(...ends) : 0,
      lateStart: starts.length ? Math.min(...starts) : 0,
      lateFinish: ends.length ? Math.max(...ends) : 0,
      slack,
      critical,
    })
  }
  return rows
}

function predWindow(tasks: GanttTask[], spans: Map<string, Span>, pred: GanttTask, selfId: string): { es: number; ef: number } | null {
  if (pred.id === selfId) return null
  if (taskHasChildren(tasks, pred.id)) {
    const kids = leafDescendants(tasks, pred.id)
    if (kids.some((kid) => kid.id === selfId)) return null
    const kidSpans = kids.map((kid) => spans.get(kid.id)).filter((span): span is Span => !!span)
    if (!kidSpans.length) return null
    return {
      es: Math.min(...kidSpans.map((span) => span.es)),
      ef: Math.max(...kidSpans.map((span) => span.ef)),
    }
  }
  const span = spans.get(pred.id)
  return span ? { es: span.es, ef: span.ef } : null
}

export function applyDependencySchedule(tasks: GanttTask[]): ScheduleResult {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const leaves = tasks.filter((task) => !taskHasChildren(tasks, task.id))
  const spans = new Map(leaves.map((task) => [task.id, storedSpan(task)]))
  const limit = tasks.length + 2
  let cyclic = false
  for (let pass = 0; pass < limit; pass += 1) {
    let changed = false
    for (const task of leaves) {
      const preds = task.predecessors || []
      if (!preds.length) continue
      const current = spans.get(task.id)!
      const bounds: number[] = []
      for (const link of preds) {
        const pred = byId.get(link.taskId)
        if (!pred) continue
        const window = predWindow(tasks, spans, pred, task.id)
        if (!window) continue
        bounds.push(minimumStart(window.es, window.ef, current.dur, link))
      }
      if (!bounds.length) continue
      const es = Math.max(...bounds)
      const ef = current.dur <= 0 ? es : finishFromStart(es, current.dur)
      if (current.es !== es || current.ef !== ef) {
        spans.set(task.id, { es, ef, dur: current.dur })
        changed = true
      }
    }
    if (!changed) {
      cyclic = false
      break
    }
    cyclic = pass === limit - 1
  }
  if (cyclic) return { tasks, cyclic: true }
  const scheduled = tasks.map((task) => {
    if (taskHasChildren(tasks, task.id)) return task
    if (!(task.predecessors || []).length) return task
    const span = spans.get(task.id)
    if (!span) return task
    return { ...task, start: isoFromDay(span.es), end: isoFromDay(span.ef) }
  })
  return { tasks: rollupSummaryDates(scheduled), cyclic: false }
}

export function rollupSummaryDates(tasks: GanttTask[]): GanttTask[] {
  return tasks.map((task) => {
    const leaves = leafDescendants(tasks, task.id)
    if (!leaves.length) return task
    const starts = leaves.map((leaf) => dayNumber(leaf.start)).filter((day): day is number => day != null)
    const ends = leaves.map((leaf) => dayNumber(leaf.end)).filter((day): day is number => day != null)
    if (!starts.length || !ends.length) return task
    const weights = leaves.map((leaf) => storedSpan(leaf).dur)
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const progress = total
      ? Math.round(leaves.reduce((sum, leaf, index) => sum + (Number(leaf.progress) || 0) * weights[index], 0) / total)
      : 0
    return {
      ...task,
      kind: 'summary' as const,
      start: isoFromDay(Math.min(...starts)),
      end: isoFromDay(Math.max(...ends)),
      progress,
    }
  })
}

export function normalizeOutline(tasks: GanttTask[]): GanttTask[] {
  return rollupSummaryDates(tasks).map((task) => {
    if (task.kind === 'summary' && !taskHasChildren(tasks, task.id)) {
      return { ...task, kind: 'task' as const }
    }
    return task
  })
}

export function indentTask(tasks: GanttTask[], index: number): GanttTask[] {
  if (index <= 0) return tasks
  const previous = tasks[index - 1]
  const task = tasks[index]
  if (!previous || !task || previous.id === task.parentId) return tasks
  const next = tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, parentId: previous.id } : item))
  return normalizeOutline(next)
}

export function outdentTask(tasks: GanttTask[], index: number): GanttTask[] {
  const task = tasks[index]
  if (!task?.parentId) return tasks
  const parent = tasks.find((item) => item.id === task.parentId)
  const next = tasks.map((item, itemIndex) =>
    itemIndex === index ? { ...item, parentId: parent?.parentId || null } : item,
  )
  return normalizeOutline(next)
}

export function removeGanttTask(tasks: GanttTask[], id: string): GanttTask[] {
  const task = tasks.find((item) => item.id === id)
  if (!task || tasks.length <= 1) return tasks
  const next = tasks
    .filter((item) => item.id !== id)
    .map((item) => ({
      ...item,
      parentId: item.parentId === id ? task.parentId || null : item.parentId,
      predecessors: (item.predecessors || []).filter((link) => link.taskId !== id),
    }))
  return normalizeOutline(next)
}

export function calendarSpan(tasks: GanttTask[]): { min: number; max: number } {
  const days = tasks
    .flatMap((task) => [dayNumber(task.start), dayNumber(task.end), dayNumber(task.baselineStart || ''), dayNumber(task.baselineEnd || '')])
    .filter((day): day is number => day != null)
  if (!days.length) return { min: 0, max: 7 }
  return { min: Math.min(...days) - 1, max: Math.max(...days) + 2 }
}

export type GanttScale = 'hour' | 'day' | 'week' | 'month' | 'year'

export const GANTT_SCALES: Array<{ id: GanttScale; label: string }> = [
  { id: 'hour', label: '时' },
  { id: 'day', label: '天' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
]

export function normalizeGanttScale(scale: string | undefined): GanttScale {
  if (scale === 'hour' || scale === 'day' || scale === 'week' || scale === 'month' || scale === 'year') return scale
  return 'week'
}

/** 正数把刻度拉远（时→年），负数拉近。已经到头时停住。 */
export function zoomGanttScale(scale: string | undefined, direction: -1 | 1): GanttScale {
  const order = GANTT_SCALES.map((item) => item.id)
  const index = order.indexOf(normalizeGanttScale(scale))
  const next = Math.min(order.length - 1, Math.max(0, index + direction))
  return order[next] || 'week'
}

export function scalePx(scale: string | undefined): number {
  switch (normalizeGanttScale(scale)) {
    case 'hour':
      return 18
    case 'day':
      return 28
    case 'week':
      return 84
    case 'month':
      return 72
    case 'year':
      return 96
  }
}

export interface GanttAxisTick {
  key: string
  label: string
  group: string
  start: number
  end: number
  weekend: boolean
}

export interface GanttAxisGroup {
  key: string
  label: string
  count: number
}

export interface GanttAxis {
  scale: GanttScale
  /** 轴起点（含），单位是日序号，小时刻度可以是小数。 */
  start: number
  /** 轴终点（不含）。 */
  end: number
  ticks: GanttAxisTick[]
  groups: GanttAxisGroup[]
}

function utcParts(day: number): { year: number; month: number; date: number; dow: number } {
  const date = new Date(Math.round(day) * MS_DAY)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    date: date.getUTCDate(),
    dow: date.getUTCDay(),
  }
}

function utcDay(year: number, monthIndex: number, date: number): number {
  return Math.floor(Date.UTC(year, monthIndex, date) / MS_DAY)
}

function mondayOnOrBefore(day: number): number {
  const dow = utcParts(day).dow
  return day - (dow === 0 ? 6 : dow - 1)
}

function alignAxis(minDay: number, maxDay: number, scale: GanttScale): { start: number; end: number } {
  const first = Math.min(minDay, maxDay)
  const last = Math.max(minDay, maxDay)
  if (scale === 'hour' || scale === 'day') return { start: first, end: last + 1 }
  if (scale === 'week') {
    const start = mondayOnOrBefore(first)
    return { start, end: mondayOnOrBefore(last) + 7 }
  }
  if (scale === 'month') {
    const a = utcParts(first)
    const b = utcParts(last)
    return { start: utcDay(a.year, a.month, 1), end: utcDay(b.year, b.month + 1, 1) }
  }
  const a = utcParts(first)
  const b = utcParts(last)
  return { start: utcDay(a.year, 0, 1), end: utcDay(b.year + 1, 0, 1) }
}

function groupTicks(ticks: GanttAxisTick[]): GanttAxisGroup[] {
  const groups: GanttAxisGroup[] = []
  for (const tick of ticks) {
    const last = groups[groups.length - 1]
    if (!last || last.label !== tick.group) groups.push({ key: `${tick.group}-${tick.key}`, label: tick.group, count: 1 })
    else last.count += 1
  }
  return groups
}

/** 把任务跨度铺成当前刻度的列。小时一列一小时，天一列一天，依此类推。 */
export function buildGanttAxis(minDay: number, maxDay: number, scale: string | undefined): GanttAxis {
  const kind = normalizeGanttScale(scale)
  const { start, end } = alignAxis(minDay, maxDay, kind)
  const ticks: GanttAxisTick[] = []
  if (kind === 'hour') {
    for (let day = start; day < end; day += 1) {
      const parts = utcParts(day)
      const group = `${parts.month + 1}/${String(parts.date).padStart(2, '0')}`
      const weekend = isWeekend(day)
      for (let hour = 0; hour < 24; hour += 1) {
        ticks.push({
          key: `${day}-${hour}`,
          label: hour % 6 === 0 ? String(hour).padStart(2, '0') : '',
          group,
          start: day + hour / 24,
          end: day + (hour + 1) / 24,
          weekend,
        })
      }
    }
  } else if (kind === 'day') {
    for (let day = start; day < end; day += 1) {
      const parts = utcParts(day)
      ticks.push({
        key: String(day),
        label: String(parts.date),
        group: isoFromDay(day).slice(0, 7),
        start: day,
        end: day + 1,
        weekend: isWeekend(day),
      })
    }
  } else if (kind === 'week') {
    for (let day = start; day < end; day += 7) {
      const parts = utcParts(day)
      ticks.push({
        key: `w-${day}`,
        label: `${parts.month + 1}/${parts.date}`,
        group: isoFromDay(day).slice(0, 7),
        start: day,
        end: day + 7,
        weekend: false,
      })
    }
  } else if (kind === 'month') {
    let cursor = start
    while (cursor < end) {
      const parts = utcParts(cursor)
      const next = utcDay(parts.year, parts.month + 1, 1)
      ticks.push({
        key: `m-${cursor}`,
        label: `${parts.month + 1}月`,
        group: String(parts.year),
        start: cursor,
        end: next,
        weekend: false,
      })
      cursor = next
    }
  } else {
    let cursor = start
    while (cursor < end) {
      const parts = utcParts(cursor)
      const next = utcDay(parts.year + 1, 0, 1)
      const decade = Math.floor(parts.year / 10) * 10
      ticks.push({
        key: `y-${parts.year}`,
        label: String(parts.year),
        group: `${decade}年代`,
        start: cursor,
        end: next,
        weekend: false,
      })
      cursor = next
    }
  }
  return { scale: kind, start, end, ticks, groups: groupTicks(ticks) }
}

/** 某个日序号在刻度列上的位置。0 是第一列左缘，列数是右缘。 */
export function ganttUnitIndex(day: number, ticks: Array<{ start: number; end: number }>): number {
  if (!ticks.length) return 0
  if (day <= ticks[0]!.start) return 0
  const last = ticks[ticks.length - 1]!
  if (day >= last.end) return ticks.length
  for (let index = 0; index < ticks.length; index += 1) {
    const tick = ticks[index]!
    if (day < tick.end) {
      const span = tick.end - tick.start
      const frac = span <= 0 ? 0 : (day - tick.start) / span
      return index + Math.min(1, Math.max(0, frac))
    }
  }
  return ticks.length
}

/**
 * 左栏拖拽后的宽度。两侧都留出可读的最小宽度；总宽不够时按比例收回。
 */
export function clampGanttPaneWidth(next: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const minLeft = Math.min(280, Math.max(120, Math.floor(total * 0.28)))
  const minRight = Math.min(180, Math.max(96, Math.floor(total * 0.22)))
  const maxLeft = Math.max(minLeft, total - minRight)
  const width = Number.isFinite(next) ? next : minLeft
  return Math.round(Math.min(maxLeft, Math.max(minLeft, width)))
}

/** 第 index 天在时间轴上的百分比。列等分，加起来贴齐右侧面板。 */
export function dayBandPercent(index: number, count: number): { left: number; width: number } {
  const n = Math.max(1, count)
  const i = Math.min(Math.max(0, index), n)
  return { left: (i / n) * 100, width: 100 / n }
}
