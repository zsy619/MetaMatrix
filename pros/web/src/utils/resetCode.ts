/**
 * 邮件数字验证码的纯逻辑部分。
 *
 * 与图形验证码不同，这个码是服务端通过邮件发过来的，用户是"抄"而不是
 * "读"，所以只需要保留数字。
 */

/**
 * 验证码位数。必须和服务端 internal/service/password_reset.go 的
 * ResetCodeLength 一致。
 */
export const RESET_CODE_LENGTH = 6

/**
 * 整理用户输入：去空白、只保留数字、截断到固定位数。
 *
 * 服务端只接受纯数字，所以前端先过滤一遍，用户输入字母时会得到
 * "还没填满"的提示，而不是提交一个必然失败的答案。
 */
export function normalizeResetCode(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .split('')
    .filter((ch) => ch >= '0' && ch <= '9')
    .join('')
    .slice(0, RESET_CODE_LENGTH)
}

/** 验证码是否为空。空值不允许提交。 */
export function isResetCodeBlank(raw: string): boolean {
  return normalizeResetCode(raw).length === 0
}

/** 验证码是否已经填满。 */
export function isResetCodeComplete(raw: string): boolean {
  return normalizeResetCode(raw).length === RESET_CODE_LENGTH
}

/** 服务端返回的密码重置相关错误码。 */
export const RESET_ERROR_CODES = [
  'reset_code_invalid',
  // 邮箱名下没有任何待验证的验证码（没点过发送、已过期或被新码顶掉）。
  'reset_code_not_found',
  'reset_code_expired',
  'reset_code_used',
  'weak_password',
  'password_too_long',
  'password_unchanged',
] as const

/** 判断一个 API 错误码是否属于密码重置流程。 */
export function isResetErrorCode(code: string | undefined | null): boolean {
  if (!code) return false
  return (RESET_ERROR_CODES as readonly string[]).includes(code)
}
