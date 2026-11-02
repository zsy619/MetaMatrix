import assert from 'node:assert/strict'
import {
  buildPinyinIndex,
  matchesPinyin,
  pinyinFull,
  pinyinInitials,
  pinyinSearchScore,
} from './rtePinyin.ts'

// 首字母
assert.equal(pinyinInitials('标题'), 'bt')
assert.equal(pinyinInitials('表格'), 'bg')
assert.ok(pinyinInitials('标题 1').startsWith('bt'))
assert.equal(pinyinInitials(''), '')

// 全拼
assert.ok(pinyinFull('标题').includes('biaoti'))
assert.ok(pinyinFull('表格').includes('biaoge'))

// 命中规则
assert.equal(matchesPinyin('标题', 'bt'), true)
assert.equal(matchesPinyin('标题', 'biao'), true)
assert.equal(matchesPinyin('标题', '标题'), true)
assert.equal(matchesPinyin('表格', 'bt'), false)
assert.equal(matchesPinyin('标题', ''), true)

// 多词按「与」处理
assert.equal(matchesPinyin('一级标题', 'ybt'), true)
assert.equal(matchesPinyin('一级标题', 'bt bt'), true)
assert.equal(matchesPinyin('一级标题', 'bt zz'), false)
assert.equal(matchesPinyin('一级标题', '标题 一级'), true)

// 打分顺序：完全相等 > 前缀 > 首字母前缀 > 首字母包含 > 普通包含
const exact = pinyinSearchScore('标题', '标题')
const prefix = pinyinSearchScore('标题一', '标题')
const initialPrefix = pinyinSearchScore('标题', 'bt')
const initialInside = pinyinSearchScore('一级标题', 'bt')
const plain = pinyinSearchScore('其它标题内容', '内容')
assert.ok(exact > prefix, `${exact} > ${prefix}`)
assert.ok(prefix > initialPrefix, `${prefix} > ${initialPrefix}`)
assert.ok(initialPrefix > initialInside, `${initialPrefix} > ${initialInside}`)
assert.ok(initialInside > plain, `${initialInside} > ${plain}`)
assert.equal(pinyinSearchScore('表格', 'bt'), 0)
assert.equal(pinyinSearchScore('标题', ''), 1)

// 索引
const index = buildPinyinIndex(['标题', '表格'])
assert.equal(index.get('标题'), 'bt')
assert.equal(index.get('表格'), 'bg')
assert.equal(index.size, 2)

console.log('rtePinyin ok')
