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

export function register(input: {
  email: string
  password: string
  displayName?: string
}) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  })
}

export function login(input: { email: string; password: string }) {
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
