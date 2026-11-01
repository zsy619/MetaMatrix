import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '../api/auth'
import type { User } from '../api/auth'
import { getToken, setToken } from '../api/http'
import { friendlyApiMessage } from '../utils/apiMessage'

const USER_KEY = 'metamatrix:auth:user'

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
  }

  async function register(email: string, password: string, displayName?: string) {
    loading.value = true
    error.value = null
    try {
      const res = await authApi.register({ email, password, displayName })
      applySession(res.token, res.user)
      return res.user
    } catch (e: unknown) {
      error.value = friendlyApiMessage(e, '注册失败')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const res = await authApi.login({ email, password })
      applySession(res.token, res.user)
      return res.user
    } catch (e: unknown) {
      error.value = friendlyApiMessage(e, '登录失败')
      throw e
    } finally {
      loading.value = false
    }
  }

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

  async function refreshIfNeeded() {
    const raw = token.value
    if (!raw) return
    const exp = tokenExpiryMs(raw)
    if (exp == null) return
    const left = exp - Date.now()
    if (left <= 0) {
      clearSession()
      return
    }
    if (left > 24 * 60 * 60 * 1000) return
    const res = await authApi.refresh()
    applySession(res.token, res.user)
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
    } catch {
      clearSession()
      return null
    } finally {
      loading.value = false
    }
  }

  function logout() {
    clearSession()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('metamatrix:auth:logout', () => clearSession())
  }

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    register,
    login,
    fetchMe,
    logout,
  }
})
