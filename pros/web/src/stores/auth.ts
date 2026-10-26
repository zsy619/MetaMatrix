import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '../api/auth'
import type { User } from '../api/auth'
import { getToken, setToken } from '../api/http'

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
      error.value = e instanceof Error ? e.message : '注册失败'
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
      error.value = e instanceof Error ? e.message : '登录失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) {
      clearSession()
      return null
    }
    loading.value = true
    try {
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
