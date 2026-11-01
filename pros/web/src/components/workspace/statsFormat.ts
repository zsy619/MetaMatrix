import type {
  DocumentStats,
  StatsGranularity,
  StatsRange,
  TemplateStat,
} from '../../api/documents'
import { ApiError } from '../../api/http'
import {
  CATEGORY_LABELS,
  isTemplateId,
  TEMPLATE_META,
  type TemplateCategory,
} from '../../stores/document'
import { friendlyApiMessage } from '../../utils/apiMessage'
import { CATEGORY_ACCENT, TREND_COLORS, accentOf, canvasTypeLabel, templateName } from './palette'

export const RANGES: { id: StatsRange; label: string }[] = [
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: '90d', label: '近 90 天' },
  { id: 'year', label: '今年' },
]

export const GRAINS: { id: StatsGranularity; label: string }[] = [
  { id: 'day', label: '按日' },
  { id: 'week', label: '按周' },
  { id: 'month', label: '按月' },
]

export type DeltaTone = 'up' | 'down' | 'flat'

export function formatDelta(current: number, previous: number): { text: string; tone: DeltaTone } {
  const diff = current - previous
  if (diff === 0) return { text: '持平', tone: 'flat' }
  if (previous === 0) return { text: `+${diff} 新增`, tone: 'up' }
  const pct = Math.round((diff / previous) * 100)
  const sign = diff > 0 ? '+' : ''
  const pctSign = pct > 0 ? '+' : ''
  return { text: `${sign}${diff}（${pctSign}${pct}%）`, tone: diff > 0 ? 'up' : 'down' }
}

export function bucketLabel(start: string, granularity: string): string {
  const month = Number(start.slice(5, 7))
  const day = Number(start.slice(8, 10))
  if (granularity === 'month') return `${month}月`
  return `${month}/${day}`
}

export function formatWhen(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const min = Math.round((Date.now() - t.getTime()) / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  if (day < 14) return `${day} 天前`
  return t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export type StatsNotice = {
  title: string
  message: string
  kind: 'auth' | 'forbidden' | 'network' | 'unavailable'
}

export function describeStatsError(error: unknown): StatsNotice {
  if (error instanceof ApiError && error.status === 401) {
    return {
      kind: 'auth',
      title: '登录已失效',
      message: '请重新登录后查看你自己的工作统计。别人的画布不会出现在这里。',
    }
  }
  if (error instanceof ApiError && error.status === 403) {
    return {
      kind: 'forbidden',
      title: '无法查看这份统计',
      message: '工作统计只对当前登录账号开放。',
    }
  }
  if (error instanceof TypeError) {
    return {
      kind: 'network',
      title: '网络中断',
      message: '暂时连不上统计服务。可以稍后重试，已保留上一次成功的结果。',
    }
  }
  return {
    kind: 'unavailable',
    title: '统计暂时不可用',
    message: friendlyApiMessage(error, '没有拿到最新统计。可以稍后重试。'),
  }
}

export type TrendSeries = { name: string; color: string; values: number[] }

export function mainSeries(view: DocumentStats): TrendSeries[] {
  const rows = view.series || []
  return [
    { name: '新建', color: '#1a73e8', values: rows.map((b) => b.created) },
    { name: '编辑', color: '#34a853', values: rows.map((b) => b.edited) },
    { name: '修订', color: '#a142f4', values: rows.map((b) => b.revisions) },
  ]
}

export type CategorySegment = { key: string; label: string; count: number; color: string }

export function categorySegments(view: DocumentStats): CategorySegment[] {
  const counts: Record<string, CategorySegment> = {}
  for (const id of Object.keys(CATEGORY_LABELS) as TemplateCategory[]) {
    counts[id] = { key: id, label: CATEGORY_LABELS[id], count: 0, color: CATEGORY_ACCENT[id] }
  }
  counts.other = { key: 'other', label: '未归档', count: 0, color: '#5f6368' }
  for (const t of view.templates || []) {
    const key = isTemplateId(t.templateId) ? TEMPLATE_META[t.templateId].category : 'other'
    const row = counts[key]
    if (row) row.count += t.total
  }
  return Object.values(counts).filter((s) => s.count > 0)
}

export type TemplateRow = TemplateStat & {
  name: string
  color: string
  width: string
  spark: string
}

function sparkPoints(values: number[]): string {
  if (!values.length) return ''
  const max = Math.max(1, ...values)
  const w = 72
  const h = 22
  return values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
      const y = h - (v / max) * (h - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function templateRows(view: DocumentStats): TemplateRow[] {
  const rows = view.templates || []
  const max = Math.max(1, ...rows.map((t) => t.total))
  return rows.slice(0, 8).map((t) => ({
    ...t,
    name: templateName(t.templateId),
    color: accentOf(t.templateId),
    width: `${Math.max(6, Math.round((t.total / max) * 100))}%`,
    spark: sparkPoints(t.series),
  }))
}

export function templateTrend(view: DocumentStats): TrendSeries[] {
  const rows = (view.templates || [])
    .map((t) => ({ t, sum: t.series.reduce((n, v) => n + v, 0) }))
    .filter((x) => x.sum > 0)
    .slice(0, 5)
  return rows.map((x, i) => ({
    name: templateName(x.t.templateId),
    color: TREND_COLORS[i % TREND_COLORS.length] || '#1a73e8',
    values: x.t.series,
  }))
}

export function typeSegments(view: DocumentStats): CategorySegment[] {
  const map = new Map<string, CategorySegment>()
  for (const t of view.templates || []) {
    const key = t.canvasType || 'unknown'
    const row = map.get(key) || {
      key,
      label: canvasTypeLabel(key),
      count: 0,
      color: accentOf(t.templateId || key.replace(/_/g, '-')),
    }
    row.count += t.total
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'))
}

export function isFlatTrend(view: DocumentStats): boolean {
  return (view.series || []).every((b) => b.created === 0 && b.edited === 0 && b.revisions === 0)
}
