// @vitest-environment happy-dom
/** 认证续期与临时故障回归测试，避免断网时把仍有价值本地会话清掉。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'

vi.mock('../api/auth', () => ({
  me: vi.fn(),
  refresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  changePassword: vi.fn(),
}))

import * as authApi from '../api/auth'
import type { AuthResponse, User } from '../api/auth'
import { ApiError, getToken, setUnauthorizedHandler } from '../api/http'
import { useAuthStore } from './auth'

const TOKEN_KEY = 'metamatrix:auth:token'
const testUser: User = {
  id: 'u1',
  email: 'u1@test',
  displayName: '测试用户',
  createdAt: '2026-01-01T00:00:00.000Z',
}

/** 只构造测试用 JWT payload；签名由服务端验证，前端本地仅解析 exp。 */
function makeToken(expMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expMs / 1000) }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

function authResponse(token: string): AuthResponse {
  return { token, user: testUser }
}

describe('认证刷新可靠性', () => {
  let pinia: Pinia

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(authApi.me).mockReset()
    vi.mocked(authApi.refresh).mockReset()
    pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    disposePinia(pinia)
    setUnauthorizedHandler(null)
    vi.restoreAllMocks()
  })

  it('启动、fetchMe 和页面重新可见共享同一次刷新', async () => {
    const oldToken = makeToken(Date.now() + 60 * 60 * 1000)
    const newToken = makeToken(Date.now() + 48 * 60 * 60 * 1000)
    localStorage.setItem(TOKEN_KEY, oldToken)
    let resolveRefresh!: (value: AuthResponse) => void
    vi.mocked(authApi.refresh).mockImplementation(
      () => new Promise<AuthResponse>((resolve) => { resolveRefresh = resolve }),
    )
    vi.mocked(authApi.me).mockResolvedValue(testUser)

    const store = useAuthStore()
    // store 初始化已启动主动刷新；后续两个入口不得再发第二条刷新请求。
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
    const fetching = store.fetchMe()
    const visibleRefresh = store.refreshIfNeeded()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(authApi.refresh).toHaveBeenCalledTimes(1)

    resolveRefresh(authResponse(newToken))
    await Promise.all([fetching, visibleRefresh])
    expect(authApi.me).toHaveBeenCalledTimes(1)
    expect(store.token).toBe(newToken)

    // 新 token 距到期超过 24 小时，之后再次可见不需要无意义续期。
    document.dispatchEvent(new Event('visibilitychange'))
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['断网', new TypeError('Failed to fetch')],
    ['超时', new DOMException('timeout', 'TimeoutError')],
    ['500', new ApiError(500, 'server error')],
  ])('fetchMe 遇到%s时保留会话', async (_label, failure) => {
    const validToken = makeToken(Date.now() + 48 * 60 * 60 * 1000)
    localStorage.setItem(TOKEN_KEY, validToken)
    vi.mocked(authApi.me).mockRejectedValue(failure)
    const store = useAuthStore()

    await expect(store.fetchMe()).resolves.toBeNull()
    expect(store.token).toBe(validToken)
    expect(getToken()).toBe(validToken)
    expect(authApi.refresh).not.toHaveBeenCalled()
  })

  it('fetchMe 收到明确 401 时清理无效会话', async () => {
    const validToken = makeToken(Date.now() + 48 * 60 * 60 * 1000)
    localStorage.setItem(TOKEN_KEY, validToken)
    vi.mocked(authApi.me).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'invalid_session'),
    )
    const store = useAuthStore()

    await expect(store.fetchMe()).resolves.toBeNull()
    expect(store.token).toBeNull()
    expect(getToken()).toBeNull()
  })

  it.each([
    ['断网', new TypeError('Failed to fetch')],
    ['500', new ApiError(500, 'server error')],
  ])('主动刷新遇到%s时保留原 token', async (_label, failure) => {
    const expiringToken = makeToken(Date.now() + 60 * 60 * 1000)
    localStorage.setItem(TOKEN_KEY, expiringToken)
    vi.mocked(authApi.refresh).mockRejectedValue(failure)
    const store = useAuthStore()

    // 启动路径已经在刷新，fetchMe 复用这次失败结果，但不能误判为无效会话。
    await expect(store.fetchMe()).resolves.toBeNull()
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
    expect(authApi.me).not.toHaveBeenCalled()
    expect(store.token).toBe(expiringToken)
    expect(getToken()).toBe(expiringToken)
  })
})
