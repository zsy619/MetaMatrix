import assert from 'node:assert/strict'
import { countWords, normalizeHtml, rtePlaceholderText, toEditorContent } from './rteContent.ts'

assert.equal(toEditorContent(''), '<p></p>')
assert.equal(toEditorContent('  '), '<p></p>')
assert.equal(toEditorContent('你好'), '<p>你好</p>')
assert.equal(toEditorContent('<p>已有</p>'), '<p>已有</p>')
assert.equal(toEditorContent('<b>a</b>'), '<b>a</b>')
assert.equal(normalizeHtml('<p>\n  <strong>A</strong>\n</p>'), '<p><strong>A</strong></p>')
assert.equal(countWords(''), 0)
assert.equal(countWords('你好 world'), 3)

const empty = {
  editor: { isEmpty: true, state: { doc: { resolve: () => ({ parent: { type: { name: 'doc' } } }) } } },
  node: { type: { name: 'paragraph' }, textContent: '' },
  pos: 1,
}
assert.equal(rtePlaceholderText('请输入正文', empty), '输入正文，或按 / 快速插入')
assert.equal(rtePlaceholderText('写点什么', empty), '写点什么')
assert.equal(
  rtePlaceholderText('请输入正文', {
    editor: { isEmpty: false, state: { doc: { resolve: () => ({ parent: { type: { name: 'paragraph' } } }) } } },
    node: { type: { name: 'heading' }, textContent: '' },
    pos: 1,
  }),
  '标题',
)

console.log('rte content ok')
