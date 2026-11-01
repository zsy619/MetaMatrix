import assert from 'node:assert/strict'
import {
  countNodeName,
  feishuClipboardDocument,
  filterLabeledTargets,
  htmlHasTable,
  looksLikeTsvTable,
  mentionEmptyHint,
  nextIndentLevel,
  shortcutSearchText,
  slashItemSearchText,
  stepMenuIndex,
  tabAction,
  textMatchesQuery,
  togglePreviewMode,
  tsvToTableHtml,
} from './rteRound7.ts'

assert.equal(nextIndentLevel(0, 1), 1)
assert.equal(nextIndentLevel(8, 1), 8)
assert.equal(nextIndentLevel(0, -1), 0)
assert.equal(nextIndentLevel(3, -1), 2)
assert.equal(countNodeName(['blockquote', 'paragraph', 'blockquote'], 'blockquote'), 2)

assert.equal(
  tabAction({
    inTable: true,
    inCode: false,
    inList: false,
    inQuote: false,
    quoteDepth: 0,
    paragraphIndent: 0,
    shift: false,
  }),
  'pass',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: true,
    inList: true,
    inQuote: false,
    quoteDepth: 0,
    paragraphIndent: 0,
    shift: false,
  }),
  'pass',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: true,
    inQuote: false,
    quoteDepth: 0,
    paragraphIndent: 0,
    shift: false,
  }),
  'list-sink',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: true,
    inQuote: false,
    quoteDepth: 0,
    paragraphIndent: 0,
    shift: true,
  }),
  'list-lift',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: false,
    inQuote: true,
    quoteDepth: 1,
    paragraphIndent: 0,
    shift: false,
  }),
  'quote-nest',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: false,
    inQuote: true,
    quoteDepth: 4,
    paragraphIndent: 0,
    shift: false,
  }),
  'indent',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: false,
    inQuote: true,
    quoteDepth: 2,
    paragraphIndent: 0,
    shift: true,
  }),
  'quote-lift',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: false,
    inQuote: true,
    quoteDepth: 1,
    paragraphIndent: 2,
    shift: true,
  }),
  'outdent',
)
assert.equal(
  tabAction({
    inTable: false,
    inCode: false,
    inList: false,
    inQuote: false,
    quoteDepth: 0,
    paragraphIndent: 0,
    shift: false,
  }),
  'indent',
)

assert.equal(togglePreviewMode('edit'), 'preview')
assert.equal(togglePreviewMode('preview'), 'edit')
assert.equal(togglePreviewMode('source'), 'preview')

assert.equal(looksLikeTsvTable('甲\t乙\n丙\t丁'), true)
assert.equal(looksLikeTsvTable('只有一行\t不够'), false)
assert.equal(looksLikeTsvTable('| a | b |\n| c | d |'), false)
assert.equal(htmlHasTable('<p>x</p><table><tr><td>1</td></tr></table>'), true)
assert.equal(htmlHasTable('<p>no</p>'), false)
const tableHtml = tsvToTableHtml('甲\t乙\n丙\t丁')
assert.match(tableHtml, /<table><tbody><tr><td><p>甲<\/p><\/td><td><p>乙<\/p><\/td><\/tr>/)
assert.doesNotMatch(tableHtml, /<script/)
assert.match(tsvToTableHtml('a<b>\tok'), /a&lt;b&gt;/)

const copied = feishuClipboardDocument('<table><tr><td>1</td></tr></table>', '周报')
assert.match(copied, /<h1>周报<\/h1>/)
assert.match(copied, /<table border="1"/)
assert.doesNotMatch(
  feishuClipboardDocument('<table border="1"><tr></tr></table>'),
  /<table border="1" cellpadding/,
)

const toggleHay = slashItemSearchText({
  id: 'toggle-block',
  label: '折叠块',
  keywords: ['折叠'],
  action: { type: 'toggleBlock' },
})
assert.equal(textMatchesQuery(toggleHay, 'toggle block'), true)
assert.equal(textMatchesQuery(toggleHay, 'collapse'), true)
assert.equal(textMatchesQuery(toggleHay, '折叠'), true)
const quoteHay = slashItemSearchText({
  id: 'blockquote',
  label: '引用',
  action: { type: 'blockquote' },
})
assert.equal(textMatchesQuery(quoteHay, 'quote'), true)
const hrHay = slashItemSearchText({
  id: 'hr',
  label: '分割线',
  action: { type: 'hr' },
})
assert.equal(textMatchesQuery(hrHay, 'horizontal rule'), true)
const headingHay = slashItemSearchText({
  id: 'heading-1',
  label: '标题 1',
  action: { type: 'heading', level: 1 },
})
assert.equal(textMatchesQuery(headingHay, 'heading'), true)

assert.equal(
  textMatchesQuery(shortcutSearchText('Ctrl/⌘ + B / I / U', '加粗 / 斜体 / 下划线'), 'bold'),
  true,
)
assert.equal(
  textMatchesQuery(shortcutSearchText('Tab / Shift + Tab', '段落、引用与列表缩进'), 'indent'),
  true,
)
assert.equal(
  textMatchesQuery(shortcutSearchText('Ctrl/⌘ + Alt + \\', '只读预览与编辑切换'), 'preview'),
  true,
)
assert.equal(textMatchesQuery(shortcutSearchText('Ctrl/⌘ + K', '插入或编辑链接'), '链接'), true)

assert.equal(stepMenuIndex(0, 3, 'ArrowDown'), 1)
assert.equal(stepMenuIndex(0, 3, 'ArrowUp'), 2)
assert.equal(stepMenuIndex(2, 3, 'Home'), 0)
assert.equal(stepMenuIndex(0, 3, 'End'), 2)
assert.equal(stepMenuIndex(0, 0, 'ArrowDown'), null)

assert.match(mentionEmptyHint(''), /Enter/)
assert.match(mentionEmptyHint('张三'), /张三/)

const targets = [
  { id: 'h1', kind: 'heading', label: '§ 季度目标' },
  { id: 'f1', kind: 'figure', label: '架构图' },
  { id: 't1', kind: 'table', label: '表 1' },
]
assert.equal(filterLabeledTargets(targets, 'heading').length, 1)
assert.equal(filterLabeledTargets(targets, 'heading')[0]?.id, 'h1')
assert.equal(filterLabeledTargets(targets, '图').length, 1)
assert.equal(filterLabeledTargets(targets, '').length, 3)

console.log('feishu round7 guards ok')
