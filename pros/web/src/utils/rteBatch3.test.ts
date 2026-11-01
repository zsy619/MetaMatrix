import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import {
  FEISHU_BATCH3_SHORTCUTS,
  activeOutlineIndex,
  reorderIndexes,
} from './rteBatch3.ts'

assert.deepEqual(reorderIndexes(4, 0, 2), [1, 0, 2, 3])
assert.deepEqual(reorderIndexes(4, 3, 1), [0, 3, 1, 2])
assert.equal(reorderIndexes(4, 1, 2), null)
assert.equal(reorderIndexes(1, 0, 0), null)
assert.equal(reorderIndexes(3, -1, 1), null)

assert.equal(activeOutlineIndex([2, 20, 40], 0), -1)
assert.equal(activeOutlineIndex([2, 20, 40], 20), 1)
assert.equal(activeOutlineIndex([2, 20, 40], 55), 2)
assert.equal(activeOutlineIndex([], 4), -1)

const keys = FEISHU_BATCH3_SHORTCUTS.map((item) => item.desc).join(' ')
assert.ok(keys.includes('目录'))
assert.ok(keys.includes('公式'))
assert.ok(keys.includes('Markdown'))
assert.ok(keys.includes('打印'))

const window = new Window()
globalThis.document = window.document as unknown as Document
globalThis.Node = window.Node as unknown as typeof Node
const { htmlToMarkdown } = await import('./rteExportMd.ts')
const md = htmlToMarkdown(
  '<h2>季度</h2><p>正文 <strong>重点</strong></p><pre><code class="language-ts">const n = 1</code></pre><hr>',
)
assert.ok(md.includes('## 季度'))
assert.ok(md.includes('**重点**'))
assert.ok(md.includes('```'))
assert.ok(md.includes('const n = 1'))
assert.ok(md.includes('---'))

console.log('feishu rte batch3 guards ok')
