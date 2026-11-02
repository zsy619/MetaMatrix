/**
 * 通讯录（真人 @）。
 *
 * 来源说明：后端还没有 /directory/users 路由，listDirectoryUsers 会先试接口，
 * 失败时回退到本地示例数据，保证 @ 菜单始终可用。
 * 权限过滤见 utils/rteDirectory.ts：谁能被提到由文档权限决定。
 */
import { apiRequestResult } from './http'

export type DirectoryUser = {
  id: string
  name: string
  role?: string
  department?: string
  email?: string
  avatarUrl?: string
}

/**
 * 本地示例通讯录。没有真实姓名，只有角色式示例，方便离线演示。
 * 后端接上后这段就不用了。
 */
export const DIRECTORY_STUB_USERS: DirectoryUser[] = [
  { id: 'u-product', name: '产品经理', role: '产品', department: '产品部' },
  { id: 'u-dev', name: '开发工程师', role: '研发', department: '研发部' },
  { id: 'u-qa', name: '测试工程师', role: '质量', department: '研发部' },
  { id: 'u-design', name: '设计师', role: '设计', department: '设计部' },
  { id: 'u-ops', name: '运营', role: '运营', department: '运营部' },
  { id: 'u-owner', name: '负责人', role: '负责人', department: '项目管理部' },
  { id: 'u-reviewer', name: '评审人', role: '评审', department: '项目管理部' },
  { id: 'u-hr', name: 'HR', role: '人事', department: '人力资源部' },
]

function stubSearch(q: string, limit: number): DirectoryUser[] {
  const query = q.trim().toLowerCase()
  const list = !query
    ? DIRECTORY_STUB_USERS
    : DIRECTORY_STUB_USERS.filter((u) =>
        `${u.id} ${u.name} ${u.role || ''} ${u.department || ''} ${u.email || ''}`
          .toLowerCase()
          .includes(query),
      )
  return list.slice(0, Math.max(1, limit))
}

/**
 * 拉取通讯录。接口不可用时回退到示例数据，不抛错。
 */
export async function listDirectoryUsers(opts?: { q?: string; limit?: number }): Promise<DirectoryUser[]> {
  const limit = opts?.limit ?? 50
  const q = new URLSearchParams()
  if (opts?.q) q.set('q', opts.q)
  if (opts?.limit != null) q.set('limit', String(opts.limit))
  const qs = q.toString()
  try {
    const res = await apiRequestResult<DirectoryUser[]>(`/directory/users${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
      retry: 0,
    })
    const list = Array.isArray(res.data) ? res.data : []
    return list.filter((u) => !!u && typeof u.id === 'string' && typeof u.name === 'string')
  } catch {
    // 后端未实现该路由时走示例数据
    return stubSearch(opts?.q ?? '', limit)
  }
}
