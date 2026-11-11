import assert from 'node:assert/strict'
import {
  fontSizeCaption,
  pushRecentValue,
  readStoredRibbonTab,
  recentOptions,
  searchToolbarTools,
  stepRibbonTab,
} from './rteToolbarOptimize.ts'

const tabs = ['edit', 'style', 'paragraph']
assert.equal(readStoredRibbonTab('style', tabs), 'style')
assert.equal(readStoredRibbonTab('missing', tabs), 'edit')
assert.equal(readStoredRibbonTab(null, []), 'edit')

assert.equal(stepRibbonTab(tabs, 'edit', 'next'), 'style')
assert.equal(stepRibbonTab(tabs, 'edit', 'prev'), 'paragraph')
assert.equal(stepRibbonTab(tabs, 'paragraph', 'end'), 'paragraph')
assert.equal(stepRibbonTab(tabs, 'style', 'home'), 'edit')

const groups = [
  { id: 'edit', label: '编辑', tools: [{ key: 'undo', label: '撤销' }, { key: 'find', label: '查找' }] },
  { id: 'style', label: '字体与颜色', tools: [{ key: 'bold', label: '加粗' }] },
]
assert.deepEqual(searchToolbarTools(groups, '  '), [])
assert.deepEqual(searchToolbarTools(groups, '查找'), [
  { groupId: 'edit', groupLabel: '编辑', key: 'find', label: '查找' },
])
assert.equal(searchToolbarTools(groups, 'bold')[0]?.label, '加粗')

const sizes = [
  { label: '默认', value: '' },
  { label: '小四', value: '12pt' },
  { label: '五号', value: '10.5pt' },
]
assert.equal(fontSizeCaption('', sizes), '字号')
assert.equal(fontSizeCaption('12pt', sizes), '小四')
assert.equal(fontSizeCaption('13pt', sizes), '13pt')
assert.deepEqual(pushRecentValue(['12pt', '10.5pt'], '12pt', 5), ['12pt', '10.5pt'])
assert.deepEqual(pushRecentValue(['12pt'], '14pt', 2), ['14pt', '12pt'])
assert.deepEqual(
  recentOptions(sizes, ['10.5pt', '12pt']).map((item) => item.label),
  ['五号', '小四'],
)

console.log('toolbar optimize ok')
