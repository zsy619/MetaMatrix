import { apiRequest } from './http'

export type User = {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export type AuthResponse = {
  token: string
  user: User
}

/** A server issued image challenge. The image is a data URI. */
export type CaptchaChallenge = {
  captchaId: string
  image: string
  expiresAt: string
  /**
   * Only present when the API runs with CAPTCHA_DEBUG=true, which is a
   * local/CI automation aid. It never appears in production.
   */
  debugAnswer?: string
}

export function fetchCaptcha(): Promise<CaptchaChallenge> {
  return apiRequest<CaptchaChallenge>('/auth/captcha', { auth: false })
}

export function register(input: {
  email: string
  password: string
  displayName?: string
  captchaId: string
  captchaCode: string
}) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  })
}

export function login(input: {
  email: string
  password: string
  captchaId: string
  captchaCode: string
}) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
  })
}

export function me() {
  return apiRequest<User>('/auth/me')
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiRequest<{ status: string }>('/auth/password', {
    method: 'POST',
    body: input,
  })
}

export function refresh() {
  return apiRequest<AuthResponse & { expiresAt?: string }>('/auth/refresh', {
    method: 'POST',
    body: {},
  })
}

/**
 * 密码重置：请求邮件验证码的响应。
 *
 * 服务端在「统一响应」模式下（默认），无论邮箱是否注册，返回内容完全一致，
 * 这样这个接口无法被用来探测哪些邮箱有账号。accountExists 字段只有在显式
 * 模式（RESET_UNKNOWN_EMAIL_MODE=explicit）下才可能出现。
 */
export type ResetRequestResponse = {
  status: string
  message: string
  /** 服务端强制的重发冷却秒数，前端据此禁用重发按钮。 */
  cooldownSeconds: number
  /**
   * 仅当服务端使用日志通道且开启了 RESET_REVEAL_CODE 时出现，
   * 用于本地开发时免去查日志的麻烦。生产环境永远不会有。
   */
  debugCode?: string
}

/** 请求发送密码重置验证码。 */
export function requestResetCode(input: { email: string }) {
  return apiRequest<ResetRequestResponse>('/auth/password-reset/request', {
    method: 'POST',
    body: input,
    auth: false,
  })
}

/**
 * 校验邮件验证码的结果。
 *
 * 校验通过后服务端不回传验证码本身，而是发一张一次性的改密令牌（sessionToken）。
 * 这样做有两个原因：
 * 1. 6 位数字验证码只有 100 万种组合，容不下任何"改密码"这种高价值写操作，
 *    必须升级成 256 位随机令牌再执行；
 * 2. 用户在校验通过之后才去填新密码，如果新密码不合规（太短/和旧密码一样），
 *    可以直接重填，不需要重新收一次验证码。
 */
export type ResetVerifyResponse = {
  status: string
  sessionToken: string
}

/** 校验邮件里的 6 位数字验证码，换取一次性的改密令牌。 */
export function verifyResetCode(input: { email: string; code: string }) {
  return apiRequest<ResetVerifyResponse>('/auth/password-reset/verify', {
    method: 'POST',
    body: input,
    auth: false,
  })
}

/** 用改密令牌保存新密码。令牌一次性，保存成功后立即失效。 */
export function confirmResetPassword(input: {
  sessionToken: string
  newPassword: string
}) {
  return apiRequest<{ status: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: input,
    auth: false,
  })
}
