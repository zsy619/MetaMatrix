import type {
  DocumentStats,
  HeatCell,
  StatsBucket,
  StatsGranularity,
  StatsRange,
  TemplateStat,
} from '../../api/documents'

type SampleDoc = {
  templateId: string
  canvasType: string
  created: string
  updated: string
  revs: string[]
}

const TEMPLATES: Array<[string, string]> = [
  ['time-matrix', 'time_matrix'],
  ['weekly-summary', 'period_summary'],
  ['y-model', 'y_model'],
  ['five-step-basic', 'five_step_basic'],
  ['incident-review', 'incident_review'],
  ['roi-decision', 'roi_decision'],
  ['deliberate-practice', 'deliberate_practice'],
  ['scientific-meeting', 'scientific_meeting'],
]

export function shanghaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, (d || 1) + n))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function weekdayMon(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1)).getUTCDay()
  return wd === 0 ? 7 : wd
}

function startOfWeek(iso: string): string {
  return addDays(iso, -(weekdayMon(iso) - 1))
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 8)}01`
}

function inWindow(t: string, from: string, to: string): boolean {
  return t >= from && t < to
}

function isEdit(created: string, updated: string): boolean {
  return updated > created
}

function buildDocs(today: string): SampleDoc[] {
  const docs: SampleDoc[] = []
  for (let i = 0; i < 42; i++) {
    const age = 4 + ((i * 13) % 260)
    const created = addDays(today, -age)
    const lag = i % 6 === 0 ? 0 : (i % 9) + 1
    let updated = addDays(created, lag)
    if (updated > today) updated = today
    const [templateId, canvasType] = TEMPLATES[i % TEMPLATES.length]!
    const revs = [created]
    if (updated !== created) revs.push(updated)
    if (i % 4 === 0) {
      const extra = addDays(created, Math.min(lag + 4, age))
      if (extra <= today && extra !== created && extra !== updated) revs.push(extra)
    }
    docs.push({ templateId, canvasType, created, updated, revs })
  }
  docs.push({
    templateId: 'time-matrix',
    canvasType: 'time_matrix',
    created: addDays(today, -1),
    updated: today,
    revs: [addDays(today, -1), today],
  })
  docs.push({
    templateId: 'weekly-summary',
    canvasType: 'period_summary',
    created: today,
    updated: today,
    revs: [today],
  })
  return docs
}

function countCreated(docs: SampleDoc[], from: string, to: string): number {
  return docs.filter((d) => inWindow(d.created, from, to)).length
}

function countEdited(docs: SampleDoc[], from: string, to: string): number {
  return docs.filter((d) => isEdit(d.created, d.updated) && inWindow(d.updated, from, to)).length
}

function countRevs(docs: SampleDoc[], from: string, to: string): number {
  let n = 0
  for (const d of docs) {
    for (const r of d.revs) if (inWindow(r, from, to)) n++
  }
  return n
}

function activeTemplates(docs: SampleDoc[], from: string, to: string): number {
  const set = new Set<string>()
  for (const d of docs) {
    const touched =
      inWindow(d.created, from, to) ||
      (isEdit(d.created, d.updated) && inWindow(d.updated, from, to))
    if (touched) set.add(d.templateId)
  }
  return set.size
}

function bucketStarts(from: string, to: string, granularity: StatsGranularity): string[] {
  const starts: string[] = []
  if (granularity === 'week') {
    let cur = startOfWeek(from)
    while (cur < to) {
      starts.push(cur)
      cur = addDays(cur, 7)
    }
  } else if (granularity === 'month') {
    let cur = startOfMonth(from)
    while (cur < to) {
      starts.push(cur)
      const [y, m] = cur.split('-').map(Number)
      const next = new Date(Date.UTC(y || 1970, m || 1, 1))
      const yy = next.getUTCFullYear()
      const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
      cur = `${yy}-${mm}-01`
    }
  } else {
    let cur = from
    while (cur < to) {
      starts.push(cur)
      cur = addDays(cur, 1)
    }
  }
  return starts.length ? starts : [from]
}

function bucketIndex(starts: string[], t: string): number {
  if (!starts.length || t < starts[0]!) return -1
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (t >= starts[mid]!) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Deterministic demo stats so the signed-out workspace still shows the charts. */
export function buildSampleStats(range: StatsRange, granularity: StatsGranularity, now = new Date()): DocumentStats {
  const today = shanghaiToday(now)
  const end = addDays(today, 1)
  let from = addDays(today, range === '7d' ? -6 : range === '90d' ? -89 : -29)
  if (range === 'year') from = `${today.slice(0, 4)}-01-01`
  const spanDays = Math.round(
    (Date.parse(end + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000,
  )
  const prevFrom = range === 'year' ? `${Number(today.slice(0, 4)) - 1}-01-01` : addDays(from, -spanDays)
  const prevTo = range === 'year' ? addDays(prevFrom, spanDays) : from

  const docs = buildDocs(today)
  const thisWeek = startOfWeek(today)
  const nextWeek = addDays(thisWeek, 7)
  const daysIntoWeek = weekdayMon(today)
  const lastWeek = addDays(thisWeek, -7)
  const lastWeekEnd = addDays(lastWeek, daysIntoWeek)
  const thisMonth = startOfMonth(today)
  const nextMonthStart = (() => {
    const [y, m] = thisMonth.split('-').map(Number)
    const dt = new Date(Date.UTC(y || 1970, m || 1, 1))
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
  })()
  const lastMonth = (() => {
    const [y, m] = thisMonth.split('-').map(Number)
    const dt = new Date(Date.UTC(y || 1970, (m || 1) - 2, 1))
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
  })()
  const dayOfMonth = Number(today.slice(8, 10))
  let lastMonthEnd = addDays(lastMonth, dayOfMonth)
  if (lastMonthEnd > thisMonth) lastMonthEnd = thisMonth

  const starts = bucketStarts(from, end, granularity)
  const createdS = starts.map(() => 0)
  const editedS = starts.map(() => 0)
  const revS = starts.map(() => 0)
  const byTpl = new Map<string, TemplateStat>()

  const bump = (arr: number[], t: string, winFrom: string, winTo: string): number => {
    if (!inWindow(t, winFrom, winTo)) return -1
    const i = bucketIndex(starts, t)
    if (i < 0) return -1
    arr[i] = (arr[i] || 0) + 1
    return i
  }

  for (const d of docs) {
    let row = byTpl.get(d.templateId)
    if (!row) {
      row = {
        templateId: d.templateId,
        canvasType: d.canvasType,
        total: 0,
        created: 0,
        edited: 0,
        series: starts.map(() => 0),
      }
      byTpl.set(d.templateId, row)
    }
    row.total++
    const marked = new Set<number>()
    const ci = bump(createdS, d.created, from, end)
    if (ci >= 0) {
      row.created++
      marked.add(ci)
    }
    if (isEdit(d.created, d.updated)) {
      const ei = bump(editedS, d.updated, from, end)
      if (ei >= 0) {
        row.edited++
        marked.add(ei)
      }
    }
    for (const i of marked) row.series[i] = (row.series[i] || 0) + 1
    for (const r of d.revs) bump(revS, r, from, end)
  }

  const series: StatsBucket[] = starts.map((start, i) => ({
    start,
    created: createdS[i] || 0,
    edited: editedS[i] || 0,
    revisions: revS[i] || 0,
  }))

  const templates = [...byTpl.values()].sort((a, b) => b.total - a.total || a.templateId.localeCompare(b.templateId))

  const heat = new Map<string, number>()
  const revDays = new Map<string, Set<string>>()
  docs.forEach((d, idx) => {
    const key = String(idx)
    const days = new Set<string>()
    for (const r of d.revs) {
      heat.set(r, (heat.get(r) || 0) + 1)
      days.add(r)
    }
    revDays.set(key, days)
    if (isEdit(d.created, d.updated) && !days.has(d.updated)) {
      heat.set(d.updated, (heat.get(d.updated) || 0) + 1)
    }
  })

  const heatFrom = addDays(thisWeek, -52 * 7)
  const heatUntil = addDays(thisWeek, 7)
  const heatmap: HeatCell[] = []
  for (let cur = heatFrom; cur < heatUntil; cur = addDays(cur, 1)) {
    heatmap.push({ date: cur, count: heat.get(cur) || 0 })
  }

  let allRevs = 0
  for (const d of docs) allRevs += d.revs.length

  return {
    range,
    granularity,
    timezone: 'Asia/Shanghai',
    from,
    to: today,
    previousFrom: prevFrom,
    previousTo: addDays(prevTo, -1),
    documents: {
      current: docs.length,
      previous: docs.filter((d) => d.created < thisMonth).length,
    },
    weekCreated: {
      current: countCreated(docs, thisWeek, nextWeek),
      previous: countCreated(docs, lastWeek, lastWeekEnd),
    },
    monthCreated: {
      current: countCreated(docs, thisMonth, nextMonthStart),
      previous: countCreated(docs, lastMonth, lastMonthEnd),
    },
    weekEdited: {
      current: countEdited(docs, thisWeek, nextWeek),
      previous: countEdited(docs, lastWeek, lastWeekEnd),
    },
    monthEdited: {
      current: countEdited(docs, thisMonth, nextMonthStart),
      previous: countEdited(docs, lastMonth, lastMonthEnd),
    },
    revisions: {
      current: countRevs(docs, from, end),
      previous: countRevs(docs, prevFrom, prevTo),
    },
    activeTemplates: {
      current: activeTemplates(docs, from, end),
      previous: activeTemplates(docs, prevFrom, prevTo),
    },
    rangeCreated: {
      current: countCreated(docs, from, end),
      previous: countCreated(docs, prevFrom, prevTo),
    },
    rangeEdited: {
      current: countEdited(docs, from, end),
      previous: countEdited(docs, prevFrom, prevTo),
    },
    totals: { revisions: allRevs, templates: new Set(docs.map((d) => d.templateId)).size },
    series,
    templates,
    heatmap,
  }
}
