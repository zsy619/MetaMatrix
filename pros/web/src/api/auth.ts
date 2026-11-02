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
