import { describe, expect, it } from 'vitest'
import {
  canApplySuggestionDecision,
  canEnableSuggestionMode,
  conflictOutcomeKeepsSuggestionMarks,
  reviewWritesAllowed,
  shouldTrackAsSuggestion,
} from './collabReviewPolicy'

const marked = '<p>原文<span data-suggestion="insert">建议</span></p>'

describe('collabReviewPolicy C2', () => {
  it('浏览者只读：即使 canWrite 被误标也不能开建议或落写', () => {
    expect(reviewWritesAllowed({ canWrite: false, role: 'viewer' })).toBe(false)
    expect(reviewWritesAllowed({ canWrite: true, role: 'viewer' })).toBe(false)
    expect(canEnableSuggestionMode({ canWrite: true, role: 'viewer' })).toBe(false)
    expect(canApplySuggestionDecision({ canWrite: true, role: 'viewer' })).toBe(false)
    expect(shouldTrackAsSuggestion({ canWrite: true, role: 'viewer', suggestionMode: true })).toBe(false)
  })

  it('不可编辑时建议模式不能跟踪，也不能接受修订', () => {
    expect(canEnableSuggestionMode({ canWrite: true, role: 'editor', editable: false })).toBe(false)
    expect(shouldTrackAsSuggestion({ canWrite: true, role: 'editor', editable: false, suggestionMode: true })).toBe(false)
    expect(canApplySuggestionDecision({ canWrite: true, role: 'editor', editable: false })).toBe(false)
  })

  it('有写权限的编辑者可以开启建议，建议不绕过 canWrite', () => {
    expect(canEnableSuggestionMode({ canWrite: true, role: 'editor' })).toBe(true)
    expect(shouldTrackAsSuggestion({ canWrite: true, role: 'editor', suggestionMode: true })).toBe(true)
    expect(shouldTrackAsSuggestion({ canWrite: false, role: 'editor', suggestionMode: true })).toBe(false)
    expect(canApplySuggestionDecision({ canWrite: false, role: 'editor' })).toBe(false)
    expect(canApplySuggestionDecision({ canWrite: true, role: 'editor' })).toBe(true)
  })

  it('冲突选择任一边或合并时都不丢审阅标记', () => {
    const versions = {
      mineHtml: marked,
      theirsHtml: '<p>远端<span data-suggestion="delete">旧</span></p>',
    }
    expect(conflictOutcomeKeepsSuggestionMarks('mine', versions)).toBe(true)
    expect(conflictOutcomeKeepsSuggestionMarks('theirs', versions)).toBe(true)
    expect(conflictOutcomeKeepsSuggestionMarks('merge', versions)).toBe(true)
  })
})
