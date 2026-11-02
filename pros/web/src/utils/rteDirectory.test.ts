import assert from 'node:assert/strict'
import {
  canMentionUser,
  filterDirectoryUsers,
  searchDirectoryUsers,
  type DirectoryUser,
} from './rteDirectory.ts'

const users: DirectoryUser[] = [
  { id: 'u1', name: '张三', role: '开发', department: '研发部' },
  { id: 'u2', name: '李四', role: '产品', department: '产品部' },
  { id: 'u3', name: '王五', role: '设计', department: '设计部' },
]

// 无权限约束时都可见
assert.equal(canMentionUser(users[0]!), true)
assert.equal(filterDirectoryUsers(users).length, 3)

// 禁止名单优先于允许名单
assert.equal(
  canMentionUser(users[0]!, { allowedUserIds: ['u1', 'u2'], deniedUserIds: ['u1'] }),
  false,
)
assert.equal(
  canMentionUser(users[1]!, { allowedUserIds: ['u1', 'u2'], deniedUserIds: ['u1'] }),
  true,
)

// 只允许某些 id
assert.equal(filterDirectoryUsers(users, { allowedUserIds: ['u2'] }).length, 1)

// 部门限制
assert.equal(filterDirectoryUsers(users, { allowedDepartments: ['研发部'] }).length, 1)
assert.equal(filterDirectoryUsers(users, { allowedDepartments: ['研发部'] })[0]!.id, 'u1')

// 角色限制
assert.equal(filterDirectoryUsers(users, { allowedRoles: ['设计'] }).length, 1)

// 检索：先按权限，再按关键词
const permitted = searchDirectoryUsers(users, '张', { allowedUserIds: ['u1'] })
assert.equal(permitted.length, 1)
assert.equal(permitted[0]!.id, 'u1')

// 权限过滤先于关键词：无权限则搜不到
assert.equal(searchDirectoryUsers(users, '张', { allowedUserIds: ['u2'] }).length, 0)

// 拼音首字母
assert.equal(searchDirectoryUsers(users, 'zs').length, 1)

// 按部门与角色搜
assert.equal(searchDirectoryUsers(users, '研发部').length, 1)
assert.equal(searchDirectoryUsers(users, '产品').length, 1)

// 空关键词返回全部可见者
assert.equal(searchDirectoryUsers(users, '').length, 3)
assert.equal(searchDirectoryUsers(users, '', { allowedUserIds: ['u1'] }).length, 1)

// 上限
assert.equal(searchDirectoryUsers(users, '', null, 2).length, 2)

console.log('rteDirectory ok')
