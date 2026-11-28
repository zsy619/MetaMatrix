// @vitest-environment happy-dom
/**
 * 找回密码页的三步流程。
 *
 * 这里刻意不连真实后端，只验证"页面自己的逻辑"：
 * - 三步之间的推进条件（邮箱合法才能发码、验证码填满才能下一步）；
 * - 第二步拿到 sessionToken 之后，第三步用的是令牌而不是验证码；
 * - 限流（429）时用服务端给的秒数驱动倒计时；
 * - 成功后回到登录页并带上成功标记。
 *
 * 服务端侧的行为由 Go 测试覆盖，两边不重复测同一件事。
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import ResetPasswordView from './ResetPasswordView.vue'

// vi.mock 的工厂函数会被提升到 import 之前执行，所以这里的桩必须用
// vi.hoisted 提前创建，否则工厂里拿到的变量还在暂时性死区。
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  requestResetCode: vi.fn(),
  verifyResetCode: vi.fn(),
  confirmResetPassword: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('../api/auth', () => ({
  requestResetCode: mocks.requestResetCode,
  verifyResetCode: mocks.verifyResetCode,
  confirmResetPassword: mocks.confirmResetPassword,
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requestResetCode.mockResolvedValue({
    status: 'ok',
    message: '如果该邮箱已注册，验证码会很快送达。',
    cooldownSeconds: 60,
  })
})

afterEach(() => {
  // 页面里有每秒一次的倒计时定时器，不卸载会一直活着。
  wrapper?.unmount()
  wrapper = undefined
})

/** 按文字找按钮，避免依赖按钮顺序。 */
function buttonByText(w: VueWrapper, text: string) {
  const found = w.findAll('button').find((btn) => btn.text().includes(text))
  if (!found) throw new Error(`没有找到按钮：${text}`)
  return found
}

/**
 * 挂载页面。
 *
 * vue-router 被替换成了桩，RouterLink 也就没人注册了，
 * 这里补一个最简的 a 标签替代，避免控制台刷一堆解析失败的告警。
 */
function mountView() {
  return mount(ResetPasswordView, {
    global: {
      stubs: {
        'router-link': { template: '<a><slot /></a>' },
      },
    },
  })
}

/** 走完第一步：填邮箱并发码。 */
async function goToCodeStep(w: VueWrapper, email = 'user@example.com') {
  await w.find('#reset-email').setValue(email)
  await buttonByText(w, '发送验证码').trigger('click')
  await flushPromises()
}

/** 走完前两步，停在设置新密码这一步。 */
async function goToPasswordStep(w: VueWrapper) {
  mocks.verifyResetCode.mockResolvedValue({ status: 'verified', sessionToken: 'session-abc' })
  await goToCodeStep(w)
  await w.find('#reset-code').setValue('482913')
  await buttonByText(w, '下一步').trigger('click')
  await flushPromises()
}

describe('ResetPasswordView', () => {
  it('邮箱格式不合法时不发请求', async () => {
    wrapper = mountView()
    await wrapper.find('#reset-email').setValue('not-an-email')

    // 主按钮在邮箱不合法时就是禁用的，点它不会有任何反应。
    expect(buttonByText(wrapper, '发送验证码').attributes('disabled')).toBeDefined()

    // 但回车仍然会触发表单提交，这条路必须自己拦住并给出说明。
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mocks.requestResetCode).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入有效的邮箱地址')
  })

  it('发送成功后进入第二步，并显示重发冷却', async () => {
    wrapper = mountView()
    await goToCodeStep(wrapper)

    expect(mocks.requestResetCode).toHaveBeenCalledWith({ email: 'user@example.com' })
    // 第二步的验证码输入框出现，第一步的邮箱框已被替换掉。
    expect(wrapper.find('#reset-code').exists()).toBe(true)
    expect(wrapper.find('#reset-email').exists()).toBe(false)

    const resend = wrapper.find('.reset-code__resend')
    expect(resend.text()).toContain('60s 后可重发')
    expect(resend.attributes('disabled')).toBeDefined()
  })

  it('验证码未填满时不能进入第三步', async () => {
    wrapper = mountView()
    await goToCodeStep(wrapper)

    await wrapper.find('#reset-code').setValue('4829')
    const next = buttonByText(wrapper, '下一步')
    expect(next.attributes('disabled')).toBeDefined()

    await next.trigger('click')
    await flushPromises()
    expect(mocks.verifyResetCode).not.toHaveBeenCalled()
  })

  it('验证码正确后换到令牌，第三步用令牌改密并回到登录页', async () => {
    wrapper = mountView()
    await goToPasswordStep(wrapper)

    expect(mocks.verifyResetCode).toHaveBeenCalledWith({
      email: 'user@example.com',
      code: '482913',
    })
    // 关键点：校验阶段不应该改密码，否则验证码会被白白消耗。
    expect(mocks.confirmResetPassword).not.toHaveBeenCalled()
    expect(wrapper.find('#reset-password').exists()).toBe(true)

    mocks.confirmResetPassword.mockResolvedValue({ status: 'ok' })
    await wrapper.find('#reset-password').setValue('new-password-1')
    await wrapper.find('#reset-password-2').setValue('new-password-1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mocks.confirmResetPassword).toHaveBeenCalledWith({
      sessionToken: 'session-abc',
      newPassword: 'new-password-1',
    })
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'login', query: { reset: 'done' } })
  })

  it('两次密码不一致时不提交', async () => {
    wrapper = mountView()
    await goToPasswordStep(wrapper)

    await wrapper.find('#reset-password').setValue('new-password-1')
    await wrapper.find('#reset-password-2').setValue('new-password-2')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mocks.confirmResetPassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次输入的密码不一致')
  })

  it('从第三步退回第二步时不再重复校验，直接前进', async () => {
    wrapper = mountView()
    await goToPasswordStep(wrapper)

    await buttonByText(wrapper, '上一步').trigger('click')
    await flushPromises()
    expect(wrapper.find('#reset-code').exists()).toBe(true)

    await buttonByText(wrapper, '下一步').trigger('click')
    await flushPromises()

    // 验证码在第一次校验时已经被服务端消费，再校验必然失败，
    // 所以这里必须凭已有令牌直接回到第三步。
    expect(mocks.verifyResetCode).toHaveBeenCalledTimes(1)
    expect(wrapper.find('#reset-password').exists()).toBe(true)
  })

  it('邮箱没有注册时直接给出提示', async () => {
    // 显式模式下服务端用 404 + email_not_registered 告诉前端这个邮箱不存在，
    // 用户不必对着一个永远收不到的验证码空等。
    mocks.requestResetCode.mockRejectedValue(
      new ApiError(404, 'no account for this email', 'email_not_registered'),
    )
    wrapper = mountView()
    await wrapper.find('#reset-email').setValue('nobody@example.com')
    await buttonByText(wrapper, '发送验证码').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('这个邮箱还没有注册')
    // 仍然停在填写邮箱这一步，方便用户改成正确的地址。
    expect(wrapper.find('#reset-email').exists()).toBe(true)
  })

  it('被限流时用服务端的秒数驱动倒计时', async () => {
    mocks.requestResetCode.mockRejectedValue(
      new ApiError(429, 'rate limited', 'rate_limited', { retryAfterSeconds: 42 }),
    )
    wrapper = mountView()
    await wrapper.find('#reset-email').setValue('user@example.com')
    await buttonByText(wrapper, '发送验证码').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('请 42 秒后再试')
    // 仍然停在第一步，用户可以改邮箱或等冷却结束。
    expect(wrapper.find('#reset-email').exists()).toBe(true)
  })

  it('发信服务不可用时给出明确提示', async () => {
    mocks.requestResetCode.mockRejectedValue(
      new ApiError(503, 'mail unavailable', 'mail_unavailable'),
    )
    wrapper = mountView()
    await wrapper.find('#reset-email').setValue('user@example.com')
    await buttonByText(wrapper, '发送验证码').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('邮件服务暂时不可用')
  })
})
