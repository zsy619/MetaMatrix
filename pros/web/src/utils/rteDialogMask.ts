/** 遮罩是否应该关掉弹窗。有未提交的输入，或系统文件选择器还开着，就不关。 */

export function maskShouldDismiss(state: { dirty: boolean; filePickActive: boolean }): boolean {
  if (state.filePickActive) return false
  if (state.dirty) return false
  return true
}

export function dialogHasDraft(parts: {
  selectedCount: number
  externalText: string
  addingCategory: boolean
  categoryName: string
}): boolean {
  if (parts.selectedCount > 0) return true
  if (parts.externalText.trim()) return true
  if (parts.addingCategory) return true
  if (parts.categoryName.trim()) return true
  return false
}
