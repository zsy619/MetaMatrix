import assert from 'node:assert/strict'
import {
  alignChoiceTitle,
  alignToolTitle,
  blockHandleTitle,
  blockMenuTitle,
  clampToolbarQuery,
  codeLangTitle,
  cropTitle,
  codeBlockToolTitle,
  cycleSearchIndex,
  disabledToolTitle,
  emptyGuideTitle,
  fontFamilyCaption,
  fontSizeCaption,
  formatPainterLabel,
  groupHandleTitle,
  hiddenGroupPlaceholders,
  imagePlaceTitle,
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
  imageWidthTitle,
  pageSizeTitle,
  pasteFormatLabel,
  pickerTabTitle,
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
  spacingGroupTitle,
  spacingOptionTitle,
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
  toolbarActionTitle,
  TOOLBAR_ACTION_TITLES,
  zoomToolLabel,
  zoomToolTitle,
} from './rteToolbarOptimize.ts'

const tabs = ['edit', 'style', 'paragraph']
assert.equal(Object.keys(TOOLBAR_ACTION_TITLES).length, 60)
assert.equal(new Set(Object.values(TOOLBAR_ACTION_TITLES)).size, 60)
assert.equal(toolbarActionTitle('code-lines').includes('行号'), true)
assert.equal(toolbarActionTitle('list-continue').includes('不会从 1'), true)
assert.equal(toolbarActionTitle('missing'), '')
const aliasGroups = [{
  id: 'tools',
  label: '工具',
  tools: [
    { key: 'code', label: '代码' },
    { key: 'lineHeight', label: '行高' },
    { key: 'attach', label: '附件钮' },
    { key: 'tidyHalf', label: '半' },
    { key: 'template', label: '套用' },
    { key: 'redo', label: '重做钮' },
    { key: 'find', label: '查找钮' },
    { key: 'table', label: '表格钮' },
  ],
}]
assert.equal(searchToolbarTools(aliasGroups, '代码块')[0]?.key, 'code')
assert.equal(searchToolbarTools(aliasGroups, '行距')[0]?.key, 'lineHeight')
assert.equal(searchToolbarTools(aliasGroups, '回形针')[0]?.key, 'attach')
assert.equal(searchToolbarTools(aliasGroups, '转半角')[0]?.key, 'tidyHalf')
assert.equal(searchToolbarTools(aliasGroups, '文档模板')[0]?.key, 'template')
assert.equal(searchToolbarTools(aliasGroups, '恢复')[0]?.key, 'redo')
assert.equal(searchToolbarTools(aliasGroups, '寻找')[0]?.key, 'find')
assert.equal(searchToolbarTools(aliasGroups, '插表')[0]?.key, 'table')
const moreAliases = [{
  id: 'more',
  label: '更多',
  tools: [
    { key: 'undo', label: '撤销钮' },
    { key: 'bold', label: '粗' },
    { key: 'emoji', label: '表情钮' },
    { key: 'copyMd', label: '复制' },
    { key: 'mentionBtn', label: '提及钮' },
  ],
}]
assert.equal(searchToolbarTools(moreAliases, '撤回')[0]?.key, 'undo')
assert.equal(searchToolbarTools(moreAliases, '加黑')[0]?.key, 'bold')
assert.equal(searchToolbarTools(moreAliases, '颜文字')[0]?.key, 'emoji')
assert.equal(searchToolbarTools(moreAliases, '复制md')[0]?.key, 'copyMd')
assert.equal(searchToolbarTools(moreAliases, '艾特')[0]?.key, 'mentionBtn')
const spoken = [{
  id: 'spoken',
  label: '口语',
  tools: [
    { key: 'undo', label: '撤销钮' },
    { key: 'bold', label: '粗' },
    { key: 'table', label: '表格钮' },
    { key: 'speak', label: '朗读钮' },
    { key: 'clear', label: '清除钮' },
  ],
}]
assert.equal(searchToolbarTools(spoken, '返回')[0]?.key, 'undo')
assert.equal(searchToolbarTools(spoken, '变粗')[0]?.key, 'bold')
assert.equal(searchToolbarTools(spoken, '画表')[0]?.key, 'table')
assert.equal(searchToolbarTools(spoken, '念出来')[0]?.key, 'speak')
assert.equal(searchToolbarTools(spoken, '去掉格式')[0]?.key, 'clear')
assert.equal(searchToolbarTools(spoken, '退回')[0]?.key, 'undo')
assert.equal(searchToolbarTools(spoken, '制表')[0]?.key, 'table')
assert.equal(searchToolbarTools([{ id: 'h', label: '高', tools: [{ key: 'highlight', label: '亮' }] }], '划重点')[0]?.key, 'highlight')
assert.equal(searchToolbarTools([{ id: 'c', label: '栏', tools: [{ key: 'columns', label: '栏' }] }], '分列')[0]?.key, 'columns')
assert.equal(searchToolbarTools([{ id: 'p', label: '页', tools: [{ key: 'printPreview', label: '预览' }] }], '看打印')[0]?.key, 'printPreview')
assert.equal(searchToolbarTools([{ id: 'd', label: '整', tools: [{ key: 'deepOptimize', label: '整理' }] }], '整理全文')[0]?.key, 'deepOptimize')
assert.equal(searchToolbarTools([{ id: 'u', label: '撤', tools: [{ key: 'undo', label: '撤' }] }], '上一步')[0]?.key, 'undo')
assert.equal(searchToolbarTools([{ id: 't', label: '表', tools: [{ key: 'table', label: '表' }] }], '做表')[0]?.key, 'table')
assert.equal(searchToolbarTools([{ id: 'q', label: '引', tools: [{ key: 'quote', label: '引' }] }], '加引用')[0]?.key, 'quote')
assert.equal(searchToolbarTools([{ id: 'u', label: '撤', tools: [{ key: 'undo', label: '撤' }] }], '撤销一下')[0]?.key, 'undo')
assert.equal(searchToolbarTools([{ id: 'h', label: '线', tools: [{ key: 'hr', label: '线' }] }], '画条线')[0]?.key, 'hr')
assert.equal(searchToolbarTools([{ id: 'z', label: '缩', tools: [{ key: 'zoom', label: '缩' }] }], '拉远')[0]?.key, 'zoom')
assert.equal(searchToolbarTools([{ id: 'c', label: '色', tools: [{ key: 'color', label: '色' }] }], '字色')[0]?.key, 'color')
assert.equal(searchToolbarTools([{ id: 'p', label: '页', tools: [{ key: 'pageBreak', label: '页' }] }], '另起一页')[0]?.key, 'pageBreak')
assert.equal(searchToolbarTools([{ id: 'd', label: '今', tools: [{ key: 'insertDate', label: '今' }] }], '写上今天')[0]?.key, 'insertDate')
assert.equal(searchToolbarTools([{ id: 'r', label: '音', tools: [{ key: 'ruby', label: '音' }] }], '标音')[0]?.key, 'ruby')
assert.equal(searchToolbarTools([{ id: 'p', label: '看', tools: [{ key: 'printPreview', label: '看' }] }], '预看')[0]?.key, 'printPreview')
assert.equal(searchToolbarTools([{ id: 'f', label: '算', tools: [{ key: 'tableFormula', label: '算' }] }], '算一算')[0]?.key, 'tableFormula')
assert.equal(searchToolbarTools([{ id: 'h', label: '半', tools: [{ key: 'tidyHalf', label: '半' }] }], '变成半角')[0]?.key, 'tidyHalf')
assert.equal(searchToolbarTools([{ id: 'a', label: '包', tools: [{ key: 'attach', label: '包' }] }], '附上文件')[0]?.key, 'attach')
assert.equal(searchToolbarTools([{ id: 'i', label: '绕', tools: [{ key: 'imageLayout', label: '绕' }] }], '文字绕图')[0]?.key, 'imageLayout')
assert.equal(searchToolbarTools([{ id: 'c', label: '栏', tools: [{ key: 'columns', label: '栏' }] }], '左右栏')[0]?.key, 'columns')
assert.equal(searchToolbarTools([{ id: 'u', label: '撤', tools: [{ key: 'undo', label: '撤' }] }], '退回去')[0]?.key, 'undo')
assert.equal(searchToolbarTools([{ id: 'p', label: '纸', tools: [{ key: 'writingPaper', label: '纸' }] }], '铺稿纸')[0]?.key, 'writingPaper')
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
assert.equal(pickerTabTitle('颜文字'), '用符号拼成的表情')
assert.equal(pickerTabTitle('拼音'), '拼音声调符号')
assert.equal(pickerTabTitle('没有'), '')
assert.equal(wordStatTitle('images'), '文档里的图片张数')
assert.equal(wordStatTitle('dock'), '打开或收起详细字数')
assert.equal(spacingGroupTitle('marginTop'), '设置这一段和上一段之间空多少')
assert.equal(spacingOptionTitle('marginTop', ''), '段前用编辑器原来的距离')
assert.equal(spacingOptionTitle('marginTop', '1em'), '段前空出一个字')
assert.equal(spacingOptionTitle('letterSpacing', '0'), '字和字贴紧')
assert.equal(spacingOptionTitle('textIndent', '2em'), '段首空出两个字')
assert.equal(spacingOptionTitle('textDir', 'rtl'), '这一段从右往左写')
assert.equal(spacingOptionTitle('marginTop', '9em'), '')
assert.equal(codeLangTitle('纯文本'), '不按语言上色，原样显示')
assert.equal(codeLangTitle('Python'), '按 Python 的语法给这段代码上色')
assert.equal(codeLangTitle('没有'), '')
assert.equal(pageSizeTitle('a4'), 'A4 纸，210×297 毫米')
assert.equal(pageSizeTitle('full'), '编辑区铺满整个面板')
assert.equal(imageWidthTitle('50%'), '图片缩到编辑区的一半宽')
assert.equal(imageWidthTitle('没有'), '')
assert.equal(blockHandleTitle('insert'), '在这一块下面插入空段，并打开插入菜单')
assert.equal(blockHandleTitle('delete'), '删掉这一块')
assert.equal(blockHandleTitle('missing'), '')
assert.equal(cropTitle('16:9'), '裁成宽屏，宽比高是 16 比 9')
assert.equal(cropTitle('原始'), '取消裁剪，显示整张图')
assert.equal(cropTitle('没有'), '')
assert.equal(emptyGuideTitle('heading'), '插入一级标题')
assert.equal(emptyGuideTitle('columns'), '把内容分成左右等宽的两栏')
assert.equal(emptyGuideTitle('missing'), '')
assert.equal(imagePlaceTitle('左环绕'), '图片在左，文字绕着排')
assert.equal(alignChoiceTitle('justify'), '这一段左右两端对齐')
assert.equal(alignChoiceTitle('missing'), '')
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
