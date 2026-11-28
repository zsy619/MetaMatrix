/** 图形验证码的前端逻辑：答案整理、空值判断、错误码识别。 */
import { describe, expect, it } from 'vitest'
import {
  CAPTCHA_LENGTH,
  isCaptchaBlank,
  isCaptchaErrorCode,
  normalizeCaptchaCode,
} from './captcha.ts'

describe('normalizeCaptchaCode', () => {
  it('去掉首尾空白并转成大写', () => {
    expect(normalizeCaptchaCode('  ab7cd ')).toBe('AB7CD')
    expect(normalizeCaptchaCode('AB7CD')).toBe('AB7CD')
  })

  it('字母和数字都能输入', () => {
    expect(normalizeCaptchaCode('a7b2')).toBe('A7B2')
    expect(normalizeCaptchaCode('234567')).toBe('234567')
    expect(normalizeCaptchaCode('9z8x')).toBe('9Z8X')
  })

  it('容易混淆的字符一律丢弃', () => {
    // 服务端根本不会生成 I、O、0、1，放进输入框只可能得到"答案错误"，
    // 白白浪费一次重试机会。过滤后格子留空，能提示用户"没填满"。
    expect(normalizeCaptchaCode('IO01')).toBe('')
    expect(normalizeCaptchaCode('A1B2C3')).toBe('A1B2C3'.replace(/[IO01]/g, ''))
    expect(normalizeCaptchaCode('OI10')).toBe('')
  })

  it('非字母数字字符一律丢弃', () => {
    expect(normalizeCaptchaCode('A-B_C')).toBe('ABC')
    expect(normalizeCaptchaCode('!@#$')).toBe('')
    expect(normalizeCaptchaCode('A2!3B')).toBe('A23B')
  })

  it('超过位数的输入被截断', () => {
    expect(normalizeCaptchaCode('ABCDEFG')).toBe('ABCDEF')
    expect(CAPTCHA_LENGTH).toBe(6)
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

  it('只有非法字符也算未填写', () => {
    expect(isCaptchaBlank('!@#$')).toBe(true)
    expect(isCaptchaBlank('IO01')).toBe(true)
  })

  it('有内容就不算空', () => {
    expect(isCaptchaBlank('AB7CD')).toBe(false)
    expect(isCaptchaBlank(' ab7cd ')).toBe(false)
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
