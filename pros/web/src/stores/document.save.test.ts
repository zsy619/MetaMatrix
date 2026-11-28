// @vitest-environment happy-dom
/**
 * 保存可靠性回归测试。
 *
 * 覆盖三个线上最容易静默丢内容的场景：
 *   1. 保存请求飞行期间继续编辑，响应不能把新编辑误标为已保存；
 *   2. 请求期间切换到另一篇文档，迟到的响应不能污染新文档状态；
 *   3. 409 冲突草稿按「用户 + 文档」持久化，不与其他文档互相覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  createDocument: vi.fn(),
  cloneDocument: vi.fn(),
  listDocuments: vi.fn(async () => []),
  deleteDocument: vi.fn(),
  renameDocument: vi.fn(),
  batchDocuments: vi.fn(),
  listRevisions: vi.fn(async () => []),
  createRevision: vi.fn(),
  restoreDocument: vi.fn(),
  diffRevisions: vi.fn(),
  getAIContext: vi.fn(),
}))

import * as documentsApi from '../api/documents'
import type { DocumentFull } from '../api/documents'
import { ApiError } from '../api/http'
import { cloneTemplate, useDocumentStore } from './document'

const USER_KEY = 'metamatrix:auth:user'
const TOKEN_KEY = 'metamatrix:auth:token'

function loginAs(id: string) {
  localStorage.setItem(USER_KEY, JSON.stringify({ id, email: `${id}@test` }))
  localStorage.setItem(TOKEN_KEY, 'token')
}

function fullDoc(overrides: Partial<DocumentFull> = {}): DocumentFull {
  const now = new Date().toISOString()
  return {
    id: 'doc-1',
    title: '测试文档',
    notes: '',
    templateId: 'swot',
    canvasType: 'swot',
    schemaVersion: 1,
    saveVersion: 3,
    headRevisionId: null,
    createdAt: now,
    updatedAt: now,
    ownerUserId: 'u1',
    currentData: cloneTemplate('swot'),
    ...overrides,
  }
}

describe('保存可靠性', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    loginAs('u1')
  })

  it('飞行期间的新编辑不会被旧响应清掉 dirty', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()

    let resolveUpdate!: (value: DocumentFull) => void
    vi.mocked(documentsApi.updateDocument).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve }),
    )

    const saving = store.save()
    // 请求还没回来，用户又改了一次。
    store.current_data = cloneTemplate('swot')
    store.markDirty()

    resolveUpdate(fullDoc({ saveVersion: 4 }))
    await saving

    expect(store.dirty).toBe(true)
    expect(store.save_version).toBe(4)
    // 提交时使用的版本号必须是请求发出时的 3。
    const [, input] = vi.mocked(documentsApi.updateDocument).mock.calls[0]
    expect((input as { expectedSaveVersion?: number }).expectedSaveVersion).toBe(3)
  })

  it('请求期间切换文档时，迟到的响应会被丢弃', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()

    let resolveUpdate!: (value: DocumentFull) => void
    vi.mocked(documentsApi.updateDocument).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve }),
    )
    vi.mocked(documentsApi.getDocument).mockResolvedValue(
      fullDoc({ id: 'doc-2', saveVersion: 9 }) as never,
    )

    const saving = store.save()
    await store.load('doc-2')

    resolveUpdate(fullDoc({ id: 'doc-1', saveVersion: 4 }))
    await saving

    // 新文档的 id 和版本不能被旧请求覆盖。
    expect(store.document_id).toBe('doc-2')
    expect(store.save_version).toBe(9)
  })

  it('文档已不属于当前账号时（404），保存会新建一份属于自己的副本', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('swot')
    store.document_id = 'doc-of-other-user'
    store.save_version = 3
    store.markDirty()

    vi.mocked(documentsApi.updateDocument).mockRejectedValue(
      new ApiError(404, 'not found', 'not_found'),
    )
    vi.mocked(documentsApi.createDocument).mockResolvedValue(
      fullDoc({ id: 'doc-mine', saveVersion: 1 }) as never,
    )

    await store.save()

    expect(vi.mocked(documentsApi.createDocument)).toHaveBeenCalledTimes(1)
    expect(store.document_id).toBe('doc-mine')
    expect(store.dirty).toBe(false)
  })

  it('409 草稿按用户与文档持久化，不串文档', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()

    vi.mocked(documentsApi.updateDocument).mockRejectedValue(
      new ApiError(409, 'conflict', 'head_conflict'),
    )
    vi.mocked(documentsApi.getDocument).mockResolvedValue(fullDoc({ saveVersion: 7 }) as never)

    await expect(store.save()).rejects.toThrow()

    const key = 'metamatrix:save-conflict:u1:doc-1'
    const raw = localStorage.getItem(key)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string) as { id: string; draft: unknown; savedAt: string }
    expect(parsed.id).toBe('doc-1')
    expect(parsed.draft).toBeTruthy()
    expect(parsed.savedAt).toBeTruthy()
    // 换一篇文档不会读到这份草稿。
    expect(localStorage.getItem('metamatrix:save-conflict:u1:doc-2')).toBeNull()
    // 另一个账号也读不到。
    expect(localStorage.getItem('metamatrix:save-conflict:u2:doc-1')).toBeNull()
  })

  it('409 后恢复本地草稿：用最新版本号重存并清理冲突记录', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()

    // 第一次保存冲突，服务端已到 7。
    vi.mocked(documentsApi.updateDocument).mockRejectedValueOnce(
      new ApiError(409, 'conflict', 'head_conflict'),
    )
    vi.mocked(documentsApi.getDocument).mockResolvedValue(fullDoc({ saveVersion: 7 }) as never)
    await expect(store.save()).rejects.toThrow()

    const key = 'metamatrix:save-conflict:u1:doc-1'
    expect(localStorage.getItem(key)).toBeTruthy()
    expect(store.conflict).toBeTruthy()

    // 用户选择“保留我的修改”：应以服务端最新版本 7 重新提交。
    vi.mocked(documentsApi.updateDocument).mockResolvedValueOnce(
      fullDoc({ saveVersion: 8 }) as never,
    )
    await store.restoreConflictDraft()

    const lastCall = vi.mocked(documentsApi.updateDocument).mock.calls.at(-1)
    expect((lastCall?.[1] as { expectedSaveVersion?: number }).expectedSaveVersion).toBe(7)
    expect(store.dirty).toBe(false)
    expect(store.conflict).toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('本地草稿按用户与文档隔离，切账号读不到上一个账号的内容', () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-a'
    store.markDirty()
    expect(store.persistLocal('swot')).toBe(true)

    expect(localStorage.getItem('metamatrix:doc:u1:doc:doc-a')).toBeTruthy()

    // 切换账号：同名文档不应命中 u1 的缓存。
    loginAs('u2')
    localStorage.removeItem(TOKEN_KEY)
    expect(store.loadLocal('swot')).toBeNull()
  })

  it('未建档草稿落在 template 分区，建档后落在 doc 分区', () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = null
    store.markDirty()
    expect(store.persistLocal('swot')).toBe(true)
    expect(localStorage.getItem('metamatrix:doc:u1:template:swot')).toBeTruthy()

    store.document_id = 'doc-b'
    expect(store.persistLocal('swot')).toBe(true)
    expect(localStorage.getItem('metamatrix:doc:u1:doc:doc-b')).toBeTruthy()
  })

  it('游客内容写入遇到配额异常时保留 dirty，并继续尝试保存元数据', async () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    const store = useDocumentStore()
    // 通过真实模板入口初始化 activeTemplateId，避免测试键依赖画布 JSON 内部 id。
    store.loadFromTemplate('swot')
    store.document_id = null
    store.markDirty()

    const contentKey = 'metamatrix:doc:anon:template:swot'
    const metaKey = 'metamatrix:doc-meta:anon:template:swot'
    const originalSetItem = localStorage.setItem
    // 只让内容键触发配额异常，验证内容失败不会阻断元数据写入。
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === contentKey) throw new DOMException('quota full', 'QuotaExceededError')
      originalSetItem.call(this, key, value)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await store.save()

      expect(store.dirty).toBe(true)
      expect(store.localPersistError).toContain('本地内容保存失败')
      expect(store.localPersistError).toContain('存储空间不足')
      expect(localStorage.getItem(metaKey)).toBeTruthy()
      expect(documentsApi.updateDocument).not.toHaveBeenCalled()
    } finally {
      setItem.mockRestore()
      warn.mockRestore()
    }
  })

  it('元数据写入异常会独立暴露，内容成功也不能把整体结果当成成功', () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    const contentKey = 'metamatrix:doc:u1:doc:doc-1'
    const metaKey = 'metamatrix:doc-meta:u1:doc:doc-1'
    const originalSetItem = localStorage.setItem
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === metaKey) throw new DOMException('denied', 'SecurityError')
      originalSetItem.call(this, key, value)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(store.persistLocal('swot')).toBe(false)
      expect(localStorage.getItem(contentKey)).toBeTruthy()
      expect(store.localPersistError).toContain('本地元数据保存失败')
      expect(store.localPersistError).toContain('浏览器拒绝了存储写入')
    } finally {
      setItem.mockRestore()
      warn.mockRestore()
    }

    // 后续两项都成功时才清除错误，避免一次局部成功掩盖此前的失败。
    expect(store.persistLocal('swot')).toBe(true)
    expect(store.localPersistError).toBeNull()
  })

  it('云端保存成功可以清 dirty，但不会掩盖本地缓存失败', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()
    vi.mocked(documentsApi.updateDocument).mockResolvedValue(fullDoc({ saveVersion: 4 }))

    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota full', 'QuotaExceededError')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await store.save()
      expect(store.dirty).toBe(false)
      expect(store.save_version).toBe(4)
      expect(store.localPersistError).toContain('本地内容保存失败')
    } finally {
      setItem.mockRestore()
      warn.mockRestore()
    }
  })

  it('网络结果未知且文档与编辑序号未变时，再次保存复用 operationId', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()
    vi.mocked(documentsApi.updateDocument)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(fullDoc({ saveVersion: 4 }))

    await expect(store.save()).rejects.toThrow('Failed to fetch')
    const firstInput = vi.mocked(documentsApi.updateDocument).mock.calls[0][1]
    expect(firstInput.operationId).toBeTruthy()

    await store.save()
    const secondInput = vi.mocked(documentsApi.updateDocument).mock.calls[1][1]
    // 两次请求的幂等键和乐观锁版本都必须一致，服务端才能安全去重。
    expect(secondInput.operationId).toBe(firstInput.operationId)
    expect(secondInput.expectedSaveVersion).toBe(firstInput.expectedSaveVersion)
    expect(store.dirty).toBe(false)
  })

  it('收到明确 HTTP 响应后结束旧保存意图，下次使用新的 operationId', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()
    vi.mocked(documentsApi.updateDocument)
      .mockRejectedValueOnce(new ApiError(500, 'server error'))
      .mockResolvedValueOnce(fullDoc({ saveVersion: 4 }))

    await expect(store.save()).rejects.toMatchObject({ status: 500 })
    const firstOperationId = vi.mocked(documentsApi.updateDocument).mock.calls[0][1].operationId
    await store.save()
    const secondOperationId = vi.mocked(documentsApi.updateDocument).mock.calls[1][1].operationId

    expect(firstOperationId).toBeTruthy()
    expect(secondOperationId).toBeTruthy()
    expect(secondOperationId).not.toBe(firstOperationId)
  })

  it('收到另一标签页的更高版本通知后，下次保存先保留草稿并加载云端版本', async () => {
    const store = useDocumentStore()
    store.current_data = cloneTemplate('swot')
    store.document_id = 'doc-1'
    store.save_version = 3
    store.markDirty()
    store.remoteSaveNotice = {
      documentId: 'doc-1',
      saveVersion: 8,
      updatedAt: '2026-11-17T00:00:00.000Z',
      sourceTabId: 'another-tab',
    }
    vi.mocked(documentsApi.getDocument).mockResolvedValue(fullDoc({ saveVersion: 8 }))

    await expect(store.save()).rejects.toThrow('内容已在其他地方更新')

    // 已知版本落后时不发送必然冲突的旧版本 PUT，也不能静默覆盖其他标签页。
    expect(documentsApi.updateDocument).not.toHaveBeenCalled()
    expect(store.save_version).toBe(8)
    expect(store.conflict?.draft).toBeTruthy()
    expect(localStorage.getItem('metamatrix:save-conflict:u1:doc-1')).toBeTruthy()
  })
})
