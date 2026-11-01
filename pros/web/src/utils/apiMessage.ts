import { ApiError } from '../api/http'

const CODE_COPY: Record<string, string> = {
  invalid_email: '请输入有效的邮箱地址。',
  weak_password: '密码至少 6 位。',
  password_too_long: '密码过长。请控制在 72 个字节以内。',
  email_taken: '这个邮箱已经注册，请直接登录。',
  invalid_credentials: '邮箱或密码不正确。',
  unauthorized: '登录已失效，请重新登录。',
  forbidden: '没有权限执行这个操作。',
  not_found: '没有找到对应内容，或它不属于当前账号。',
  conflict: '内容已在其他地方更新。',
  head_conflict: '内容已在其他地方更新。已载入云端最新版本。',
  validation_error: '提交的内容不符合要求，请检查后重试。',
  payload_too_large: '画布内容过大，请精简后再保存。',
  bad_request: '请求无效，请检查后重试。',
}

/** Map API failures to product copy. Raw server text is not shown. */
export function friendlyApiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code && CODE_COPY[error.code]) return CODE_COPY[error.code]
    if (error.status === 401) return CODE_COPY.unauthorized
    if (error.status === 403) return CODE_COPY.forbidden
    if (error.status === 404) return CODE_COPY.not_found
    if (error.status === 409) return CODE_COPY.conflict
    if (error.status === 413) return CODE_COPY.payload_too_large
    if (error.status >= 500) return '服务暂时不可用，请稍后重试。'
    return fallback
  }
  if (error instanceof TypeError) return '网络中断，请检查连接后重试。'
  if (error instanceof Error && error.message && !/request failed|failed to fetch/i.test(error.message)) {
    return error.message
  }
  return fallback
}
