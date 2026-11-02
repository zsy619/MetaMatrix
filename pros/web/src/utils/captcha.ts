/**
 * 图形验证码的纯逻辑部分。
 * 服务端才是最终裁判：这里只做最轻的整理和空值判断，
 * 绝不放行没有填写的验证码。
 */

/** 去掉首尾空白并统一大写，用户输入 " a1b2 " 与 "A1B2" 等价。 */
export function normalizeCaptchaCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/** 验证码是否为空。空值不允许提交。 */
export function isCaptchaBlank(raw: string): boolean {
  return normalizeCaptchaCode(raw).length === 0
}

/** 服务端返回的验证码相关错误码，用于提交失败后自动刷新图片。 */
export const CAPTCHA_ERROR_CODES = ['captcha_required', 'captcha_invalid', 'captcha_expired'] as const

/** 判断一个 API 错误码是否意味着当前验证码已经作废。 */
export function isCaptchaErrorCode(code: string | undefined | null): boolean {
  if (!code) return false
  return (CAPTCHA_ERROR_CODES as readonly string[]).includes(code)
}
