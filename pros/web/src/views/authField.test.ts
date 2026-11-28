// @vitest-environment happy-dom
/**
 * 登录页 / 注册页输入框的图标与"显示密码"契约：
 * - 邮箱、密码、显示名字段各有对应图标；
 * - 密码框右侧有显示/隐藏切换按钮，切换后 input 的 type 跟着变；
 * - 图标是装饰性的（aria-hidden），不会干扰读屏软件。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from './LoginView.vue'
import RegisterView from './RegisterView.vue'

const routerStub = {
  push: vi.fn(),
  replace: vi.fn(),
  currentRoute: { value: { query: {} } },
}

const fetchCaptcha = vi.fn()
const login = vi.fn()
const register = vi.fn()

vi.mock('../api/auth', () => ({
  fetchCaptcha: () => fetchCaptcha(),
  login: (input: unknown) => login(input),
  register: (input: unknown) => register(input),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => routerStub,
}))

async function mountView(component: unknown) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(component as never, {
    global: { plugins: [pinia], stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

describe('登录页输入框图标', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({
      captchaId: 'cap-1',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      expiresAt: '2026-11-02T10:00:00Z',
    })
    routerStub.replace.mockReset()
  })

  it('邮箱框显示信封图标，密码框显示锁图标', async () => {
    const wrapper = await mountView(LoginView)

    const emailIcon = wrapper.find('.auth-field__control').find('.auth-field__icon')
    expect(emailIcon.exists()).toBe(true)
    expect(emailIcon.html()).toContain('<svg')

    // 密码框也有自己的图标，且和邮箱框不是同一个
    const icons = wrapper.findAll('.auth-field__icon')
    expect(icons).toHaveLength(2)
    expect(icons[1].html()).not.toBe(icons[0].html())
  })

  it('图标是装饰性的，读屏软件会跳过', async () => {
    const wrapper = await mountView(LoginView)
    expect(wrapper.find('.auth-field__icon').attributes('aria-hidden')).toBe('true')
  })

  it('密码框右侧有显示/隐藏切换按钮', async () => {
    const wrapper = await mountView(LoginView)
    const toggle = wrapper.find('.auth-field__toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-label')).toBe('显示密码')
  })

  it('点击切换按钮后密码明文显示，再点一次恢复隐藏', async () => {
    const wrapper = await mountView(LoginView)
    const input = wrapper.find('#login-password')

    expect(input.attributes('type')).toBe('password')

    await wrapper.find('.auth-field__toggle').trigger('click')
    expect(wrapper.find('#login-password').attributes('type')).toBe('text')
    expect(wrapper.find('.auth-field__toggle').attributes('aria-label')).toBe('隐藏密码')

    await wrapper.find('.auth-field__toggle').trigger('click')
    expect(wrapper.find('#login-password').attributes('type')).toBe('password')
    expect(wrapper.find('.auth-field__toggle').attributes('aria-label')).toBe('显示密码')
  })

  it('切换按钮不触发表单提交', async () => {
    const wrapper = await mountView(LoginView)
    // 按钮是 type="button"，点它不应该提交表单
    expect(wrapper.find('.auth-field__toggle').attributes('type')).toBe('button')
  })

  it('输入仍能正常双向绑定', async () => {
    const wrapper = await mountView(LoginView)
    await wrapper.find('#login-email').setValue('demo@metamatrix.local')
    expect(
      (wrapper.find('#login-email').element as HTMLInputElement).value,
    ).toBe('demo@metamatrix.local')
  })
})

describe('注册页输入框图标', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({
      captchaId: 'cap-1',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      expiresAt: '2026-11-02T10:00:00Z',
    })
    routerStub.replace.mockReset()
  })

  it('显示名、邮箱、密码三个框各带一个图标', async () => {
    const wrapper = await mountView(RegisterView)
    const icons = wrapper.findAll('.auth-field__icon')
    // 显示名 + 邮箱 + 密码 = 3 个
    expect(icons).toHaveLength(3)
  })

  it('密码框同样支持显示/隐藏切换', async () => {
    const wrapper = await mountView(RegisterView)
    expect(wrapper.find('#reg-password').attributes('type')).toBe('password')

    await wrapper.find('.auth-field__toggle').trigger('click')
    expect(wrapper.find('#reg-password').attributes('type')).toBe('text')
  })

  it('密码强度提示仍然显示', async () => {
    const wrapper = await mountView(RegisterView)
    expect(wrapper.find('.auth-strength').exists()).toBe(true)
    expect(wrapper.find('.auth-strength__text').text()).toBe('至少 6 位')
  })
})
