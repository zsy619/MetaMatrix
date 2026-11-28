import { isCollabWritable } from './collabOfflineQueue'
import { htmlHasSuggestionMarks, resolveConflictHtml, type SaveConflictChoice, type SaveConflictVersions } from '../saveConflict'

/**
 * 协同 × 审阅建议的最小共存规则（路线图 C2）。
 *
 * - 浏览者只读仍然有效：没有写权限就不能改正文，也不能开建议模式。
 * - 建议模式不绕过 canWrite：接受 / 拒绝修订也是写操作。
 * - 保存冲突选择版本或合并时，不得清洗 data-suggestion 审阅标记。
 * - 块级 ACL 若只预留了 permission 字段，这里不做完整 ACL UI。
 */
export type ReviewCollabContext = {
  canWrite?: boolean
  role?: string
  editable?: boolean
  suggestionMode?: boolean
}

export function reviewWritesAllowed(ctx: ReviewCollabContext): boolean {
  if (ctx.editable === false) return false
  return isCollabWritable({ canWrite: ctx.canWrite, role: ctx.role })
}

export function canEnableSuggestionMode(ctx: ReviewCollabContext): boolean {
  return reviewWritesAllowed(ctx)
}

export function canApplySuggestionDecision(ctx: ReviewCollabContext): boolean {
  return reviewWritesAllowed(ctx)
}

/** 只有在可写且已开启建议模式时，才把编辑记成修订。 */
export function shouldTrackAsSuggestion(ctx: ReviewCollabContext): boolean {
  return Boolean(ctx.suggestionMode) && reviewWritesAllowed(ctx)
}

/** 冲突解决后的 HTML：原样选择或合并，绝不调用接受/拒绝清洗。 */
export function conflictHtmlPreservingSuggestions(
  choice: SaveConflictChoice,
  versions: SaveConflictVersions,
): string {
  return resolveConflictHtml(choice, versions)
}

export function conflictOutcomeKeepsSuggestionMarks(
  choice: SaveConflictChoice,
  versions: SaveConflictVersions,
): boolean {
  const before =
    htmlHasSuggestionMarks(versions.mineHtml) || htmlHasSuggestionMarks(versions.theirsHtml)
  if (!before) return true
  return htmlHasSuggestionMarks(conflictHtmlPreservingSuggestions(choice, versions))
}
