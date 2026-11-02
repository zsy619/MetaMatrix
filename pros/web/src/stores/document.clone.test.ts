// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cloneDocument = vi.fn()

vi.mock('../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/documents')>()
  return {
    ...actual,
    cloneDocument: (id: string, input?: { title?: string; notes?: string }) =>
      cloneDocument(id, input),
  }
})

vi.mock('../api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/http')>()
  return { ...actual, getToken: () => 'test-token' }
})

import { useDocumentStore } from './document'

describe('document store · 克隆画布', () => {
  beforeEach(() => {
    cloneDocument.mockReset()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('调用服务端克隆接口并把当前画布切到新 id', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('dual-triangle')
    // 假装已经有云端文档
    store.document_id = 'source-doc-id'
    store.doc_title = '需求评审'

    const cloned = {
      id: 'clone-doc-id',
      ownerUserId: 'owner',
      title: '需求评审（副本）',
      notes: '',
      templateId: 'dual-triangle',
      canvasType: 'dual-triangle',
      schemaVersion: 1,
      headRevisionId: 'clone-head-rev',
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
      currentData: {
        id: 'dual-triangle',
        type: 'dual-triangle',
        schemaVersion: 1,
        panels: [],
      },
    }
    cloneDocument.mockResolvedValue(cloned)

    const newId = await store.cloneCurrent()

    expect(newId).toBe('clone-doc-id')
    expect(cloneDocument).toHaveBeenCalledTimes(1)
    expect(cloneDocument.mock.calls[0][0]).toBe('source-doc-id')
    expect(store.document_id).toBe('clone-doc-id')
    expect(store.head_revision_id).toBe('clone-head-rev')
    expect(store.doc_title).toBe('需求评审（副本）')
    expect(store.dirty).toBe(false)
    expect(store.current_data?.id).toBe('dual-triangle')
  })

  it('克隆后保留面板条目与附件素材', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('dual-triangle')
    store.document_id = 'source-doc-id'

    const currentData = {
      id: 'dual-triangle',
      type: 'dual-triangle',
      schemaVersion: 1,
      blocks: [
        {
          id: 'innovation',
          side: 'human',
          title: '创新',
          subtitle: '',
          keyword: '创造力',
          items: [{ id: 'item_1', text: '保留我' }],
        },
      ],
      attachmentsByPanelId: {
        innovation: [
          {
            id: 'att_1',
            name: 'probe.png',
            kind: 'file' as const,
            mimeType: 'image/png',
            size: 68,
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
      },
    }

    cloneDocument.mockResolvedValue({
      id: 'clone-doc-id',
      ownerUserId: 'owner',
      title: '需求评审（副本）',
      notes: '',
      templateId: 'dual-triangle',
      canvasType: 'dual-triangle',
      schemaVersion: 1,
      headRevisionId: 'clone-head-rev',
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
      currentData,
    })

    await store.cloneCurrent()

    const doc = store.current_data as unknown as {
      blocks?: Array<{ items?: Array<{ text?: string }> }>
      attachmentsByPanelId?: Record<string, Array<{ name?: string; dataUrl?: string }>>
    }
    expect(doc?.blocks?.[0]?.items?.[0]?.text).toBe('保留我')
    expect(doc?.attachmentsByPanelId?.innovation?.[0]?.name).toBe('probe.png')
    expect(doc?.attachmentsByPanelId?.innovation?.[0]?.dataUrl).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    )
  })

  it('未落库时直接抛错，不发请求', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('dual-triangle')
    store.document_id = null
    await expect(store.cloneCurrent()).rejects.toThrow(/尚未同步到云端/)
    expect(cloneDocument).not.toHaveBeenCalled()
  })
})
