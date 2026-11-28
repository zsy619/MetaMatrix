import { describe, expect, it } from 'vitest'
import {
  BLOCK_PERM_OWNER,
  BLOCK_PERM_READONLY,
  canEditBlockContent,
  canSetBlockPermission,
  normalizeBlockPermission,
} from './blockPermission'

describe('blockPermission C2', () => {
  it('浏览者和无 canWrite 不能改内容或设置权限', () => {
    expect(canEditBlockContent('', 'viewer', false)).toBe(false)
    expect(canSetBlockPermission('viewer', false)).toBe(false)
    expect(canEditBlockContent(BLOCK_PERM_OWNER, 'editor', true)).toBe(false)
    expect(canSetBlockPermission('editor', true)).toBe(false)
    expect(canEditBlockContent(BLOCK_PERM_READONLY, 'owner', true)).toBe(false)
  })

  it('所有者可以设置权限，并可编辑仅所有者块', () => {
    expect(canSetBlockPermission('owner', true)).toBe(true)
    expect(canSetBlockPermission('admin', true)).toBe(true)
    expect(canEditBlockContent(BLOCK_PERM_OWNER, 'owner', true)).toBe(true)
    expect(normalizeBlockPermission('read')).toBe(BLOCK_PERM_READONLY)
  })
})
