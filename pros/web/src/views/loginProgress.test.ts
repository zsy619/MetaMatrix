// @vitest-environment happy-dom
/**
 * 登录页"个性化进度条 + 防重复提交"的行为契约：
 * - 点击登录后按钮内出现确定进度条，并且百分比随提交推进；
 * - 遮罩面板展示同一条进度（百分比 + 阶段文案）；
 * - 连点 / 回车都只发出一次登录请求；
 * - store 层 single-flight：并发调用 login() 只打一次接口。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from './LoginView.vue'
import { useAuthStore } from '../stores/auth'

const routerStub = {
  push: vi.fn(),
  replace: vi.fn(),
  currentRoute: { value: { query: {} } },
}

const fetchCaptcha = vi.fn()
const loginApi = vi.fn()

vi.mock('../api/auth', () => ({
  fetchCaptcha: () => fetchCaptcha(),
  login: (input: unknown) => loginApi(input),
  register: vi.fn(),
  me: vi.fn(),
  refresh: vi.fn(),
  changePassword: vi.fn(),
  requestResetCode: vi.fn(),
  verifyResetCode: vi.fn(),
  confirmResetPassword: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => routerStub,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mountLogin() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(LoginView as never, {
    global: { plugins: [pinia], stubs: { RouterLink: true } },
  })
  await flushPromises()
  await wrapper.find('#login-email').setValue('demo@metamatrix.local')
  await wrapper.find('#login-password').setValue('demo123456')
  await wrapper.find('#captcha-code').setValue('ABC123')
  return wrapper
}

describe('登录进度条与防重复提交', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({
      captchaId: 'cap-1',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      expiresAt: '2026-11-02T10:00:00Z',
    })
    loginApi.mockReset()
    routerStub.replace.mockReset()
  })

  it('提交后按钮内出现确定进度条，并随等待推进', async () => {
    const gate = deferred<void>()
    loginApi.mockReturnValue(gate.promise)
    const wrapper = await mountLogin()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const bar = wrapper.find('.auth-submit__progress')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('role')).toBe('progressbar')
    const first = Number(bar.attributes('aria-valuenow'))
    expect(first).toBeGreaterThan(0)

    // 等待一小段时间，进度必须继续涨，不能停在一个假死的数值上。
    await new Promise((r) => setTimeout(r, 600))
    await flushPromises()
    const later = Number(wrapper.find('.auth-submit__progress').attributes('aria-valuenow'))
    expect(later).toBeGreaterThan(first)

    gate.resolve()
    await flushPromises()
  })

  it('遮罩面板展示同一进度与阶段文案', async () => {
    const gate = deferred<void>()
    loginApi.mockReturnValue(gate.promise)
    const wrapper = await mountLogin()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const panelBar = wrapper.find('.auth-overlay__progress')
    expect(panelBar.exists()).toBe(true)
    expect(Number(panelBar.attributes('aria-valuenow'))).toBeGreaterThan(0)
    expect(wrapper.find('.auth-overlay').text()).toContain('正在校验图形验证码')

    gate.resolve()
    await flushPromises()
  })

  it('连点登录按钮与回车都只发出一次登录请求', async () => {
    const gate = deferred<void>()
    loginApi.mockReturnValue(gate.promise)
    const wrapper = await mountLogin()

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    // 按钮已禁用（busy 守卫），再点也点不动；回车路径同样被拦住。
    await wrapper.find('.auth-submit').trigger('click')
    await wrapper.find('form').trigger('submit')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginApi).toHaveBeenCalledTimes(1)
    // 提交期间按钮带 aria-busy，读屏软件也会知道正在处理。
    expect(wrapper.find('.auth-submit').attributes('aria-busy')).toBe('true')
    // 输入区在提交期间锁定，避免用户在等待时改动凭证。
    expect(wrapper.find('.auth-fields').attributes('inert')).toBeDefined()

    gate.resolve()
    await flushPromises()
  })

  it('store 层 single-flight：并发登录只打一次接口', async () => {
    const gate = deferred<{ token: string; user: unknown }>()
    loginApi.mockReturnValue(gate.promise)
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()

    const p1 = auth.login('demo@metamatrix.local', 'demo123456')
    const p2 = auth.login('demo@metamatrix.local', 'demo123456')
    expect(loginApi).toHaveBeenCalledTimes(1)

    gate.resolve({
      token: 'test-token',
      user: { id: 'u1', email: 'demo@metamatrix.local', displayName: 'demo', createdAt: '' },
    })
    await Promise.all([p1, p2])
    expect(loginApi).toHaveBeenCalledTimes(1)
  })
})
