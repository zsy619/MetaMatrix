import assert from 'node:assert/strict'
import {
  DEFAULT_TOOLBAR_GROUP_ORDER,
  buildToolbarGroups,
  bumpToolbarUndoEpoch,
  currentToolbarUndoEpoch,
  moveToolbarGroup,
  normalizeToolbarGroupOrder,
  readToolbarGroupOrder,
  toolbarGroupLabels,
  writeToolbarGroupOrder,
} from './rteToolbarGroups.ts'

assert.deepEqual(normalizeToolbarGroupOrder(undefined), [...DEFAULT_TOOLBAR_GROUP_ORDER])
assert.deepEqual(normalizeToolbarGroupOrder(['nope', 'color', 'color', 'text', 'more']), [
  'color',
  'text',
  'history',
  'paragraph',
  'insert',
  'table',
  'blocks',
  'notes',
  'review',
  'view',
  'other',
])
assert.deepEqual(readToolbarGroupOrder(undefined, 'p1'), [...DEFAULT_TOOLBAR_GROUP_ORDER])
assert.equal(writeToolbarGroupOrder(undefined, 'p1', DEFAULT_TOOLBAR_GROUP_ORDER), undefined)
assert.deepEqual(
  writeToolbarGroupOrder(undefined, 'p1', ['table', 'color', 'history', 'text', 'paragraph', 'insert', 'blocks', 'notes', 'review', 'view', 'other']),
  {
    p1: ['table', 'color', 'history', 'text', 'paragraph', 'insert', 'blocks', 'notes', 'review', 'view', 'other'],
  },
)
assert.equal(
  writeToolbarGroupOrder(
    { p1: ['table', 'color', 'history', 'text', 'paragraph', 'insert', 'blocks', 'notes', 'review', 'view', 'other'] },
    'p1',
    DEFAULT_TOOLBAR_GROUP_ORDER,
  ),
  undefined,
)

assert.equal(moveToolbarGroup(['a', 'b', 'c'], 'b', 2), null)
assert.deepEqual(moveToolbarGroup(['history', 'text', 'color'], 'history', 3), ['text', 'color', 'history'])
assert.deepEqual(moveToolbarGroup(['history', 'text', 'color'], 'color', 0), ['color', 'history', 'text'])
assert.equal(moveToolbarGroup(['history', 'text'], 'missing', 0), null)

const groups = buildToolbarGroups(
  [
    { key: 'undo' },
    { key: 'bold' },
    { key: 'mystery' },
    { key: 'color' },
    { key: 'table' },
    { key: 'export' },
    { key: 'note' },
  ],
  ['color', 'history', 'text', 'paragraph', 'insert', 'table', 'blocks', 'notes', 'review', 'view', 'other'],
)
assert.deepEqual(
  groups.map((group) => [group.id, group.tools.map((tool) => tool.key)]),
  [
    ['color', ['color']],
    ['history', ['undo']],
    ['text', ['bold']],
    ['table', ['table']],
    ['notes', ['note']],
    ['view', ['export']],
    ['other', ['mystery']],
  ],
)

assert.equal(toolbarGroupLabels(['color', 'history']), '颜色、操作')
const first = bumpToolbarUndoEpoch()
const second = bumpToolbarUndoEpoch()
assert.equal(second, first + 1)
assert.equal(currentToolbarUndoEpoch(), second)

console.log('toolbar groups ok')
