import assert from 'node:assert/strict'
import {
  CHART_TOOLBAR_KEYS,
  DEFAULT_TOOLBAR_GROUP_ORDER,
  LEGACY_GROUP_ALIASES,
  TOOLBAR_GROUPS,
  buildToolbarGroups,
  bumpToolbarUndoEpoch,
  currentToolbarUndoEpoch,
  expandLegacyChartKey,
  migrateToolbarGroupButtons,
  moveToolbarGroup,
  normalizeToolbarGroupOrder,
  toolbarDropIndexFromBoxes,
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

// 105 个 key 全部仍挂在某一组，无丢失无重复（图表组由 1 个总入口变 9 个分类下拉）
const allKeys = TOOLBAR_GROUPS.flatMap((group) => group.keys)
assert.equal(allKeys.length, 105)
assert.equal(new Set(allKeys).size, 105)

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

// —— 拖放命中：沿拖动方向提前换位，并按行而不是只看横坐标 ——
const rowBoxes = [
  { id: 'edit', orderIndex: 0, left: 0, top: 0, width: 180, height: 40 },
  { id: 'style', orderIndex: 1, left: 190, top: 0, width: 420, height: 40 },
  { id: 'paragraph', orderIndex: 2, left: 620, top: 0, width: 200, height: 40 },
]
// 横向以中线分前后。style 从 190 起、宽 420，中线在 400。左半边插到它前面，右半边插到后面。
assert.equal(toolbarDropIndexFromBoxes(211, 20, rowBoxes, 'x', 3, 1), 1)
assert.equal(toolbarDropIndexFromBoxes(399, 20, rowBoxes, 'x', 3, 1), 1)
assert.equal(toolbarDropIndexFromBoxes(400, 20, rowBoxes, 'x', 3, 1), 2)
assert.equal(toolbarDropIndexFromBoxes(300, 20, rowBoxes, 'x', 3, -1), 1)
assert.equal(toolbarDropIndexFromBoxes(589, 20, rowBoxes, 'x', 3, -1), 2)

const wrappedBoxes = [
  { id: 'edit', orderIndex: 0, left: 20, top: 10, width: 500, height: 36 },
  { id: 'style', orderIndex: 1, left: 530, top: 10, width: 400, height: 36 },
  { id: 'insert', orderIndex: 2, left: 20, top: 56, width: 300, height: 36 },
  { id: 'table', orderIndex: 3, left: 330, top: 56, width: 200, height: 36 },
]
// 指针在第二行左侧。若只比横坐标，会先命中第一行宽度盖过该 x 的分组。
// insert 从 20 起、宽 300，中线在 170：左侧插到它前面，越过中线才插到后面。
assert.equal(toolbarDropIndexFromBoxes(40, 70, wrappedBoxes, 'x', 4, 1), 2)
assert.equal(toolbarDropIndexFromBoxes(80, 70, wrappedBoxes, 'x', 4, 1), 2)
assert.equal(toolbarDropIndexFromBoxes(200, 70, wrappedBoxes, 'x', 4, 1), 3)
// 第一行最右侧仍落在第一行末尾（insert 的下标），而不是第二行。
assert.equal(toolbarDropIndexFromBoxes(960, 20, wrappedBoxes, 'x', 4, 1), 2)

const menuBoxes = [
  { id: 'notes', orderIndex: 4, left: 10, top: 0, width: 160, height: 80 },
  { id: 'review', orderIndex: 5, left: 10, top: 88, width: 160, height: 80 },
]
assert.equal(toolbarDropIndexFromBoxes(40, 100, menuBoxes, 'y', 6, 1), 5)
assert.equal(toolbarDropIndexFromBoxes(40, 120, menuBoxes, 'y', 6, 1), 6)
// 纵向提前量按高度：312px 的分组在 72px 处换位，30px 还不够，也不必拖到中线 156。
const tallMenu = [
  { id: 'notes', orderIndex: 4, left: 10, top: 0, width: 180, height: 312 },
  { id: 'review', orderIndex: 5, left: 10, top: 320, width: 180, height: 80 },
]
assert.equal(toolbarDropIndexFromBoxes(40, 30, tallMenu, 'y', 6, 1), 4)
assert.equal(toolbarDropIndexFromBoxes(40, 80, tallMenu, 'y', 6, 1), 5)

// 行间空隙里，向下的手势已经超过约半行高时，落点偏向下面那一行。
const gappedRows = [
  { id: 'edit', orderIndex: 0, left: 0, top: 0, width: 200, height: 36 },
  { id: 'style', orderIndex: 1, left: 0, top: 52, width: 200, height: 36 },
]
assert.equal(toolbarDropIndexFromBoxes(20, 44, gappedRows, 'x', 2, 0), 0)
assert.equal(toolbarDropIndexFromBoxes(20, 44, gappedRows, 'x', 2, 0, { dx: 0, dy: 20 }), 1)

// 高于一行的分组：指针在下缘且手势向下超过三成高度，即使还在宽度中线左侧，也插到它后面。
const tallGroup = [
  { id: 'style', orderIndex: 1, left: 20, top: 40, width: 800, height: 96 },
  { id: 'paragraph', orderIndex: 2, left: 20, top: 146, width: 400, height: 40 },
]
const tallY = 40 + 96 * 0.8
assert.equal(toolbarDropIndexFromBoxes(40, tallY, tallGroup, 'x', 3, 0), 1)
assert.equal(toolbarDropIndexFromBoxes(40, tallY, tallGroup, 'x', 3, 0, { dx: 4, dy: 40 }), 2)

assert.equal(toolbarDropIndexFromBoxes(0, 0, [], 'x', 3, 1), null)
assert.equal(
  toolbarDropIndexFromBoxes(10, 10, [{ id: 'a', orderIndex: 0, left: 0, top: 0, width: 0, height: 10 }], 'x', 1, 1),
  null,
)

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

// —— 图表总入口迁移：旧 `echarts` 展开成 9 个分类下拉 ——
const chartMigrated = migrateToolbarGroupButtons({
  p1: { charts: { order: ['echarts'], hidden: [] } },
})
// 等于默认（9 个分类按钮全显示、默认顺序）→ 不写回画布
assert.equal(chartMigrated, undefined)

const chartHiddenMigrated = migrateToolbarGroupButtons({
  p1: { charts: { order: ['echarts'], hidden: ['echarts'] } },
})
assert.ok(chartHiddenMigrated)
// 旧隐藏总入口 → 9 个分类下拉全隐藏
assert.deepEqual(chartHiddenMigrated!.p1!.charts!.hidden, [...CHART_TOOLBAR_KEYS])
assert.deepEqual(chartHiddenMigrated!.p1!.charts!.order, [...CHART_TOOLBAR_KEYS])

// 展开函数本身
assert.deepEqual(expandLegacyChartKey('echarts'), [...CHART_TOOLBAR_KEYS])
assert.deepEqual(expandLegacyChartKey('chart:basic'), ['chart:basic'])

const first = bumpToolbarUndoEpoch()
const second = bumpToolbarUndoEpoch()
assert.equal(second, first + 1)
assert.equal(currentToolbarUndoEpoch(), second)

console.log('toolbar groups ok')
