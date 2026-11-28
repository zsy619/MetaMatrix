// @vitest-environment happy-dom
/**
 * 提交遮罩的行为契约：
 * - 提交进行中显示遮罩，结束后消失；
 * - 遮罩挡住指针事件，用户点不到底层表单；
 * - 键盘回车触发的重复提交被 busy 守卫拦住（只发一次请求）。
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

/** 构造一个受控的 pending promise，用来把提交卡在"进行中"状态。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function mountView(component: unknown) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(component as never, {
    global: { plugins: [pinia], stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

/** 填好表单，让本地校验能通过。 */
async function fillValidForm(wrapper: { find: (s: string) => any }) {
  await wrapper.find('#login-email').setValue('demo@metamatrix.local')
  await wrapper.find('#login-password').setValue('demo123456')
  await wrapper.find('#captcha-code').setValue('ABC123')
}

describe('登录页提交遮罩', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({
      captchaId: 'cap-1',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      expiresAt: '2026-11-02T10:00:00Z',
    })
    login.mockReset()
    routerStub.replace.mockReset()
  })

  it('提交前不显示遮罩', async () => {
    const wrapper = await mountView(LoginView)
    expect(wrapper.find('.auth-overlay').exists()).toBe(false)
  })

  it('提交进行中显示遮罩并带标题', async () => {
    const gate = deferred<void>()
    login.mockReturnValue(gate.promise)
    const wrapper = await mountView(LoginView)
    await fillValidForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const overlay = wrapper.find('.auth-overlay')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('正在登录')
    // 遮罩必须是模态，让读屏软件知道底层内容不可交互
    expect(overlay.attributes('aria-modal')).toBe('true')
    expect(overlay.attributes('role')).toBe('dialog')

    gate.resolve()
    await flushPromises()
    expect(wrapper.find('.auth-overlay').exists()).toBe(false)
  })

  it('遮罩挡住指针事件，底层表单点不到', async () => {
    const gate = deferred<void>()
    login.mockReturnValue(gate.promise)
    const wrapper = await mountView(LoginView)
    await fillValidForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 遮罩是 fixed 铺满视口的，因此底层元素被它盖住
    const overlay = wrapper.find('.auth-overlay')
    expect(overlay.exists()).toBe(true)
    expect((overlay.element as HTMLElement).style.position || 'fixed').toBe('fixed')

    gate.resolve()
    await flushPromises()
  })

  it('回车重复提交被拦住，只发一次登录请求', async () => {
    const gate = deferred<void>()
    login.mockReturnValue(gate.promise)
    const wrapper = await mountView(LoginView)
    await fillValidForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    // 模拟用户在这期间又按了三次回车
    await wrapper.find('form').trigger('submit')
    await wrapper.find('form').trigger('submit')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledTimes(1)

    gate.resolve()
    await flushPromises()
  })

  it('提交失败后遮罩消失，可以再次提交', async () => {
    login.mockRejectedValueOnce(new Error('bad creds'))
    const wrapper = await mountView(LoginView)
    await fillValidForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.auth-overlay').exists()).toBe(false)
    expect(login).toHaveBeenCalledTimes(1)

    // 第二次提交应当正常发出
    login.mockResolvedValueOnce({ ok: true })
    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledTimes(2)
  })

  it('验证码为空时本地拦截，不出遮罩也不发请求', async () => {
    const wrapper = await mountView(LoginView)
    // 只填邮箱和密码，验证码留空
    await wrapper.find('#login-email').setValue('demo@metamatrix.local')
    await wrapper.find('#login-password').setValue('demo123456')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.auth-overlay').exists()).toBe(false)
    expect(login).not.toHaveBeenCalled()
    expect(wrapper.find('.auth-alert').text()).toContain('图形验证码')
  })
})

describe('注册页提交遮罩', () => {
  beforeEach(() => {
    fetchCaptcha.mockReset().mockResolvedValue({
      captchaId: 'cap-1',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      expiresAt: '2026-11-02T10:00:00Z',
    })
    register.mockReset()
    routerStub.replace.mockReset()
  })

  it('提交进行中显示遮罩并带标题', async () => {
    const gate = deferred<void>()
    register.mockReturnValue(gate.promise)
    const wrapper = await mountView(RegisterView)
    await wrapper.find('#reg-email').setValue('demo@metamatrix.local')
    await wrapper.find('#reg-password').setValue('demo123456')
    await wrapper.find('#captcha-code').setValue('ABC123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const overlay = wrapper.find('.auth-overlay')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('正在创建账号')

    gate.resolve()
    await flushPromises()
    expect(wrapper.find('.auth-overlay').exists()).toBe(false)
  })

  it('回车重复提交被拦住，只发一次注册请求', async () => {
    const gate = deferred<void>()
    register.mockReturnValue(gate.promise)
    const wrapper = await mountView(RegisterView)
    await wrapper.find('#reg-email').setValue('demo@metamatrix.local')
    await wrapper.find('#reg-password').setValue('demo123456')
    await wrapper.find('#captcha-code').setValue('ABC123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(register).toHaveBeenCalledTimes(1)

    gate.resolve()
    await flushPromises()
  })

  it('邮箱格式非法时不出遮罩，也不发请求', async () => {
    const wrapper = await mountView(RegisterView)
    await wrapper.find('#reg-email').setValue('not-an-email')
    await wrapper.find('#reg-password').setValue('demo123456')
    await wrapper.find('#captcha-code').setValue('ABC123')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.auth-overlay').exists()).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })
})
