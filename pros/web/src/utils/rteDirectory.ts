/**
 * 通讯录筛选与权限钩子。
 *
 * @ 菜单只列出「当前文档可以提到」的人。权限由文档侧的 DirectoryPermission 描述，
 * 这里只做纯函数判断，方便单测，也方便后面换成后端下发的权限。
 */
import { matchesPinyin } from './rtePinyin'

export type DirectoryUser = {
  id: string
  name: string
  role?: string
  department?: string
  email?: string
  avatarUrl?: string
}

/** 文档对通讯录的可见范围。空约束表示不额外限制。 */
export type DirectoryPermission = {
  /** 明确允许提到的用户 id。为空表示不按 id 限制 */
  allowedUserIds?: readonly string[]
  /** 明确禁止提到的用户 id。优先级高于 allowedUserIds */
  deniedUserIds?: readonly string[]
  /** 只有这些部门的人可以被提到。为空表示不限制 */
  allowedDepartments?: readonly string[]
  /** 只有这些角色的人可以被提到。为空表示不限制 */
  allowedRoles?: readonly string[]
}

function listOf(value: readonly string[] | undefined): string[] {
  return Array.isArray(value) ? value.map((v) => String(v ?? '').trim()).filter(Boolean) : []
}

/** 这个人能不能在本篇文档里被 @。 */
export function canMentionUser(user: DirectoryUser, permission?: DirectoryPermission | null): boolean {
  if (!user || !user.id) return false
  const denied = listOf(permission?.deniedUserIds)
  if (denied.includes(user.id)) return false
  const allowed = listOf(permission?.allowedUserIds)
  if (allowed.length && !allowed.includes(user.id)) return false
  const departments = listOf(permission?.allowedDepartments)
  if (departments.length) {
    const dept = String(user.department ?? '').trim()
    if (!dept || !departments.includes(dept)) return false
  }
  const roles = listOf(permission?.allowedRoles)
  if (roles.length) {
    const role = String(user.role ?? '').trim()
    if (!role || !roles.includes(role)) return false
  }
  return true
}

/** 按文档权限过滤通讯录。 */
export function filterDirectoryUsers(
  users: readonly DirectoryUser[],
  permission?: DirectoryPermission | null,
): DirectoryUser[] {
  return (users || []).filter((u) => canMentionUser(u, permission))
}

/**
 * 在通讯录里检索。先按权限过滤，再按关键词（支持拼音首字母），最后截断。
 * 空关键词返回全部可见的人。
 */
export function searchDirectoryUsers(
  users: readonly DirectoryUser[],
  query: string,
  permission?: DirectoryPermission | null,
  limit = 12,
): DirectoryUser[] {
  const permitted = filterDirectoryUsers(users, permission)
  const q = String(query ?? '').trim()
  const matched = !q
    ? permitted
    : permitted.filter((u) =>
        matchesPinyin(
          `${u.id} ${u.name} ${u.role || ''} ${u.department || ''} ${u.email || ''}`,
          q,
        ),
      )
  return matched.slice(0, Math.max(1, limit))
}
