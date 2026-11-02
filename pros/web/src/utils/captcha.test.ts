/** 图形验证码的前端逻辑：答案整理、空值判断、错误码识别。 */
import { describe, expect, it } from 'vitest'
import {
  isCaptchaBlank,
  isCaptchaErrorCode,
  normalizeCaptchaCode,
} from './captcha.ts'

describe('normalizeCaptchaCode', () => {
  it('去掉首尾空白并转成大写', () => {
    expect(normalizeCaptchaCode('  a1b2 ')).toBe('A1B2')
    expect(normalizeCaptchaCode('AB3D')).toBe('AB3D')
  })

  it('空白输入归一化为空串', () => {
    expect(normalizeCaptchaCode('   ')).toBe('')
  })
})

describe('isCaptchaBlank', () => {
  it('空值和纯空白都算未填写', () => {
    expect(isCaptchaBlank('')).toBe(true)
    expect(isCaptchaBlank('   ')).toBe(true)
    expect(isCaptchaBlank('\t\n')).toBe(true)
  })

  it('有内容就不算空', () => {
    expect(isCaptchaBlank('A1B2')).toBe(false)
    expect(isCaptchaBlank(' a1b2 ')).toBe(false)
  })
})

describe('isCaptchaErrorCode', () => {
  it('识别验证码相关错误码', () => {
    expect(isCaptchaErrorCode('captcha_required')).toBe(true)
    expect(isCaptchaErrorCode('captcha_invalid')).toBe(true)
    expect(isCaptchaErrorCode('captcha_expired')).toBe(true)
  })

  it('其它错误码不算验证码问题', () => {
    expect(isCaptchaErrorCode('invalid_credentials')).toBe(false)
    expect(isCaptchaErrorCode('email_taken')).toBe(false)
    expect(isCaptchaErrorCode(undefined)).toBe(false)
    expect(isCaptchaErrorCode(null)).toBe(false)
    expect(isCaptchaErrorCode('')).toBe(false)
  })
})
