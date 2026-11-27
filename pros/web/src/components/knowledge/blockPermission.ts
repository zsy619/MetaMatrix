/** 块级权限的最小规则（C2）。不是飞书级 ACL。浏览者 / 无 canWrite 不能改。 */

export const BLOCK_PERM_INHERIT = ''
export const BLOCK_PERM_EDIT = 'edit'
export const BLOCK_PERM_OWNER = 'owner'
export const BLOCK_PERM_READONLY = 'readonly'

export type BlockPermission = typeof BLOCK_PERM_INHERIT | typeof BLOCK_PERM_EDIT | typeof BLOCK_PERM_OWNER | typeof BLOCK_PERM_READONLY

export const BLOCK_PERMISSION_OPTIONS: { value: BlockPermission; label: string; hint: string }[] = [
  { value: BLOCK_PERM_INHERIT, label: '跟随文档', hint: '有文档编辑权的人可以改这块' },
  { value: BLOCK_PERM_EDIT, label: '可编辑成员', hint: '与跟随文档相同，明确允许编辑者改' },
  { value: BLOCK_PERM_OWNER, label: '仅所有者与管理员', hint: '普通编辑者不能改这块' },
  { value: BLOCK_PERM_READONLY, label: '只读锁定', hint: '任何人不能改正文，需先改权限' },
]

export function normalizeBlockPermission(raw: string | null | undefined): BlockPermission {
  switch (String(raw || '').trim().toLowerCase()) {
    case 'edit':
    case 'editor':
    case 'write':
      return BLOCK_PERM_EDIT
    case 'owner':
    case 'admin':
      return BLOCK_PERM_OWNER
    case 'readonly':
    case 'read':
    case 'view':
      return BLOCK_PERM_READONLY
    default:
      return BLOCK_PERM_INHERIT
  }
}

export function canSetBlockPermission(role: string, canWrite: boolean): boolean {
  if (!canWrite) return false
  const r = String(role || '').toLowerCase()
  return r === 'owner' || r === 'admin'
}

export function canEditBlockContent(permission: string, role: string, canWrite: boolean): boolean {
  if (!canWrite) return false
  const perm = normalizeBlockPermission(permission)
  if (perm === BLOCK_PERM_READONLY) return false
  if (perm === BLOCK_PERM_OWNER) {
    const r = String(role || '').toLowerCase()
    return r === 'owner' || r === 'admin'
  }
  return true
}
