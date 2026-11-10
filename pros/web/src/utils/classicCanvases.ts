import type { RaciLetter } from '../types/canvas'

const RACI_CYCLE: RaciLetter[] = ['', 'R', 'A', 'C', 'I']

export function cycleRaci(current: string | undefined): RaciLetter {
  const index = RACI_CYCLE.indexOf((current || '') as RaciLetter)
  return RACI_CYCLE[(index + 1) % RACI_CYCLE.length] || ''
}

/** 日期按 UTC 日序号比较，避免本地时区把横条挪一天。 */
export function dayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (!Number.isFinite(time)) return null
  return Math.floor(time / 86_400_000)
}

export function ganttWindow(tasks: Array<{ start: string; end: string }>): { min: number; span: number } {
  const days = tasks
    .flatMap((task) => [dayNumber(task.start), dayNumber(task.end)])
    .filter((day): day is number => day != null)
  if (!days.length) return { min: 0, span: 1 }
  const min = Math.min(...days)
  const max = Math.max(...days)
  return { min, span: Math.max(1, max - min) }
}

export function ganttBar(
  task: { start: string; end: string },
  window: { min: number; span: number },
): { left: number; width: number } {
  const startDay = dayNumber(task.start)
  const endDay = dayNumber(task.end)
  if (startDay == null || endDay == null) return { left: 0, width: 8 }
  const start = Math.min(startDay, endDay)
  const end = Math.max(startDay, endDay)
  const left = ((start - window.min) / window.span) * 100
  const width = Math.max(2, ((end - start) / window.span) * 100)
  return {
    left: Math.max(0, Math.min(98, left)),
    width: Math.min(100 - Math.max(0, left), width),
  }
}

export function sumAmounts(lines: Array<{ amount: number }>): number {
  return lines.reduce((sum, line) => {
    const amount = Number(line.amount)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

export function newCanvasId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}
