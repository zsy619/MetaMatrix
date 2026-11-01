import assert from 'node:assert/strict'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentRejectReason,
  dataUrlExceedsAttachmentLimit,
} from './attachmentPolicy.ts'
import {
  mergeMentionCandidates,
  mentionSectionLabel,
} from '../components/rteMentionItems.ts'
import { rteSlashGlyph } from './rteSlashGlyph.ts'
import { findCrossRefPos } from './rteBlockRef.ts'

const png = attachmentRejectReason('shot.png', 'image/png', 1024)
assert.equal(png, null)

const huge = attachmentRejectReason('shot.png', 'image/png', MAX_ATTACHMENT_BYTES + 1)
assert.ok(huge && huge.includes('3MB'))

const svg = attachmentRejectReason('icon.svg', 'image/svg+xml', 100)
assert.ok(svg)

assert.equal(dataUrlExceedsAttachmentLimit('a'.repeat(MAX_ATTACHMENT_BYTES)), false)
assert.equal(dataUrlExceedsAttachmentLimit('a'.repeat(MAX_ATTACHMENT_BYTES + 1)), true)

const merged = mergeMentionCandidates('季度', [
  { id: 'h-1', label: '§ 季度目标', kind: 'heading' },
  { id: 'fig-2', label: '图 1', kind: 'figure' },
])
assert.ok(merged.some((item) => item.kind === 'block' && item.targetId === 'h-1'))
assert.equal(mentionSectionLabel(merged.find((item) => item.kind === 'block')!), '本文')
assert.equal(mentionSectionLabel({ id: 'owner', label: '负责人', kind: 'person' }), '人员')

assert.equal(rteSlashGlyph({ label: '标题 1', action: { type: 'heading', level: 1 } }), 'H1')
assert.equal(rteSlashGlyph({ label: '任务列表', action: { type: 'taskList' } }), '☐')
assert.equal(rteSlashGlyph({ label: '分割线', action: { type: 'hr' } }), '—')
assert.equal(rteSlashGlyph({ label: '表格', action: { type: 'table' } }), '表')

const pos = findCrossRefPos(
  {
    descendants(visit) {
      visit(
        {
          type: { name: 'heading' },
          attrs: {},
          textContent: '季度目标',
        },
        12,
      )
    },
  },
  'h-12',
  '§ 季度目标',
)
assert.equal(pos, 12)

const missing = findCrossRefPos(
  { descendants(visit) { void visit } },
  'missing',
  '没有这个标题',
)
assert.equal(missing, null)

console.log('feishu rte depth guards ok')
