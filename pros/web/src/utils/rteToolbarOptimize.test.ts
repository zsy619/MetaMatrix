import assert from 'node:assert/strict'
import {
  alignToolTitle,
  blockMenuTitle,
  clampToolbarQuery,
  codeBlockToolTitle,
  cycleSearchIndex,
  disabledToolTitle,
  fontFamilyCaption,
  fontSizeCaption,
  formatPainterLabel,
  groupHandleTitle,
  hiddenGroupPlaceholders,
  isToolbarMenuTrigger,
  lineHeightCaption,
  listToolLabel,
  MENU_CLOSE_DELAY_MS,
  menuFocusStep,
  menuTypeaheadIndex,
  menuToolNeedsCaret,
  moreToolsCaption,
  moreToolsTitle,
  orderToolbarSearchGroups,
  pasteFormatLabel,
  pushRecentValue,
  quoteToolTitle,
  readStoredRibbonTab,
  recentOptions,
  ribbonSearchLabel,
  ribbonTabForDigit,
  ribbonTabHint,
  ribbonTabTabIndex,
  ribbonTypeaheadQuery,
  searchEnterActivates,
  toolIsUnavailable,
  shortcutFromTitle,
  shortcutNeedles,
  spellcheckToolTitle,
  searchGroupCaption,
  stepRibbonTabBy,
  tableToolLabel,
  toolbarGroupReorderAllowed,
  toolbarMenuItemTitle,
  toolbarMenuKeyAction,
  toolsForToolbar,
  searchToolbarTools,
  stepRibbonTab,
  toolbarSearchStatus,
  wordStatTitle,
  zoomToolLabel,
  zoomToolTitle,
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
assert.equal(toolbarSearchStatus('拼音', 0), '没有匹配的按钮。试试拼音、表格或饼图')
assert.equal(toolbarSearchStatus('拼音', 2), '找到 2 个按钮，左右键可在结果间移动')
assert.equal(ribbonTabTabIndex(true), 0)
assert.equal(ribbonTabTabIndex(false), -1)
assert.equal(menuToolNeedsCaret('align'), true)
assert.equal(menuToolNeedsCaret('bold'), false)
assert.equal(disabledToolTitle('换图', true), '换图（当前不可用）')
assert.equal(disabledToolTitle('换图（当前不可用）', true), '换图（当前不可用）')
assert.equal(disabledToolTitle('换图', false), '换图')
assert.equal(groupHandleTitle('表格', 10), '拖动表格分组，本组 10 个按钮。Alt+左/右也可移动')
assert.equal(toolbarSearchStatus('拼音', 2, '注音'), '找到 2 个按钮，首选「注音」，左右键可在结果间移动')
assert.equal(toolbarSearchStatus('表', 24, '表格', true), '找到 24 个按钮，首选「表格」，只列出前若干个，左右键可在结果间移动')
const ordered = orderToolbarSearchGroups([
  { id: 'edit', label: '编辑', tools: [{ key: 'clear', label: '清除格式', title: '加粗后清除' }] },
  { id: 'style', label: '字体', tools: [{ key: 'bold', label: '加粗' }] },
], '加粗', 24)
assert.equal(ordered.groups[0]?.tools[0]?.key, 'bold')
assert.equal(ordered.capped, false)
assert.equal(searchGroupCaption('编辑', 2, true), '编辑 · 2')
assert.equal(searchGroupCaption('编辑', 2, false), '编辑')
assert.equal(fontFamilyCaption('', [{ label: '默认字体', value: '' }]), '字体')
assert.equal(fontFamilyCaption('"Songti SC", serif', [{ label: '宋体', value: '"Songti SC", serif' }]), '宋体')
assert.equal(lineHeightCaption('1.5', [{ label: '默认行高', value: '' }, { label: '1.5 倍', value: '1.5' }]), '1.5 倍')
assert.equal(alignToolTitle('center'), '当前居中。可选左对齐、居中、右对齐、两端对齐')
assert.equal(zoomToolTitle(1), '编辑区缩放，当前为实际大小')
assert.equal(zoomToolTitle(1.25), '编辑区缩放，当前 125%')
assert.equal(ribbonTabForDigit(['edit', 'style'], 2), 'style')
assert.equal(ribbonTabForDigit(['edit'], 9), '')
assert.equal(ribbonTypeaheadQuery('拼', ''), '拼')
assert.equal(ribbonTypeaheadQuery('Backspace', '拼音'), '拼')
assert.equal(ribbonTypeaheadQuery('ArrowLeft', '拼'), null)
assert.equal(toolbarSearchStatus('拼音', 1, '注音'), '找到 1 个按钮，首选「注音」，按 Enter 直接使用')
assert.equal(ribbonTabHint('table', '表格'), '表格：插入、斑马纹、冻结、行列')
assert.equal(listToolLabel('ordered'), '有序')
assert.equal(listToolLabel(''), '列表')
assert.equal(formatPainterLabel('sticky'), '连刷')
assert.equal(formatPainterLabel('off'), '格式刷')
assert.equal(searchEnterActivates(1), true)
assert.equal(searchEnterActivates(1, true), false)
assert.equal(searchEnterActivates(2), false)
assert.equal(cycleSearchIndex(0, 3, -1), 2)
assert.equal(cycleSearchIndex(2, 3, 1), 0)
assert.equal(moreToolsCaption(12), '更多 12')
assert.equal(moreToolsTitle(0), '更多格式与插入')
assert.equal(ribbonSearchLabel('编辑', 3), '编辑，3 个匹配')
assert.equal(ribbonSearchLabel('编辑', 0), '编辑')
assert.equal(clampToolbarQuery('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十额外啊', 32).length, 32)
assert.equal(searchToolbarTools([{ id: 'edit', label: '编辑', tools: [{ key: 'find', label: '查找' }] }], '查\u200b找')[0]?.key, 'find')
assert.equal(toolIsUnavailable({ disabled: () => true }), true)
assert.equal(searchToolbarTools([{ id: 't', label: '表', tools: [
  { key: 'off', label: '表格', disabled: () => true },
  { key: 'on', label: '表格2' },
] }], '表格')[0]?.key, 'on')
assert.equal(searchToolbarTools([{ id: 'f', label: '文件', tools: [{ key: 'export', label: '导出' }] }], 'ＰＤＦ')[0]?.key, 'export')
assert.equal(searchToolbarTools([{ id: 's', label: '字体', tools: [{ key: 'ruby', label: '注音' }] }], '拼\u3000音')[0]?.key, 'ruby')
assert.equal(toolbarSearchStatus('换图', 1, '换图', false, '图片', true), '找到 1 个按钮，首选「换图」，在图片，当前不可用')
assert.equal(MENU_CLOSE_DELAY_MS >= 300, true)
assert.equal(hiddenGroupPlaceholders([{ id: 'edit', label: '编辑', tools: [{ key: 'undo' }] }], ['edit', 'writing'], [{ id: 'edit', label: '编辑', keyCount: 3 }, { id: 'writing', label: '书写', keyCount: 3 }, { id: 'other', label: '其他', keyCount: 0 }]).map((group) => group.id).join(','), 'edit,writing')
assert.equal(searchToolbarTools([{ id: 'insert', label: '插入', tools: [{ key: 'qrcode', label: '二维码' }] }], 'qr')[0]?.key, 'qrcode')
assert.equal(toolbarSearchStatus('拼音', 2, '注音', false, '字体与颜色'), '找到 2 个按钮，首选「注音」，在字体与颜色，左右键可在结果间移动')
assert.equal(toolbarMenuKeyAction('ArrowDown', true, true), 'move')
assert.equal(toolbarMenuKeyAction('Escape', true, true), 'close')
assert.equal(toolbarMenuKeyAction('ArrowDown', false, false), 'open')
assert.equal(toolbarMenuKeyAction('ArrowDown', false, true), 'move')
assert.equal(toolbarMenuKeyAction('ArrowLeft', false, true), 'ignore')
assert.equal(isToolbarMenuTrigger({ popup: 'menu' }), true)
assert.equal(isToolbarMenuTrigger({ caret: true }), true)
assert.equal(isToolbarMenuTrigger({ popup: 'dialog' }), false)
assert.equal(menuTypeaheadIndex(['居中', '居左', '居右'], '居', -1), 0)
assert.equal(menuTypeaheadIndex(['居中', '居左', '居右'], '居', 0), 1)
assert.equal(menuTypeaheadIndex(['居中', '居左'], '右', -1), -1)
assert.equal(menuTypeaheadIndex(['左对齐', '居中'], ' ', -1), -1)
assert.equal(toolbarMenuItemTitle('均分（1:1）'), '把内容分成左右等宽的两栏')
assert.equal(toolbarMenuItemTitle('全大写'), '把选中的英文变成大写')
assert.equal(toolbarMenuItemTitle('没有这项'), '')
assert.equal(toolbarMenuItemTitle('无序列表'), '用圆点列出各项')
assert.equal(toolbarMenuItemTitle('100%'), '恢复编辑区的实际大小')
assert.equal(toolbarMenuItemTitle('一键生成…'), '按数据自动生成图表')
assert.equal(toolbarMenuItemTitle('小红书'), '窄卡片，顶部一条红色')
assert.equal(toolbarMenuItemTitle('康奈尔'), '左边线索栏，底部总结栏')
assert.equal(toolbarMenuItemTitle('竖排'), '文字从上往下、从右往左排')
assert.equal(blockMenuTitle('h1'), '改成一级标题')
assert.equal(blockMenuTitle('sync'), '插入一块会同步的内容')
assert.equal(blockMenuTitle('missing'), '')
assert.equal(wordStatTitle('minutes'), '按大约 400 字一分钟估算')
assert.equal(wordStatTitle('paragraphs'), '有文字的段落个数，空段不算')
assert.equal(stepRibbonTabBy(['a', 'b', 'c', 'd', 'e'], 'b', 3), 'e')
assert.equal(stepRibbonTabBy(['a', 'b', 'c'], 'a', -3), 'a')
assert.equal(zoomToolLabel(1), '实际大小')
assert.equal(zoomToolLabel(1.5), '150%')
assert.equal(pasteFormatLabel('markdown'), '粘贴·MD')
assert.equal(tableToolLabel(true), '表操作')
assert.equal(tableToolLabel(false), '插表格')
assert.equal(quoteToolTitle(true).startsWith('已在引用中'), true)
assert.equal(codeBlockToolTitle(false).includes('代码块'), true)
assert.equal(spellcheckToolTitle(true).includes('已开启'), true)
assert.equal(searchToolbarTools([{ id: 'review', label: '审阅', tools: [{ key: 'snippets', label: '片段' }] }], '常用语')[0]?.key, 'snippets')
assert.equal(searchToolbarTools([{ id: 'table', label: '表格', tools: [{ key: 'tableZebra', label: '斑马纹' }, { key: 'table', label: '表格' }] }], '表格')[0]?.key, 'table')
assert.equal(searchToolbarTools([{ id: 'table', label: '表格', tools: [{ key: 'tableZebra', label: '斑马纹' }] }], '表格').length, 1)
assert.equal(shortcutFromTitle('加粗 (Ctrl/⌘+B)'), 'Ctrl/⌘+B')
assert.equal(shortcutFromTitle('没有快捷键'), '')
assert.ok(shortcutNeedles('加粗 (Ctrl/⌘+B)').includes('ctrl+b'))
assert.equal(searchToolbarTools([{ id: 'style', label: '字体与颜色', tools: [{ key: 'bold', label: '加粗', title: '加粗 (Ctrl/⌘+B)' }] }], 'ctrl+b')[0]?.key, 'bold')
assert.equal(searchToolbarTools([{ id: 'insert', label: '插入', tools: [{ key: 'form', label: '表单' }] }], '单选')[0]?.key, 'form')
assert.equal(searchToolbarTools([{ id: 'review', label: '审阅', tools: [{ key: 'deepOptimize', label: '一键整理' }] }], '深优化')[0]?.key, 'deepOptimize')
assert.equal(searchToolbarTools([{ id: 'review', label: '审阅', tools: [{ key: 'headingCheck', label: '标题检查' }] }], '标题检')[0]?.key, 'headingCheck')
assert.equal(searchToolbarTools([{ id: 'table', label: '表格', tools: [{ key: 'tableFormula', label: '求和' }] }], '格公式')[0]?.key, 'tableFormula')
assert.equal(toolbarGroupReorderAllowed(''), true)
assert.equal(toolbarGroupReorderAllowed('饼图'), false)
assert.equal(menuFocusStep(-1, 4, 'ArrowDown'), 0)
assert.equal(menuFocusStep(-1, 4, 'ArrowUp'), 3)
assert.equal(menuFocusStep(0, 4, 'End'), 3)
assert.equal(menuFocusStep(3, 4, 'Home'), 0)
assert.equal(menuFocusStep(1, 4, 'ArrowDown'), 2)
assert.equal(menuFocusStep(0, 4, 'Escape'), null)
assert.equal(menuToolNeedsCaret('wordStats'), true)
assert.equal(menuToolNeedsCaret('attach'), false)
const primary = new Set(['undo', 'bold'])
assert.deepEqual(toolsForToolbar([
  { key: 'undo' },
  { key: 'mermaid' },
  { key: 'div', kind: 'divider' },
], { expanded: false, querying: false, primary }).map((tool) => tool.key), ['undo'])
assert.deepEqual(toolsForToolbar([
  { key: 'undo' },
  { key: 'mermaid' },
], { expanded: false, querying: true, primary }).map((tool) => tool.key), ['undo', 'mermaid'])
assert.equal(searchToolbarTools([{ id: 'charts', label: '图表', tools: [{ key: 'chart:basic', label: '基础' }] }], '饼图')[0]?.key, 'chart:basic')
assert.equal(searchToolbarTools([{ id: 'insert', label: '插入', tools: [{ key: 'table', label: '表格' }] }], 'a').length, 0)

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
