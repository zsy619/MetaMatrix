import { describe, expect, it } from 'vitest'
import { shouldShowLaunch } from './launchSplash'

describe('shouldShowLaunch', () => {
  it('第一次进入要播开场', () => {
    expect(shouldShowLaunch('', null)).toBe(true)
    expect(shouldShowLaunch('?', null)).toBe(true)
  })

  it('同一会话看过之后不再挡在引导页前面', () => {
    expect(shouldShowLaunch('', '1')).toBe(false)
    expect(shouldShowLaunch('?documentId=1', '1')).toBe(false)
  })

  it('intro=1 可以再看开场', () => {
    expect(shouldShowLaunch('?intro=1', '1')).toBe(true)
    expect(shouldShowLaunch('intro=1', '1')).toBe(true)
  })
})
