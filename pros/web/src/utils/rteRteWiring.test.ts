import assert from 'node:assert/strict'
import { buildToolbarGroups } from './rteToolbarGroups.ts'
import { readMentionPermission, writeMentionPermission } from './rteDirectory.ts'
import { normalizeGroupButtonConfig } from './rteToolbarGroupButtons.ts'

// —— 组内按钮显隐与顺序：分组渲染时按配置排 ——
const tools = [
  { key: 'bold', label: '加粗' },
  { key: 'italic', label: '斜体' },
  { key: 'underline', label: '下划线' },
  { key: 'strike', label: '删除线' },
]

const groups = buildToolbarGroups(tools, ['style'])
assert.equal(groups.length, 1)
assert.deepEqual(
  groups[0]!.tools.map((t) => t.key),
  ['bold', 'italic', 'underline', 'strike'],
)

// 隐藏一个按钮
const hidden = buildToolbarGroups(tools, ['style'], {
  style: { order: ['bold', 'italic', 'underline', 'strike'], hidden: ['italic'] },
})
assert.deepEqual(
  hidden[0]!.tools.map((t) => t.key),
  ['bold', 'underline', 'strike'],
)

// 调整组内顺序
const reordered = buildToolbarGroups(tools, ['style'], {
  style: { order: ['strike', 'underline', 'italic', 'bold'], hidden: [] },
})
assert.deepEqual(
  reordered[0]!.tools.map((t) => t.key),
  ['strike', 'underline', 'italic', 'bold'],
)

// 配置归一化：未知 key 丢掉，缺失的补在后面
const normalized = normalizeGroupButtonConfig({ order: ['strike', 'nope'], hidden: ['italic'] }, [
  'bold',
  'italic',
  'underline',
  'strike',
])
assert.deepEqual(normalized.order, ['strike', 'bold', 'italic', 'underline'])
assert.deepEqual(normalized.hidden, ['italic'])

// —— @ 提及权限按面板存取 ——
const permMap = writeMentionPermission(undefined, 'p1', { allowedDepartments: ['研发部'] })
assert.deepEqual(permMap?.p1?.allowedDepartments, ['研发部'])
assert.deepEqual(readMentionPermission(permMap, 'p1')?.allowedDepartments, ['研发部'])
assert.equal(readMentionPermission(permMap, 'p2'), null)
assert.equal(readMentionPermission(permMap, ''), null)

// 传 null 表示恢复默认（不限）
const cleared = writeMentionPermission(permMap, 'p1', null)
assert.equal(cleared, undefined)

console.log('rteRteWiring ok')
