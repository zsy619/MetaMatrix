import assert from 'node:assert/strict'
import { normalizeDocumentStats, statsCacheKey, statsSeriesCsv } from './statsNormalize.ts'
import type { DocumentStats } from '../../api/documents.ts'

const broken = {
  range: '7d',
  granularity: 'day',
  timezone: 'Asia/Shanghai',
  from: '2026-10-25',
  to: '2026-10-31',
  previousFrom: '',
  previousTo: '',
  documents: { current: 1, previous: 0 },
  weekCreated: { current: Number.NaN, previous: -3 },
  monthCreated: undefined,
  weekEdited: { current: 1, previous: 0 },
  monthEdited: { current: 0, previous: 0 },
  revisions: { current: 2, previous: 1 },
  activeTemplates: { current: 1, previous: 0 },
  rangeCreated: { current: 1, previous: 0 },
  rangeEdited: { current: 0, previous: 0 },
  totals: undefined,
  activity: undefined,
  series: [
    { start: '2026-10-30', created: 1, edited: null, revisions: 2 },
    { start: 'bad', created: 1, edited: 1, revisions: 1 },
  ],
  templates: [
    {
      templateId: 'time-matrix',
      canvasType: 'time_matrix',
      total: 1,
      created: 1,
      edited: 0,
      series: [4],
    },
  ],
  heatmap: [
    { date: '2026-10-30', count: 2 },
    { date: '2026-10-30', count: 9 },
    { date: '', count: 1 },
  ],
  recent: null,
} as unknown as DocumentStats

const stats = normalizeDocumentStats(broken)
assert.equal(stats.weekCreated.current, 0)
assert.equal(stats.weekCreated.previous, 0)
assert.equal(stats.activity.streak, 0)
assert.equal(stats.series.length, 1)
assert.equal(stats.series[0]?.edited, 0)
assert.equal(stats.templates[0]?.series.length, 1)
assert.equal(stats.templates[0]?.series[0], 4)
assert.equal(stats.heatmap.length, 1)
assert.equal(stats.heatmap[0]?.count, 2)
assert.deepEqual(stats.recent, [])

assert.equal(statsCacheKey('user-a', '7d', 'day'), 'user-a|7d|day')
assert.notEqual(statsCacheKey('user-a', '7d', 'day'), statsCacheKey('user-b', '7d', 'day'))

const csv = statsSeriesCsv(stats)
assert.ok(csv.startsWith('start,created,edited,revisions'))
assert.ok(csv.includes('2026-10-30,1,0,2'))
assert.ok(csv.includes('streak,0'))

console.log('workspace stats guards ok')
