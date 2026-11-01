import type {
  DocumentStats,
  HeatCell,
  RecentEdit,
  StatsBucket,
  StatsCompare,
  TemplateStat,
} from '../../api/documents'

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

function compare(value: StatsCompare | undefined): StatsCompare {
  return { current: num(value?.current), previous: num(value?.previous) }
}

function buckets(value: StatsBucket[] | null | undefined): StatsBucket[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row) => row && typeof row.start === 'string' && row.start.length >= 10)
    .map((row) => ({
      start: row.start.slice(0, 10),
      created: num(row.created),
      edited: num(row.edited),
      revisions: num(row.revisions),
    }))
}

function templates(value: TemplateStat[] | null | undefined, days: number): TemplateStat[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row) => row && typeof row.templateId === 'string')
    .map((row) => {
      const series = Array.isArray(row.series) ? row.series.map((n) => num(n)) : []
      const aligned = series.slice(0, days)
      while (aligned.length < days) aligned.push(0)
      return {
        templateId: row.templateId,
        canvasType: row.canvasType || 'unknown',
        total: num(row.total),
        created: num(row.created),
        edited: num(row.edited),
        series: aligned,
      }
    })
}

function heatmap(value: HeatCell[] | null | undefined): HeatCell[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const cells: HeatCell[] = []
  for (const cell of value) {
    if (!cell || typeof cell.date !== 'string' || cell.date.length < 10) continue
    const date = cell.date.slice(0, 10)
    if (seen.has(date)) continue
    seen.add(date)
    cells.push({ date, count: num(cell.count) })
  }
  return cells
}

function recent(value: RecentEdit[] | null | undefined): RecentEdit[] {
  if (!Array.isArray(value)) return []
  return value.filter((row) => row && typeof row.id === 'string')
}

/** Fill missing stats fields so the workspace never throws on a partial payload. */
export function normalizeDocumentStats(raw: DocumentStats): DocumentStats {
  const series = buckets(raw?.series)
  return {
    range: raw?.range || '30d',
    granularity: raw?.granularity || 'day',
    timezone: raw?.timezone || 'Asia/Shanghai',
    from: raw?.from || '',
    to: raw?.to || '',
    previousFrom: raw?.previousFrom || '',
    previousTo: raw?.previousTo || '',
    documents: compare(raw?.documents),
    weekCreated: compare(raw?.weekCreated),
    monthCreated: compare(raw?.monthCreated),
    weekEdited: compare(raw?.weekEdited),
    monthEdited: compare(raw?.monthEdited),
    revisions: compare(raw?.revisions),
    activeTemplates: compare(raw?.activeTemplates),
    rangeCreated: compare(raw?.rangeCreated),
    rangeEdited: compare(raw?.rangeEdited),
    totals: {
      revisions: num(raw?.totals?.revisions),
      templates: num(raw?.totals?.templates),
    },
    activity: {
      activeDays: num(raw?.activity?.activeDays),
      previousActiveDays: num(raw?.activity?.previousActiveDays),
      streak: num(raw?.activity?.streak),
      longest: num(raw?.activity?.longest),
    },
    series,
    templates: templates(raw?.templates, series.length),
    heatmap: heatmap(raw?.heatmap),
    recent: recent(raw?.recent),
  }
}

/** Cache key includes the user so one account cannot see another's numbers. */
export function statsCacheKey(userId: string, range: string, grain: string): string {
  return `${userId || 'anonymous'}|${range}|${grain}`
}

export function statsSeriesCsv(stats: DocumentStats): string {
  const lines = ['start,created,edited,revisions']
  for (const row of stats.series || []) {
    lines.push([row.start, row.created, row.edited, row.revisions].join(','))
  }
  lines.push('')
  lines.push(`active_days,${stats.activity?.activeDays ?? 0}`)
  lines.push(`streak,${stats.activity?.streak ?? 0}`)
  lines.push(`longest,${stats.activity?.longest ?? 0}`)
  return lines.join('\n')
}
