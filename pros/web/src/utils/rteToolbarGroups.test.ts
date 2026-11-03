import assert from 'node:assert/strict'
import {
  DEFAULT_TOOLBAR_GROUP_ORDER,
  LEGACY_GROUP_ALIASES,
  TOOLBAR_GROUPS,
  buildToolbarGroups,
  bumpToolbarUndoEpoch,
  currentToolbarUndoEpoch,
  migrateToolbarGroupButtons,
  moveToolbarGroup,
  normalizeToolbarGroupOrder,
  readToolbarGroupOrder,
  toolbarGroupLabels,
  writeToolbarGroupOrder,
} from './rteToolbarGroups.ts'

// —— 方案 A：11 个可见分组 + other 兜底 ——
assert.deepEqual(DEFAULT_TOOLBAR_GROUP_ORDER, [
  'edit',
  'style',
  'paragraph',
  'insert',
  'charts',
  'table',
  'blocks',
  'notes',
  'review',
  'view',
  'file',
  'other',
])

// 97 个旧 key 全部仍挂在某一组，无丢失无重复
const allKeys = TOOLBAR_GROUPS.flatMap((group) => group.keys)
assert.equal(allKeys.length, 97)
assert.equal(new Set(allKeys).size, 97)

// —— 旧分组顺序 id 迁移 ——
assert.deepEqual(normalizeToolbarGroupOrder(undefined), [...DEFAULT_TOOLBAR_GROUP_ORDER])

// 旧 ['view','history'] → view,file,edit
const viewHistory = normalizeToolbarGroupOrder(['view', 'history'])
assert.deepEqual(viewHistory.slice(0, 3), ['view', 'file', 'edit'])
assert.ok(viewHistory.includes('view'))
assert.ok(viewHistory.includes('file'))
assert.ok(viewHistory.includes('edit'))

// 旧 ['text','color','table'] → style,paragraph,table
const textColorTable = normalizeToolbarGroupOrder(['text', 'color', 'table'])
assert.deepEqual(textColorTable.slice(0, 3), ['style', 'paragraph', 'table'])
assert.ok(textColorTable.includes('style'))
assert.ok(textColorTable.includes('paragraph'))
assert.ok(textColorTable.includes('table'))

// 旧 ['marks','align','list','type'] → style,paragraph
assert.deepEqual(
  normalizeToolbarGroupOrder(['marks', 'align', 'list', 'type']).slice(0, 2),
  ['style', 'paragraph'],
)

// 未知 id 丢弃并落到默认序
assert.deepEqual(normalizeToolbarGroupOrder(['nope', 'more']), [...DEFAULT_TOOLBAR_GROUP_ORDER])

// 重复 id 去重
assert.deepEqual(normalizeToolbarGroupOrder(['color', 'color']).slice(0, 1), ['style'])

// 别名表覆盖旧 id
assert.deepEqual(LEGACY_GROUP_ALIASES.view, ['view', 'file'])
assert.deepEqual(LEGACY_GROUP_ALIASES.history, ['edit'])
assert.deepEqual(LEGACY_GROUP_ALIASES.text, ['style', 'paragraph'])

assert.deepEqual(readToolbarGroupOrder(undefined, 'p1'), [...DEFAULT_TOOLBAR_GROUP_ORDER])
assert.equal(writeToolbarGroupOrder(undefined, 'p1', DEFAULT_TOOLBAR_GROUP_ORDER), undefined)
assert.deepEqual(
  writeToolbarGroupOrder(undefined, 'p1', ['table', 'color', 'history', 'text', 'paragraph', 'insert', 'blocks', 'notes', 'review', 'view', 'other']),
  {
    p1: [
      'table',
      'style',
      'edit',
      'paragraph',
      'insert',
      'blocks',
      'notes',
      'review',
      'view',
      'file',
      'other',
      'charts',
    ],
  },
)
assert.equal(
  writeToolbarGroupOrder(
    { p1: ['table', 'color'] },
    'p1',
    DEFAULT_TOOLBAR_GROUP_ORDER,
  ),
  undefined,
)

assert.equal(moveToolbarGroup(['a', 'b', 'c'], 'b', 2), null)
assert.deepEqual(moveToolbarGroup(['edit', 'style', 'color'], 'edit', 3), ['style', 'color', 'edit'])
assert.deepEqual(moveToolbarGroup(['edit', 'style', 'color'], 'color', 0), ['color', 'edit', 'style'])
assert.equal(moveToolbarGroup(['edit', 'style'], 'missing', 0), null)

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
  ['style', 'edit', 'paragraph', 'insert', 'table', 'blocks', 'notes', 'review', 'view', 'file', 'other'],
)
assert.deepEqual(
  groups.map((group) => [group.id, group.tools.map((tool) => tool.key)]),
  [
    ['style', ['color', 'bold']],
    ['edit', ['undo']],
    ['table', ['table']],
    ['notes', ['note']],
    ['file', ['export']],
    ['other', ['mystery']],
  ],
)

assert.equal(toolbarGroupLabels(['style', 'edit']), '字体与颜色、编辑')

// —— 组内按钮配置迁移 ——
const migrated = migrateToolbarGroupButtons({
  p1: {
    // 旧 view 组：print/import/export/copyMd → 新 file；其余 → 新 view
    view: { order: ['print', 'viewExtras', 'zoom'], hidden: ['print'] },
    // 旧 marks 组：字形按钮 → 新 style
    marks: { order: ['bold', 'ruby'], hidden: ['ruby'] },
  },
})
assert.ok(migrated)
assert.deepEqual(Object.keys(migrated!.p1!).sort(), ['file', 'style'])
// 旧 view 隐藏的 print 落到新 file 的 hidden（导出按钮不会复活）
assert.deepEqual(migrated!.p1!.file!.hidden, ['print'])
assert.deepEqual(migrated!.p1!.file!.order?.slice(0, 3), ['print', 'import', 'export'])
// 旧 marks 隐藏的 ruby 落到新 style
assert.deepEqual(migrated!.p1!.style!.hidden, ['ruby'])
assert.deepEqual(migrated!.p1!.style!.order?.slice(0, 2), ['bold', 'ruby'])
// 迁移是幂等的
assert.deepEqual(migrateToolbarGroupButtons(migrated), migrated)
// 空配置迁移后不保留（画布保持干净）
assert.equal(migrateToolbarGroupButtons({ p1: { other: { order: [], hidden: [] } } }), undefined)
assert.equal(migrateToolbarGroupButtons(undefined), undefined)

const first = bumpToolbarUndoEpoch()
const second = bumpToolbarUndoEpoch()
assert.equal(second, first + 1)
assert.equal(currentToolbarUndoEpoch(), second)

console.log('toolbar groups ok')
