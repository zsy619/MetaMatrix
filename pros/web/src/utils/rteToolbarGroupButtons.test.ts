import assert from 'node:assert/strict'
import {
  moveGroupButton,
  normalizeGroupButtonConfig,
  readToolbarGroupButtons,
  resolveGroupButtonOrder,
  toggleGroupButtonHidden,
  visibleGroupButtonKeys,
  writeToolbarGroupButtons,
  type ToolbarGroupButtonsByPanelId,
} from './rteToolbarGroupButtons.ts'

const keys = ['bold', 'italic', 'underline']

// 归一化：未知 key 丢弃，缺失的补在后面
const normalized = normalizeGroupButtonConfig({ order: ['italic', 'nope', 'bold'] }, keys)
assert.deepEqual(normalized.order, ['italic', 'bold', 'underline'])
assert.deepEqual(normalized.hidden, [])

// 隐藏列表去重并丢掉未知 key
const withHidden = normalizeGroupButtonConfig({ hidden: ['bold', 'bold', 'zzz'] }, keys)
assert.deepEqual(withHidden.hidden, ['bold'])

// 渲染顺序：隐藏的剔除
assert.deepEqual(resolveGroupButtonOrder({ hidden: ['italic'] }, keys), ['bold', 'underline'])
assert.deepEqual(visibleGroupButtonKeys(null, keys), keys)

// 写入与读取
let map: ToolbarGroupButtonsByPanelId | undefined
map = writeToolbarGroupButtons(map, 'p1', 'marks', { order: ['italic', 'bold', 'underline'], hidden: [] })
assert.ok(map)
assert.equal(Object.keys(map!).length, 1)
const read = readToolbarGroupButtons(map, 'p1', 'marks', keys)
assert.deepEqual(read.order, ['italic', 'bold', 'underline'])

// 读不存在的面板返回默认
assert.deepEqual(readToolbarGroupButtons(map, 'p2', 'marks', keys).order, keys)
assert.deepEqual(readToolbarGroupButtons(null, 'p1', 'marks', keys).order, keys)

// 写空配置删掉分组；整张表空了返回 undefined
map = writeToolbarGroupButtons(map, 'p1', 'marks', null)
assert.equal(map, undefined)

// 只写一个面板，另一个面板不受影响
let map2: ToolbarGroupButtonsByPanelId | undefined
map2 = writeToolbarGroupButtons(map2, 'p1', 'marks', { hidden: ['bold'] })
map2 = writeToolbarGroupButtons(map2, 'p2', 'marks', { hidden: ['italic'] })
assert.equal(Object.keys(map2!).length, 2)
assert.deepEqual(readToolbarGroupButtons(map2, 'p1', 'marks', keys).hidden, ['bold'])
assert.deepEqual(readToolbarGroupButtons(map2, 'p2', 'marks', keys).hidden, ['italic'])

// 移动按钮
const moved = moveGroupButton(null, keys, 'underline', 0)
assert.ok(moved)
assert.deepEqual(moved!.order, ['underline', 'bold', 'italic'])
// 没变化返回 null
assert.equal(moveGroupButton(null, keys, 'bold', 0), null)
assert.equal(moveGroupButton(null, keys, 'nope', 0), null)
assert.equal(moveGroupButton(null, keys, 'bold', 99), null)

// 隐藏切换
const hidden = toggleGroupButtonHidden(null, keys, 'italic')
assert.ok(hidden)
assert.deepEqual(hidden!.hidden, ['italic'])
const shown = toggleGroupButtonHidden(hidden, keys, 'italic')
assert.ok(shown)
assert.deepEqual(shown!.hidden, [])

console.log('rteToolbarGroupButtons ok')
