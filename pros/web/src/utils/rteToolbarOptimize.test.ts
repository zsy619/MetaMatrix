import assert from 'node:assert/strict'
import {
  disabledToolTitle,
  fontSizeCaption,
  groupHandleTitle,
  menuToolNeedsCaret,
  pushRecentValue,
  readStoredRibbonTab,
  recentOptions,
  ribbonTabTabIndex,
  searchToolbarTools,
  stepRibbonTab,
  toolbarSearchStatus,
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
assert.equal(searchToolbarTools([{ id: 'style', label: '字体与颜色', tools: [{ key: 'ruby', label: '注音', title: '手动填写注音' }] }], '拼音')[0]?.key, 'ruby')
assert.equal(searchToolbarTools([{ id: 'style', label: '字体与颜色', tools: [{ key: 'ruby', label: '注音' }, { key: 'highlight', label: '高亮' }] }], '拼 音')[0]?.key, 'ruby')
const ranked = searchToolbarTools([
  { id: 'style', label: '字体', tools: [{ key: 'bold', label: '加粗' }, { key: 'clear', label: '清除格式', title: '加粗后清除' }] },
], '加粗')
assert.equal(ranked[0]?.key, 'bold')
assert.equal(toolbarSearchStatus('  ', 3), '')
assert.equal(toolbarSearchStatus('拼音', 0), '没有匹配的按钮')
assert.equal(toolbarSearchStatus('拼音', 2), '找到 2 个按钮')
assert.equal(ribbonTabTabIndex(true), 0)
assert.equal(ribbonTabTabIndex(false), -1)
assert.equal(menuToolNeedsCaret('align'), true)
assert.equal(menuToolNeedsCaret('bold'), false)
assert.equal(disabledToolTitle('换图', true), '换图（当前不可用）')
assert.equal(disabledToolTitle('换图（当前不可用）', true), '换图（当前不可用）')
assert.equal(disabledToolTitle('换图', false), '换图')
assert.equal(groupHandleTitle('表格', 10), '拖动表格分组，本组 10 个按钮。Alt+左/右也可移动')

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
