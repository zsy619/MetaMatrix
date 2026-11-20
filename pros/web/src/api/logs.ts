import { apiRequest } from './http'

/** 一条活动记录：登录、退出与写操作。 */
export type ActivityLogEntry = {
  id: string
  userId: string
  /** login / logout / operation */
  category: string
  action: string
  /** success / failure */
  status: string
  method: string
  path: string
  detail: string
  ip: string
  userAgent: string
  requestId: string
  createdAt: string
}

export type ActivityLogPage = {
  items: ActivityLogEntry[]
  total: number
  limit: number
  offset: number
}

/** 当前账号的活动日志。 */
export function listActivityLogs(params?: {
  category?: string
  limit?: number
  offset?: number
}) {
  const q = new URLSearchParams()
  if (params?.category) q.set('category', params.category)
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  const query = q.toString()
  return apiRequest<ActivityLogPage>(`/logs${query ? `?${query}` : ''}`, { cache: 'no-store' })
}

/** 退出登录：让服务端把这次退出记进活动日志。 */
export function logoutRemote() {
  return apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' })
}
