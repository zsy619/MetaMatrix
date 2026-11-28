/**
 * P0-5：紧凑态主栏与方案 A 分组对齐。
 *
 * 口径：
 * - 紧凑主栏的高频键由 TOOLBAR_GROUPS 派生（COMPACT_PRIMARY_KEYS_BY_GROUP），
 *   不再单独维护一份扁平顺序表；
 * - 组内相对顺序 = 该组 TOOLBAR_GROUPS.keys 顺序；
 * - 组间顺序 = 用户可拖拽的分组顺序（拖完紧凑主栏随之同步）；
 * - 图表 9 个一级分类下拉不进紧凑主栏，统一收在「更多」里（窄屏可找到）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CHART_TOOLBAR_KEYS,
  COMPACT_PRIMARY_KEYS_BY_GROUP,
  COMPACT_PRIMARY_KEY_SET,
  TOOLBAR_GROUPS,
  buildToolbarGroups,
  compactOverflowKeys,
  compactPrimaryKeys,
  compactPrimaryKeysByGroup,
  normalizeToolbarGroupOrder,
} from './rteToolbarGroups.ts'

const groupById = new Map(TOOLBAR_GROUPS.map((group) => [group.id, group]))
const allGroupKeys = TOOLBAR_GROUPS.flatMap((group) => group.keys)

// ① 紧凑主栏高频键 ⊆ 当前 TOOLBAR_GROUPS 的 key
for (const key of COMPACT_PRIMARY_KEY_SET) {
  assert.ok(allGroupKeys.includes(key), `紧凑主栏高频键 ${key} 不在 TOOLBAR_GROUPS 里`)
}
// 声明表本身也不能写出分组里没有的 key
for (const [groupId, keys] of Object.entries(COMPACT_PRIMARY_KEYS_BY_GROUP)) {
  const def = groupById.get(groupId)
  assert.ok(def, `紧凑主栏声明了不存在的分组 ${groupId}`)
  for (const key of keys) {
    assert.ok(def!.keys.includes(key), `${groupId} 组的高频键 ${key} 不在该组里`)
  }
}

// ① 相对顺序与分组顺序一致：组内顺序 = TOOLBAR_GROUPS.keys 过滤后的顺序
for (const { id, keys } of compactPrimaryKeysByGroup()) {
  const def = groupById.get(id)!
  assert.deepEqual(keys, def.keys.filter((key) => COMPACT_PRIMARY_KEYS_BY_GROUP[id].includes(key)))
}

// 默认分组顺序下，紧凑主栏 = 各组高频键按组序拼接
assert.deepEqual(
  compactPrimaryKeys(),
  compactPrimaryKeysByGroup().flatMap((group) => group.keys),
)
// 高频键集合就是紧凑主栏的 key 集合
assert.deepEqual(new Set(compactPrimaryKeys()), COMPACT_PRIMARY_KEY_SET)
// 高频键数量受控（不能把整条工具栏塞进紧凑主栏）
assert.ok(COMPACT_PRIMARY_KEY_SET.size <= 20, `紧凑主栏高频键过多：${COMPACT_PRIMARY_KEY_SET.size}`)

// ② 用户拖拽分组顺序后，紧凑主栏随之同步（组间顺序跟随分组顺序）
const dragged = ['style', 'paragraph', 'insert', 'edit']
assert.deepEqual(
  compactPrimaryKeys(dragged),
  compactPrimaryKeysByGroup(dragged).flatMap((group) => group.keys),
)
assert.deepEqual(
  compactPrimaryKeys(dragged).slice(0, 4),
  ['fontSize', 'color', 'highlight', 'bold'], // style 组内仍按 TOOLBAR_GROUPS.keys 顺序
)
assert.deepEqual(
  compactPrimaryKeysByGroup(dragged).map((group) => group.id),
  ['style', 'paragraph', 'insert', 'edit', 'table', 'review'],
)

// 拖拽后的紧凑主栏（buildToolbarGroups 是紧凑态真正用的组装修配函数）
const compactTools = [...COMPACT_PRIMARY_KEY_SET].map((key) => ({ key }))
const compactGroups = buildToolbarGroups(compactTools, normalizeToolbarGroupOrder(dragged))
assert.deepEqual(
  compactGroups.map((group) => group.id),
  ['style', 'paragraph', 'insert', 'edit', 'table', 'review'],
)
assert.deepEqual(
  compactGroups.map((group) => group.tools.map((tool) => tool.key)),
  [
    ['fontSize', 'color', 'highlight', 'bold', 'italic', 'underline', 'strike'],
    ['heading', 'list', 'align', 'indent', 'quote', 'code'],
    ['link', 'image'],
    ['undo', 'redo', 'find'],
    ['table'],
    ['deepOptimize'],
  ],
)

// ③ 图表 9 个一级分类：不在紧凑主栏，但在「更多」里可找到（顺序 = CHART_TOOLBAR_KEYS）
assert.equal(CHART_TOOLBAR_KEYS.length, 9)
for (const key of CHART_TOOLBAR_KEYS) {
  assert.ok(!COMPACT_PRIMARY_KEY_SET.has(key), `图表分类 ${key} 不应进紧凑主栏`)
}
const overflow = compactOverflowKeys(allGroupKeys)
for (const key of CHART_TOOLBAR_KEYS) {
  assert.ok(overflow.includes(key), `图表分类 ${key} 应在「更多」里可找到`)
}
assert.deepEqual(
  overflow.filter((key) => CHART_TOOLBAR_KEYS.includes(key)),
  [...CHART_TOOLBAR_KEYS],
)

// 图表分类顺序 = 工具栏「图表」组的定义顺序
const chartsGroup = groupById.get('charts')!
assert.deepEqual(chartsGroup.keys, [...CHART_TOOLBAR_KEYS])

// 紧凑主栏不再有第二份顺序表：RichTextEditor 直接用派生常量
const editorSource = readFileSync(
  new URL('../components/RichTextEditor.vue', import.meta.url),
  'utf8',
)
assert.ok(
  !editorSource.includes('FEISHU_PRIMARY_ORDER'),
  'RichTextEditor.vue 不应再维护 FEISHU_PRIMARY_ORDER 这份平行顺序表',
)
assert.ok(editorSource.includes('COMPACT_PRIMARY_KEY_SET'))

console.log('toolbar compact primary ok')
