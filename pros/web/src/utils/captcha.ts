/**
 * 图形验证码的纯逻辑部分。
 * 服务端才是最终裁判：这里只做最轻的整理和空值判断，
 * 绝不放行没有填写的验证码。
 */

/**
 * 验证码位数。必须和服务端 internal/service/captcha.go 的 captchaLength 一致，
 * 前端要按它渲染输入格子。
 */
export const CAPTCHA_LENGTH = 6

/**
 * 允许输入的字符集，必须和服务端 captchaAlphabet 完全一致：
 * 大写字母 + 数字，去掉容易混淆的 I、O、0、1。
 *
 * 为什么前端也要按这个集合过滤：
 * 用户看图时容易把 "O" 认成 "0"、把 "1" 认成 "I"。这些字符服务端根本不会
 * 生成，放进输入框只可能得到"答案错误"，白白浪费一次重试机会。过滤掉以后，
 * 字符根本进不去，格子留空会提示用户"没填满"，促使他重新看图。
 */
const ALLOWED_CHARS = /[A-HJ-NP-Z2-9]/

/**
 * 把用户输入整理成规范答案：去空白、转大写、只保留合法字符、截断到固定位数。
 *
 * 服务端比对时也会转大写，所以用户用小写键盘敲同样能通过。
 */
export function normalizeCaptchaCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .split('')
    .filter((ch) => ALLOWED_CHARS.test(ch))
    .join('')
    .slice(0, CAPTCHA_LENGTH)
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
