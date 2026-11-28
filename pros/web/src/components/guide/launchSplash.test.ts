import { describe, expect, it } from 'vitest'
import { shouldShowLaunch } from './launchSplash'

describe('shouldShowLaunch', () => {
  it('每次进入都展示开场', () => {
    expect(shouldShowLaunch('', null)).toBe(true)
    expect(shouldShowLaunch('?', null)).toBe(true)
    expect(shouldShowLaunch('?documentId=1', null)).toBe(true)
  })

  it('勾选下次不再展示之后，下次不出现', () => {
    expect(shouldShowLaunch('', '1')).toBe(false)
    expect(shouldShowLaunch('?documentId=1', '1')).toBe(false)
  })

  it('intro=1 仍然可以再看开场', () => {
    expect(shouldShowLaunch('?intro=1', '1')).toBe(true)
    expect(shouldShowLaunch('intro=1', '1')).toBe(true)
  })
})
