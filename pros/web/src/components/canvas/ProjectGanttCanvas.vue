<script setup lang="ts">
import { computed, ref } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { GanttTask, ProjectGanttDocumentJSON } from '../../types/canvas'
import { isProjectGanttDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { dayNumber, newCanvasId } from '../../utils/classicCanvases'
import {
  analyzeSchedule,
  applyDependencySchedule,
  calendarSpan,
  dayBandPercent,
  finishFromStart,
  formatPredecessors,
  formatSuccessors,
  indentTask,
  isoFromDay,
  isWeekend,
  leafDescendants,
  normalizeOutline,
  outlineRows,
  outdentTask,
  parsePredecessors,
  removeGanttTask,
  scalePx,
  shiftIso,
  shiftWorkDays,
  taskDuration,
  taskHasChildren,
} from '../../utils/projectGantt'

const props = defineProps<{ doc: ProjectGanttDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const ROW = 44
const frame = computed(() => ({ ...chrome.value, '--gantt-row': `${ROW}px` }))
const HEAD = 40
const selectedId = ref<string | null>(null)
const status = ref('')
const preview = ref<Record<string, { start: string; end: string }>>({})
const gridRef = ref<HTMLElement | null>(null)
const chartRef = ref<HTMLElement | null>(null)
let syncing = false

const tasks = computed(() => props.doc.tasks)
const analysis = computed(() => analyzeSchedule(tasks.value))
const visibleRows = computed(() => outlineRows(tasks.value).filter((row) => !row.hidden))
const unit = computed(() => scalePx(props.doc.scale))

function shown(task: GanttTask): GanttTask {
  const over = preview.value[task.id]
  return over ? { ...task, start: over.start, end: over.end } : task
}

const span = computed(() => calendarSpan(tasks.value.map((task) => shown(task))))
const days = computed(() => {
  const list: number[] = []
  for (let day = span.value.min; day <= span.value.max; day += 1) list.push(day)
  return list
})
const dayCount = computed(() => Math.max(1, days.value.length))
const naturalWidth = computed(() => dayCount.value * unit.value)
const months = computed(() => {
  const groups: Array<{ label: string; days: number }> = []
  for (const day of days.value) {
    const label = isoFromDay(day).slice(0, 7)
    const last = groups[groups.length - 1]
    if (!last || last.label !== label) groups.push({ label, days: 1 })
    else last.days += 1
  }
  return groups
})

const todayLeft = computed(() => {
  const now = new Date()
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const day = dayNumber(iso)
  if (day == null || day < span.value.min || day > span.value.max) return null
  return dayBandPercent(day - span.value.min, dayCount.value).left + dayBandPercent(0, dayCount.value).width / 2
})

const selectedIndex = computed(() => tasks.value.findIndex((task) => task.id === selectedId.value))

function tickLabel(day: number): string {
  const date = new Date(day * 86_400_000)
  if (props.doc.scale === 'month') return ''
  if (props.doc.scale !== 'day' && date.getUTCDay() !== 1) return ''
  return String(date.getUTCDate())
}

function slackOf(id: string): number {
  return analysis.value.get(id)?.slack ?? 0
}

function isCritical(id: string): boolean {
  return !!analysis.value.get(id)?.critical
}

function barStyle(task: GanttTask): Record<string, string> {
  const box = barBox(task)
  return box ? { left: `${box.left}%`, width: `${box.width}%` } : {}
}

function milestoneStyle(task: GanttTask): Record<string, string> {
  const box = barBox(task)
  return box ? { left: `calc(${box.left + box.width / 2}% - 8px)` } : {}
}

function baselineStyle(task: GanttTask): Record<string, string> {
  const box = baselineBox(task)
  return box ? { left: `${box.left}%`, width: `${box.width}%` } : {}
}

function rangePercent(from: number, to: number): { left: number; width: number } {
  const n = dayCount.value
  const spanDays = Math.max(0.35, to - from + 1)
  return { left: ((from - span.value.min) / n) * 100, width: (spanDays / n) * 100 }
}

function barBox(task: GanttTask): { left: number; width: number } | null {
  const item = shown(task)
  const start = dayNumber(item.start)
  const end = dayNumber(item.end)
  if (start == null || end == null) return null
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  return rangePercent(from, to)
}

function baselineBox(task: GanttTask): { left: number; width: number } | null {
  if (!task.baselineStart || !task.baselineEnd) return null
  const start = dayNumber(task.baselineStart)
  const end = dayNumber(task.baselineEnd)
  if (start == null || end == null) return null
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  return rangePercent(from, to)
}

function columnStyle(index: number): Record<string, string> {
  const band = dayBandPercent(index, dayCount.value)
  return { left: `${band.left}%`, width: `${band.width}%` }
}

function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} H ${x2}`
  if (x2 >= x1 + 16) return `M ${x1} ${y1} H ${x1 + 10} V ${y2} H ${x2}`
  const lane = Math.max(y1, y2) + 11
  return `M ${x1} ${y1} H ${x1 + 8} V ${lane} H ${x2 - 8} V ${y2} H ${x2}`
}

const arrows = computed(() => {
  const indexOf = new Map(visibleRows.value.map((row, index) => [row.task.id, index]))
  return visibleRows.value.flatMap((row) => {
    const task = shown(row.task)
    const toIndex = indexOf.get(task.id)
    if (toIndex == null) return []
    return (task.predecessors || []).flatMap((link) => {
      const fromIndex = indexOf.get(link.taskId)
      const pred = tasks.value.find((item) => item.id === link.taskId)
      if (fromIndex == null || !pred) return []
      const predShown = shown(pred)
      const predStart = dayNumber(predShown.start)
      const predEnd = dayNumber(predShown.end)
      const succStart = dayNumber(task.start)
      const succEnd = dayNumber(task.end)
      if (predStart == null || predEnd == null || succStart == null || succEnd == null) return []
      const type = link.type || 'FS'
      const fromX = type === 'SS' || type === 'SF' ? (predStart - span.value.min) * unit.value : (predEnd - span.value.min + 1) * unit.value
      const toX = type === 'FF' || type === 'SF' ? (succEnd - span.value.min + 1) * unit.value : (succStart - span.value.min) * unit.value
      const fromY = fromIndex * ROW + ROW / 2
      const toY = toIndex * ROW + ROW / 2
      return [{
        key: `${pred.id}-${task.id}-${type}-${link.lag || 0}`,
        critical: isCritical(pred.id) && isCritical(task.id),
        label: formatPredecessors(tasks.value, { ...task, predecessors: [link] }),
        d: arrowPath(fromX, fromY, toX, toY),
      }]
    })
  })
})

function replaceTasks(next: GanttTask[]) {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    doc.tasks = next
  })
}

function patchTask(id: string, patch: Partial<GanttTask>) {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    doc.tasks = doc.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
  })
}

function select(id: string) {
  selectedId.value = id
}

function insert(kind: 'task' | 'milestone') {
  const list = tasks.value
  const index = selectedIndex.value >= 0 ? selectedIndex.value : list.length - 1
  const anchor = list[index]
  let startDay = dayNumber(anchor ? shiftIso(anchor.end || anchor.start, 1) : '') ?? dayNumber(isoToday()) ?? 0
  if (isWeekend(startDay)) startDay = shiftWorkDays(startDay, 1)
  const start = isoFromDay(startDay)
  const end = kind === 'milestone' ? start : isoFromDay(finishFromStart(startDay, 1))
  const item: GanttTask = {
    id: newCanvasId('gantt'),
    name: kind === 'milestone' ? '里程碑' : '新任务',
    start,
    end,
    progress: 0,
    owner: '',
    kind,
    parentId: anchor?.parentId || null,
  }
  const next = [...list]
  next.splice(Math.max(0, index + 1), 0, item)
  replaceTasks(normalizeOutline(next))
  selectedId.value = item.id
  status.value = ''
}

function isoToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function indent() {
  if (selectedIndex.value < 0) return
  replaceTasks(indentTask(tasks.value, selectedIndex.value))
}

function outdent() {
  if (selectedIndex.value < 0) return
  replaceTasks(outdentTask(tasks.value, selectedIndex.value))
}

function linkPrevious() {
  const index = selectedIndex.value
  if (index <= 0) {
    status.value = '先选中一行，再链接到上一行'
    return
  }
  const prev = tasks.value[index - 1]
  const task = tasks.value[index]
  if (leafDescendants(tasks.value, task.id).some((leaf) => leaf.id === prev.id)) {
    status.value = '不能链接到自己的子任务'
    return
  }
  const links = task.predecessors || []
  if (links.some((link) => link.taskId === prev.id)) {
    status.value = '已经链接过上一行'
    return
  }
  patchTask(task.id, { predecessors: [...links, { taskId: prev.id, type: 'FS', lag: 0 }] })
  status.value = ''
}

function unlink() {
  const task = tasks.value.find((item) => item.id === selectedId.value)
  if (!task) return
  patchTask(task.id, { predecessors: [] })
  status.value = ''
}

function toggleMilestone() {
  const task = tasks.value.find((item) => item.id === selectedId.value)
  if (!task) return
  if (taskHasChildren(tasks.value, task.id)) {
    status.value = '摘要任务按子任务汇总，不能改成里程碑'
    return
  }
  if (task.kind === 'milestone') {
    const start = dayNumber(task.start) ?? 0
    patchTask(task.id, { kind: 'task', end: isoFromDay(finishFromStart(start, 1)) })
    status.value = ''
    return
  }
  patchTask(task.id, { kind: 'milestone', end: task.start })
  status.value = ''
}

function schedule() {
  const result = applyDependencySchedule(tasks.value)
  if (result.cyclic) {
    status.value = '依赖成环，未改日期'
    return
  }
  replaceTasks(result.tasks)
  status.value = '已按依赖排程'
}

function setBaseline() {
  const id = selectedId.value
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    doc.tasks = doc.tasks.map((task) => {
      if (id && task.id !== id) return task
      return { ...task, baselineStart: task.start, baselineEnd: task.end }
    })
  })
  status.value = id ? '已设置选中任务的比较基准' : '已设置全部任务的比较基准'
}

function setScale(scale: 'day' | 'week' | 'month') {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    doc.scale = scale
  })
}

function setTitle(value: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    doc.title = value
  })
}

function setDuration(task: GanttTask, raw: string) {
  if (taskHasChildren(tasks.value, task.id)) return
  const days = Math.round(Number(raw))
  if (!Number.isFinite(days) || days < 0) return
  const start = dayNumber(task.start) ?? 0
  if (days === 0) {
    patchTask(task.id, { kind: 'milestone', start: isoFromDay(start), end: isoFromDay(start) })
    return
  }
  patchTask(task.id, {
    kind: task.kind === 'milestone' ? 'task' : task.kind,
    end: isoFromDay(finishFromStart(start, days)),
  })
}

function setPred(task: GanttTask, text: string) {
  const links = parsePredecessors(text, tasks.value).filter((link) => link.taskId !== task.id)
  patchTask(task.id, { predecessors: links })
}

function removeSelected() {
  if (!selectedId.value) return
  const next = removeGanttTask(tasks.value, selectedId.value)
  if (next === tasks.value) return
  replaceTasks(next)
  selectedId.value = next[0]?.id || null
}

function onGridScroll() {
  if (syncing || !gridRef.value || !chartRef.value) return
  syncing = true
  chartRef.value.scrollTop = gridRef.value.scrollTop
  syncing = false
}

function onChartScroll() {
  if (syncing || !gridRef.value || !chartRef.value) return
  syncing = true
  gridRef.value.scrollTop = chartRef.value.scrollTop
  syncing = false
}

function descendantIds(id: string): string[] {
  const ids: string[] = []
  const walk = (parentId: string) => {
    for (const task of tasks.value) {
      if (task.parentId === parentId) {
        ids.push(task.id)
        walk(task.id)
      }
    }
  }
  walk(id)
  return ids
}

function startDrag(event: PointerEvent, task: GanttTask, mode: 'move' | 'resize') {
  if (event.button !== 0) return
  if (mode === 'resize' && (task.kind === 'milestone' || taskHasChildren(tasks.value, task.id))) return
  event.preventDefault()
  event.stopPropagation()
  selectedId.value = task.id
  const originX = event.clientX
  const body = chartRef.value?.querySelector('.chart-body') as HTMLElement | null
  const bodyWidth = body?.getBoundingClientRect().width || 0
  const dayPx = bodyWidth > 0 ? bodyWidth / dayCount.value : unit.value
  const ids = mode === 'move' ? [task.id, ...descendantIds(task.id)] : [task.id]
  const snapshot = tasks.value.filter((item) => ids.includes(item.id)).map((item) => ({ id: item.id, start: item.start, end: item.end }))
  const move = (ev: PointerEvent) => {
    const delta = Math.round((ev.clientX - originX) / dayPx)
    const next: Record<string, { start: string; end: string }> = {}
    for (const item of snapshot) {
      if (mode === 'resize') {
        const startDay = dayNumber(item.start) ?? 0
        let endDay = (dayNumber(item.end) ?? startDay) + delta
        if (endDay < startDay) endDay = startDay
        next[item.id] = { start: item.start, end: isoFromDay(endDay) }
      } else {
        next[item.id] = { start: shiftIso(item.start, delta), end: shiftIso(item.end, delta) }
      }
    }
    preview.value = next
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const patch = preview.value
    preview.value = {}
    const moved = Object.values(patch).some((item, index) => item.start !== snapshot[index]?.start || item.end !== snapshot[index]?.end)
    if (!moved) return
    documentStore.mutateCanvas((doc) => {
      if (!isProjectGanttDoc(doc)) return
      doc.tasks = normalizeOutline(doc.tasks.map((item) => (patch[item.id] ? { ...item, ...patch[item.id] } : item)))
    })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <div class="gantt" :style="frame" aria-label="项目甘特图">
    <header class="gantt-head">
      <input class="title" :value="doc.title" aria-label="甘特图标题" @change="setTitle(($event.target as HTMLInputElement).value)" />
      <div class="toolbar">
        <button type="button" @click="insert('task')">插入任务</button>
        <button type="button" @click="insert('milestone')">插入里程碑</button>
        <button type="button" :disabled="selectedIndex < 0" @click="toggleMilestone">设为里程碑</button>
        <button type="button" :disabled="selectedIndex <= 0" @click="indent">降级</button>
        <button type="button" :disabled="selectedIndex < 0 || !tasks[selectedIndex]?.parentId" @click="outdent">升级</button>
        <button type="button" :disabled="selectedIndex <= 0" @click="linkPrevious">链接任务</button>
        <button type="button" :disabled="selectedIndex < 0" @click="unlink">取消链接</button>
        <button type="button" @click="schedule">按依赖排程</button>
        <button type="button" @click="setBaseline">设置比较基准</button>
        <button type="button" :disabled="!selectedId || tasks.length <= 1" @click="removeSelected">删除</button>
        <span class="zoom" role="group" aria-label="时间刻度">
          <button type="button" :aria-pressed="doc.scale === 'day'" @click="setScale('day')">日</button>
          <button type="button" :aria-pressed="!doc.scale || doc.scale === 'week'" @click="setScale('week')">周</button>
          <button type="button" :aria-pressed="doc.scale === 'month'" @click="setScale('month')">月</button>
        </span>
      </div>
    </header>
    <p v-if="status" class="status" role="status">{{ status }}</p>
    <div class="split">
      <div ref="gridRef" class="grid" @scroll="onGridScroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>WBS</th>
              <th>任务名称</th>
              <th>工期</th>
              <th>开始</th>
              <th>完成</th>
              <th>前置任务</th>
              <th>后置任务</th>
              <th>资源</th>
              <th>%</th>
              <th>时差</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.task.id"
              :class="{ selected: row.task.id === selectedId, critical: isCritical(row.task.id) }"
              :data-critical="isCritical(row.task.id) ? '1' : '0'"
              @click="select(row.task.id)"
            >
              <td class="id">{{ row.index + 1 }}</td>
              <td class="wbs">{{ row.wbs }}</td>
              <td class="name">
                <span class="indent" :style="{ width: row.level * 14 + 'px' }" />
                <button
                  v-if="row.hasChildren"
                  type="button"
                  class="twist"
                  :aria-label="row.task.collapsed ? '展开' : '折叠'"
                  @click.stop="patchTask(row.task.id, { collapsed: !row.task.collapsed })"
                >{{ row.task.collapsed ? '▸' : '▾' }}</button>
                <span v-else class="twist twist--blank" />
                <input :value="row.task.name" aria-label="任务名称" @click.stop @change="patchTask(row.task.id, { name: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  :value="taskDuration(tasks, shown(row.task))"
                  :disabled="row.hasChildren"
                  aria-label="工期"
                  @click.stop
                  @change="setDuration(row.task, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td><input type="date" :value="shown(row.task).start" aria-label="开始日期" @click.stop @change="patchTask(row.task.id, { start: ($event.target as HTMLInputElement).value })" /></td>
              <td><input type="date" :value="shown(row.task).end" aria-label="结束日期" @click.stop @change="patchTask(row.task.id, { end: ($event.target as HTMLInputElement).value })" /></td>
              <td>
                <input
                  :value="formatPredecessors(tasks, row.task)"
                  aria-label="前置任务"
                  :disabled="row.hasChildren"
                  @click.stop
                  @change="setPred(row.task, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="succ" :aria-label="`后置任务 ${formatSuccessors(tasks, row.task)}`">{{ formatSuccessors(tasks, row.task) || '·' }}</td>
              <td><input :value="row.task.owner" aria-label="资源" @click.stop @change="patchTask(row.task.id, { owner: ($event.target as HTMLInputElement).value })" /></td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  :value="row.task.progress"
                  :disabled="row.hasChildren"
                  aria-label="进度"
                  @click.stop
                  @change="patchTask(row.task.id, { progress: Math.max(0, Math.min(100, Number(($event.target as HTMLInputElement).value) || 0)) })"
                />
              </td>
              <td class="slack" :data-slack="slackOf(row.task.id)">{{ slackOf(row.task.id) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div ref="chartRef" class="chart" aria-label="甘特图时间刻度" :style="{ '--gantt-day': unit + 'px' }" @scroll="onChartScroll">
        <div class="chart-head" :style="{ width: '100%', minWidth: naturalWidth + 'px', height: HEAD + 'px' }">
          <div class="months">
            <span v-for="month in months" :key="month.label" :style="{ flexGrow: month.days, minWidth: month.days * unit + 'px' }">{{ month.label }}</span>
          </div>
          <div class="ticks">
            <span
              v-for="day in days"
              :key="day"
              :class="{ weekend: isWeekend(day) }"
            >{{ tickLabel(day) }}</span>
          </div>
        </div>
        <div class="chart-body" :style="{ width: '100%', minWidth: naturalWidth + 'px', height: visibleRows.length * ROW + 'px' }">
          <div
            v-for="(day, index) in days"
            :key="'col-' + day"
            class="col"
            :class="{ weekend: isWeekend(day) }"
            :style="columnStyle(index)"
          />
          <div v-if="todayLeft != null" class="today" :style="{ left: todayLeft + '%' }" />
          <svg class="links" width="100%" height="100%" :viewBox="`0 0 ${naturalWidth} ${visibleRows.length * ROW}`" preserveAspectRatio="none">
            <defs>
              <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#5f6368" />
              </marker>
              <marker id="gantt-arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#d93025" />
              </marker>
            </defs>
            <path
              v-for="arrow in arrows"
              :key="arrow.key"
              class="chart-flow-line"
              :class="{ 'is-selected': arrow.critical }"
              :d="arrow.d"
              :stroke="arrow.critical ? '#d93025' : '#5f6368'"
              :marker-end="arrow.critical ? 'url(#gantt-arrow-critical)' : 'url(#gantt-arrow)'"
            >
              <title>{{ arrow.label }}</title>
            </path>
          </svg>
          <div
            v-for="(row, index) in visibleRows"
            :key="row.task.id"
            class="chart-row"
            :class="{ selected: row.task.id === selectedId }"
            :style="{ top: index * ROW + 'px', height: ROW + 'px' }"
            @click="select(row.task.id)"
          >
            <div v-if="baselineBox(row.task)" class="baseline" :style="baselineStyle(row.task)" />
            <div
              v-if="row.task.kind === 'milestone' && !row.hasChildren && barBox(row.task)"
              class="milestone"
              :class="{ critical: isCritical(row.task.id) }"
              :style="milestoneStyle(row.task)"
              :title="row.task.name"
              @pointerdown="startDrag($event, row.task, 'move')"
            />
            <div
              v-else-if="barBox(row.task)"
              class="bar"
              :class="{ critical: isCritical(row.task.id), summary: row.hasChildren }"
              :style="barStyle(row.task)"
              :title="row.task.name"
              @pointerdown="startDrag($event, row.task, 'move')"
            >
              <span class="progress" :style="{ width: Math.max(0, Math.min(100, row.task.progress)) + '%' }" />
              <i v-if="!row.hasChildren" class="handle" @pointerdown="startDrag($event, row.task, 'resize')" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 12px 14px 14px; box-sizing: border-box; overflow: auto; color: #202124; }
.gantt-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-bottom: 8px; }
.title { font-size: 20px; font-weight: 700; border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; min-width: 0; min-height: 40px; max-width: 100%; background: transparent; }
.title:focus { border-color: #1a73e8; background: #fff; outline: none; }
.toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.toolbar button, .zoom button { border: 1px solid #dadce0; background: #fff; border-radius: 999px; min-height: 40px; padding: 4px 14px; font-size: 15px; color: #202124; cursor: pointer; }
.toolbar button:disabled { color: #9aa0a6; }
.zoom { display: inline-flex; }
.zoom button { border-radius: 0; }
.zoom button:first-child { border-radius: 999px 0 0 999px; }
.zoom button:last-child { border-radius: 0 999px 999px 0; }
.zoom button[aria-pressed='true'] { background: #e8f0fe; color: #174ea6; }
.status { margin: 0 0 8px; font-size: 15px; color: #174ea6; }
.split { flex: 1; min-height: 0; display: flex; border: 1px solid #dadce0; border-radius: 10px; overflow: hidden; background: #fff; }
.grid { width: min(720px, 54%); min-width: 320px; overflow: auto; border-right: 1px solid #dadce0; }
.grid table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; }
.grid th, .grid td { height: var(--gantt-row, 44px); box-sizing: border-box; padding: 0 6px; border-bottom: 1px solid #f1f3f4; font-size: 14px; text-align: left; }
.grid thead th { height: 40px; position: sticky; top: 0; background: #f3f6f9; z-index: 1; font-size: 13px; }
.grid tr.selected td { background: #e8f0fe; }
.grid tr.critical .name input { color: #d93025; font-weight: 700; }
.grid input { width: 100%; box-sizing: border-box; border: 1px solid transparent; background: transparent; border-radius: 4px; padding: 2px 3px; font: inherit; color: inherit; }
.grid input:focus { border-color: #1a73e8; background: #fff; outline: none; }
.grid input[type='date'] { width: 136px; }
.grid input[type='number'] { width: 64px; }
.id, .wbs, .slack { color: #5f6368; text-align: right; width: 36px; }
.name { min-width: 180px; }
.name { display: flex; align-items: center; }
.indent { flex: none; }
.twist { flex: none; width: 36px; height: 36px; border: 0; background: transparent; padding: 0; font-size: 16px; cursor: pointer; color: #5f6368; }
.twist--blank { display: inline-block; }
.chart { flex: 1; overflow: auto; position: relative; background: #fff; }
.chart-head { position: sticky; top: 0; z-index: 2; background: #f3f6f9; border-bottom: 1px solid #e0e0e0; box-sizing: border-box; }
.months, .ticks { display: flex; width: 100%; height: 20px; }
.months span, .ticks span { flex: 1 1 0; box-sizing: border-box; min-width: var(--gantt-day, 16px); overflow: hidden; font-size: 12px; line-height: 20px; color: #5f6368; border-left: 1px solid #eceff1; padding-left: 2px; }
.ticks span.weekend { background: #eef1f4; }
.chart-body { position: relative; box-sizing: border-box; }
.col { position: absolute; top: 0; bottom: 0; box-sizing: border-box; }
.col.weekend { background: #f6f8fa; }
.today { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px solid #e37400; z-index: 1; pointer-events: none; }
.links { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.links path { fill: none; stroke-width: 1.25; vector-effect: non-scaling-stroke; }
.chart-row { position: absolute; left: 0; right: 0; }
.chart-row.selected { background: rgba(26, 115, 232, 0.06); }
.bar { position: absolute; top: 11px; height: 16px; border-radius: 4px; background: #1a73e8; cursor: grab; z-index: 1; }
.bar.critical { background: #d93025; }
.bar.summary { top: 13px; height: 10px; border-radius: 1px; background: #202124; }
.bar.summary::before, .bar.summary::after { content: ''; position: absolute; top: 0; width: 2px; height: 14px; background: #202124; }
.bar.summary::before { left: 0; }
.bar.summary::after { right: 0; }
.progress { display: block; height: 100%; background: rgba(0, 0, 0, 0.28); border-radius: inherit; pointer-events: none; }
.handle { position: absolute; right: 0; top: 0; width: 10px; height: 100%; cursor: ew-resize; }
.milestone { position: absolute; top: 12px; width: 16px; height: 16px; background: #1a73e8; transform: rotate(45deg); cursor: grab; z-index: 1; }
.milestone.critical { background: #d93025; }
.baseline { position: absolute; top: 31px; height: 4px; background: #80868b; border-radius: 2px; z-index: 1; }
@media (max-width: 900px) {
  .gantt .split.split { flex-direction: column; overflow: visible; }
  .grid {
    flex: 1 1 240px;
    width: 100%;
    min-width: 0;
    min-height: 240px;
    max-height: 48vh;
    border-right: 0;
    border-bottom: 1px solid #dadce0;
  }
  .chart { flex: 1 1 220px; width: 100%; height: auto; min-height: 220px; }
}
</style>
