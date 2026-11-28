/** 邮件数字验证码的前端逻辑：只留数字、位数判断、错误码识别。 */
import { describe, expect, it } from 'vitest'
import {
  RESET_CODE_LENGTH,
  isResetCodeBlank,
  isResetCodeComplete,
  isResetErrorCode,
  normalizeResetCode,
} from './resetCode.ts'

describe('normalizeResetCode', () => {
  it('只保留数字', () => {
    // 服务端只认纯数字，字母和标点进去也只会换来"验证码不正确"，
    // 不如直接过滤掉，让格子保持空缺，提示用户还没填完。
    expect(normalizeResetCode('4a8b2c9d1e3')).toBe('482913')
    expect(normalizeResetCode(' 482 913 ')).toBe('482913')
    expect(normalizeResetCode('----')).toBe('')
  })

  it('超长输入截断到固定位数', () => {
    expect(normalizeResetCode('1234567890')).toBe('123456')
    expect(normalizeResetCode('1234567890')).toHaveLength(RESET_CODE_LENGTH)
  })

  it('全角数字当成非法字符丢弃', () => {
    // 手机拼音输入法容易打出全角数字，它不是 ASCII 数字，服务端不会认。
    expect(normalizeResetCode('１２３')).toBe('')
  })
})

describe('isResetCodeBlank / isResetCodeComplete', () => {
  it('空值与纯符号都算空', () => {
    expect(isResetCodeBlank('')).toBe(true)
    expect(isResetCodeBlank('abc')).toBe(true)
    expect(isResetCodeBlank('1')).toBe(false)
  })

  it('填满六位才算完整', () => {
    expect(isResetCodeComplete('48291')).toBe(false)
    expect(isResetCodeComplete('482913')).toBe(true)
    expect(isResetCodeComplete('4829137')).toBe(true)
  })
})

describe('isResetErrorCode', () => {
  it('识别重置流程的错误码', () => {
    expect(isResetErrorCode('reset_code_invalid')).toBe(true)
    expect(isResetErrorCode('reset_code_expired')).toBe(true)
    expect(isResetErrorCode('weak_password')).toBe(true)
  })

  it('其它错误码与空值一律不算', () => {
    expect(isResetErrorCode('captcha_invalid')).toBe(false)
    expect(isResetErrorCode('')).toBe(false)
    expect(isResetErrorCode(undefined)).toBe(false)
    expect(isResetErrorCode(null)).toBe(false)
  })
})
