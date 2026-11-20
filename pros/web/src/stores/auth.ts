import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'
import * as authApi from '../api/auth'
import * as logsApi from '../api/logs'
import type { User } from '../api/auth'
import {
  ApiError,
  getToken,
  setToken,
  setUnauthorizedHandler,
  type UnauthorizedRefreshResult,
} from '../api/http'
import { friendlyApiMessage } from '../utils/apiMessage'
import { clearRecentOpens } from '../utils/canvasTransfer'
import { clearMediaThumbs } from '../utils/mediaThumb'
import { clearMediaHydrateBlobs } from '../extensions/mediaHydrate'

const USER_KEY = 'metamatrix:auth:user'

/** The captcha challenge that must accompany a login or register request. */
export type CaptchaInput = {
  captchaId: string
  captchaCode: string
}

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<User | null>(readCachedUser())
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value))

  /**
   * 解析 JWT 里的 exp 字段（秒级时间戳），返回毫秒时间戳。
   * 解析不出来返回 null，表示"看不懂这个 token 的有效期"。
   */
  function tokenExpiryMs(raw: string): number | null {
    const part = raw.split('.')[1]
    if (!part) return null
    try {
      const padded = part.replace(/-/g, '+').replace(/_/g, '/')
      const json = JSON.parse(atob(padded)) as { exp?: number }
      return typeof json.exp === 'number' ? json.exp * 1000 : null
    } catch {
      return null
    }
  }

  /**
   * 会话是否真的能用（不只是"本地存着 token"）。
   *
   * 路由守卫需要一个比 isAuthenticated 更严格的判断：
   * token 可能已经过期（写在本机但服务端不认），也可能压根解析不出 exp。
   * 这两种情况都不该放行到需要登录的页面，否则用户会在画布里看到
   * 一堆 401 报错却不知道自己该去登录。
   *
   * 这里只做本地判断，不发网络请求 —— 守卫是同步的，异步校验会让
   * 每次跳转都多一个 RTT。真正的权威校验交给接口的 401 响应。
   */
  function hasUsableSession(): boolean {
    const raw = token.value
    if (!raw) return false
    const exp = tokenExpiryMs(raw)
    // 解析不出 exp：保守放行，交给服务端判断，总比把用户挡在门外好。
    if (exp == null) return true
    return exp > Date.now()
  }

  function applySession(t: string, u: User) {
    token.value = t
    user.value = u
    setToken(t)
    writeCachedUser(u)
    error.value = null
  }

  function clearSession() {
    token.value = null
    user.value = null
    setToken(null)
    writeCachedUser(null)
    clearRecentOpens()
    // 素材预览带登录令牌，登出后必须回收 blob 缓存并中断在途请求
    clearMediaThumbs()
    clearMediaHydrateBlobs()
  }

  async function register(email: string, password: string, displayName?: string, captcha?: CaptchaInput) {
    loading.value = true
    error.value = null
    try {
      const res = await authApi.register({
        email,
        password,
        displayName,
        captchaId: captcha?.captchaId ?? '',
        captchaCode: captcha?.captchaCode ?? '',
      })
      applySession(res.token, res.user)
      return res.user
    } catch (e: unknown) {
      error.value = friendlyApiMessage(e, '注册失败')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string, captcha?: CaptchaInput) {
    loading.value = true
    error.value = null
    try {
      const res = await authApi.login({
        email,
        password,
        captchaId: captcha?.captchaId ?? '',
        captchaCode: captcha?.captchaCode ?? '',
      })
      applySession(res.token, res.user)
      return res.user
    } catch (e: unknown) {
      error.value = friendlyApiMessage(e, '登录失败')
      throw e
    } finally {
      loading.value = false
    }
  }

  /** 所有主动刷新和 401 刷新共用这条 single-flight，避免启动、可见性和请求同时刷新。 */
  let refreshPromise: Promise<void> | null = null

  async function refreshIfNeeded(force = false): Promise<void> {
    if (refreshPromise) return refreshPromise
    const raw = token.value
    if (!raw) return
    const exp = tokenExpiryMs(raw)
    // 非强制路径遇到无法解析有效期的 token 时保持旧行为，交给服务端权威校验。
    if (exp == null && !force) return
    const left = exp == null ? Number.POSITIVE_INFINITY : exp - Date.now()
    if (left <= 0) {
      // /auth/refresh 仍要求有效 token，过期后再调用只会失败，因此本地确认过期就直接清理。
      clearSession()
      return
    }
    // 在到期前 24 小时主动续期，避免用户长期开着页面后所有写请求突然 401。
    if (!force && left > 24 * 60 * 60 * 1000) return

    const tokenAtStart = raw
    const task = (async () => {
      try {
        const res = await authApi.refresh()
        // 刷新飞行期间用户可能已登出或登录另一个账号，旧响应不得覆盖新会话。
        if (token.value !== tokenAtStart) return
        applySession(res.token, res.user)
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.code === 'invalid_session') &&
          token.value === tokenAtStart
        ) {
          clearSession()
        }
        throw error
      }
    })()
    refreshPromise = task
    try {
      await task
    } finally {
      if (refreshPromise === task) refreshPromise = null
    }
  }

  /** 给 HTTP 的 401 重放钩子；暂时性故障必须保留 token，让用户联网后继续工作。 */
  async function refreshAfterUnauthorized(): Promise<UnauthorizedRefreshResult> {
    if (!token.value) return 'invalid'
    try {
      await refreshIfNeeded(true)
      return token.value ? 'refreshed' : 'invalid'
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === 'invalid_session')) {
        clearSession()
        return 'invalid'
      }
      return 'unavailable'
    }
  }

  function isInvalidSessionError(error: unknown): boolean {
    return (
      error instanceof ApiError &&
      (error.status === 401 || error.code === 'invalid_session')
    )
  }

  async function fetchMe() {
    if (!token.value) {
      clearSession()
      return null
    }
    loading.value = true
    try {
      await refreshIfNeeded()
      if (!token.value) return null
      const u = await authApi.me()
      user.value = u
      writeCachedUser(u)
      return u
    } catch (error) {
      // 断网、超时、500 只表示本次校验失败，不等于服务端宣布会话无效。
      if (isInvalidSessionError(error)) clearSession()
      return null
    } finally {
      loading.value = false
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    loading.value = true
    error.value = null
    try {
      await authApi.changePassword({ currentPassword, newPassword })
    } catch (e: unknown) {
      error.value = friendlyApiMessage(e, '修改密码失败')
      throw e
    } finally {
      loading.value = false
    }
  }

  function logout() {
    // 先告诉服务端「我退出了」，让活动日志记下这一条；失败也不阻塞本地清理。
    if (token.value) {
      void logsApi.logoutRemote().catch(() => undefined)
    }
    clearSession()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return
    // 后台标签页可能休眠数小时，重新可见时先按有效期续期；失败只保留会话等待下次。
    void refreshIfNeeded().catch(() => undefined)
  }

  function onGlobalLogout(): void {
    clearSession()
  }

  const unregisterUnauthorizedHandler = setUnauthorizedHandler(refreshAfterUnauthorized)
  if (typeof window !== 'undefined') {
    window.addEventListener('metamatrix:auth:logout', onGlobalLogout)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  // 应用启动也可能直接命中临近过期的缓存 token，与页面可见路径共用 single-flight。
  if (token.value) void refreshIfNeeded().catch(() => undefined)

  onScopeDispose(() => {
    unregisterUnauthorizedHandler()
    if (typeof window !== 'undefined') {
      window.removeEventListener('metamatrix:auth:logout', onGlobalLogout)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    hasUsableSession,
    register,
    login,
    refreshIfNeeded,
    fetchMe,
    changePassword,
    logout,
  }
})
