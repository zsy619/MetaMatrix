// @vitest-environment happy-dom
/**
 * 登录守卫的行为约定：
 * - 需要登录的页面（画布、账户），未登录时一律跳登录页；
 * - 跳转时带上原目标，登录成功后能回到原处；
 * - 公开页面（引导页、登录页、工作台）不受影响。
 */
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAuthGuard } from './index'
import { useAuthStore } from '../stores/auth'

/** 造一个 exp 在未来的 JWT，base64url 编码 payload 即可。 */
function makeToken(expMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expMs / 1000) }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'guide', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/account', name: 'account', component: { template: '<div />' }, meta: { requiresAuth: true } },
      {
        path: '/canvas/:templateId',
        name: 'canvas',
        component: { template: '<div />' },
        meta: { requiresAuth: true },
      },
    ],
  })
  return router
}

describe('登录守卫', () => {
  // 每个用例一个独立的 pinia，守卫显式接收它，
  // 避免测试依赖 pinia 的"当前活跃实例"这种全局状态。
  let instance: Pinia

  beforeEach(() => {
    localStorage.clear()
    instance = createPinia()
    setActivePinia(instance)
  })

  it('未登录访问画布时跳转到登录页，并带上原目标', async () => {
    const router = makeRouter()
    router.beforeEach(createAuthGuard(instance))

    await router.push('/canvas/dual-triangle')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/canvas/dual-triangle')
  })

  it('未登录访问账户页时跳转到登录页', async () => {
    const router = makeRouter()
    router.beforeEach(createAuthGuard(instance))

    await router.push('/account')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/account')
  })

  it('公开页面不拦截', async () => {
    const router = makeRouter()
    router.beforeEach(createAuthGuard(instance))

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('guide')
  })

  it('登录状态有效时正常进入画布', async () => {
    const auth = useAuthStore(instance)
    auth.token = makeToken(Date.now() + 60_000)

    const router = makeRouter()
    router.beforeEach(createAuthGuard(instance))

    await router.push('/canvas/dual-triangle')

    expect(router.currentRoute.value.name).toBe('canvas')
  })

  it('token 已过期时按未登录处理，跳登录页', async () => {
    const auth = useAuthStore(instance)
    auth.token = makeToken(Date.now() - 1000)

    const router = makeRouter()
    router.beforeEach(createAuthGuard(instance))

    await router.push('/canvas/dual-triangle')

    expect(router.currentRoute.value.name).toBe('login')
  })

  it('redirect 保留查询串，登录后能回到带参数的原目标', async () => {
    const router = makeRouter()
    router.beforeEach(createAuthGuard(instance))

    await router.push('/canvas/dual-triangle?documentId=doc-1')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/canvas/dual-triangle?documentId=doc-1')
  })
})
