// @vitest-environment happy-dom
/**
 * 登录页 / 注册页的图形验证码契约：
 * 页面挂载时取图、提交时带上 captchaId 与答案、答案错误时提示并换图。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from './LoginView.vue'
import RegisterView from './RegisterView.vue'
import { ApiError } from '../api/http'

const routerStub = {
  push: vi.fn(),
  replace: vi.fn(),
  currentRoute: { value: { query: {} } },
}

const challenge = {
  captchaId: 'cap-1',
  image: 'data:image/png;base64,iVBORw0KGgo=',
  expiresAt: '2026-11-02T10:00:00Z',
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

describe('登录页图形验证码', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({ ...challenge })
    login.mockReset().mockResolvedValue({ token: 't', user: { id: '1', email: 'a@b.co', displayName: 'a', createdAt: '' } })
    register.mockReset().mockResolvedValue({ token: 't', user: { id: '1', email: 'a@b.co', displayName: 'a', createdAt: '' } })
    routerStub.replace.mockReset()
  })

  it('挂载后自动取一张验证码并渲染图片', async () => {
    const wrapper = await mountView(LoginView)
    expect(fetchCaptcha).toHaveBeenCalledTimes(1)
    const img = wrapper.find('img[alt="图形验证码，点击刷新"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(challenge.image)
  })

  it('提交时带上 captchaId 和答案', async () => {
    const wrapper = await mountView(LoginView)
    await wrapper.find('#login-email').setValue('demo@metamatrix.local')
    await wrapper.find('#login-password').setValue('demo123456')
    await wrapper.find('#captcha-code').setValue('ab3d')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledTimes(1)
    expect(login.mock.calls[0][0]).toMatchObject({
      email: 'demo@metamatrix.local',
      password: 'demo123456',
      captchaId: 'cap-1',
      captchaCode: 'AB3D',
    })
  })

  it('验证码为空时不提交请求', async () => {
    const wrapper = await mountView(LoginView)
    await wrapper.find('#login-email').setValue('demo@metamatrix.local')
    await wrapper.find('#login-password').setValue('demo123456')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(login).not.toHaveBeenCalled()
    expect(wrapper.find('.auth-alert').text()).toContain('请输入图形验证码')
  })

  it('服务端判定验证码错误时提示并自动换图', async () => {
    login.mockRejectedValue(new ApiError(400, 'captcha answer does not match', 'captcha_invalid'))
    const wrapper = await mountView(LoginView)
    await wrapper.find('#login-email').setValue('demo@metamatrix.local')
    await wrapper.find('#login-password').setValue('demo123456')
    await wrapper.find('#captcha-code').setValue('ZZZZ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.auth-alert').text()).toContain('图形验证码不正确')
    // 换图后答案被清空，图片重新取过一次。
    expect(fetchCaptcha).toHaveBeenCalledTimes(2)
    expect((wrapper.find('#captcha-code').element as HTMLInputElement).value).toBe('')
  })

  it('点击图片可以刷新验证码', async () => {
    const wrapper = await mountView(LoginView)
    await wrapper.find('.captcha__image').trigger('click')
    await flushPromises()
    expect(fetchCaptcha).toHaveBeenCalledTimes(2)
  })

  it('提示里显示这张验证码还剩多少秒', async () => {
    fetchCaptcha.mockResolvedValue({
      ...challenge,
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
    })
    const wrapper = await mountView(LoginView)
    expect(wrapper.find('#captcha-hint').text()).toMatch(/秒后过期/)
  })
})

describe('注册页图形验证码', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({ ...challenge })
    login.mockReset()
    register.mockReset().mockResolvedValue({ token: 't', user: { id: '1', email: 'a@b.co', displayName: 'a', createdAt: '' } })
    routerStub.replace.mockReset()
  })

  it('挂载后渲染验证码并提交时带上答案', async () => {
    const wrapper = await mountView(RegisterView)
    expect(wrapper.find('img[alt="图形验证码，点击刷新"]').exists()).toBe(true)

    await wrapper.find('#reg-email').setValue('new@metamatrix.local')
    await wrapper.find('#reg-password').setValue('demo123456')
    await wrapper.find('#captcha-code').setValue('AB3D')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0]).toMatchObject({
      email: 'new@metamatrix.local',
      captchaId: 'cap-1',
      captchaCode: 'AB3D',
    })
  })

  it('验证码为空时不提交请求', async () => {
    const wrapper = await mountView(RegisterView)
    await wrapper.find('#reg-email').setValue('new@metamatrix.local')
    await wrapper.find('#reg-password').setValue('demo123456')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(register).not.toHaveBeenCalled()
    expect(wrapper.find('.auth-alert').text()).toContain('请输入图形验证码')
  })
})
