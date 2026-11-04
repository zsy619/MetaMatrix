/**
 * 通讯录（真人 @）。
 *
 * 数据来源：后端 `GET /directory/users`（需要登录态，返回真实用户）。
 * 权限过滤见 utils/rteDirectory.ts：谁能被提到由文档权限决定。
 *
 * 这里不再保留任何写死的示例通讯录：接口失败就抛错，由调用方给出友好提示。
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

/** 通讯录加载失败时给用户看的提示。 */
export const DIRECTORY_LOAD_ERROR = '通讯录加载失败，请稍后重试'

/** 把后端返回的行整成 DirectoryUser，丢掉不合法或缺字段的项。 */
function normalizeUsers(payload: unknown): DirectoryUser[] {
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : []
  return raw
    .filter((u): u is DirectoryUser => !!u && typeof u === 'object')
    .filter((u) => typeof u.id === 'string' && u.id !== '' && typeof u.name === 'string' && u.name !== '')
}

/**
 * 拉取通讯录。
 *
 * @param opts.q      关键词，模糊匹配用户名 / 昵称 / 邮箱
 * @param opts.limit  每页条数，后端默认 50、上限 200
 * @param opts.offset 偏移量，用于分页
 *
 * 接口不可用时抛错（提示语固定为 DIRECTORY_LOAD_ERROR），不再回退到示例数据。
 */
export async function listDirectoryUsers(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Promise<DirectoryUser[]> {
  const limit = opts?.limit ?? 50
  const query = new URLSearchParams()
  if (opts?.q) query.set('q', opts.q)
  query.set('limit', String(limit))
  if (opts?.offset != null) query.set('offset', String(opts.offset))
  try {
    const res = await apiRequestResult<DirectoryUser[]>(`/directory/users?${query.toString()}`, {
      cache: 'no-store',
      retry: 0,
    })
    return normalizeUsers(res.data)
  } catch {
    throw new Error(DIRECTORY_LOAD_ERROR)
  }
}
