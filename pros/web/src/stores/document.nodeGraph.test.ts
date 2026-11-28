// @vitest-environment happy-dom
/**
 * 节点画布不能被模板画布视图载入。
 *
 * 节点画布（canvasType = node-graph）由节点画布视图渲染。模板视图一旦
 * 把它当模板数据载入，节点数据会被写进模板草稿，用户的模板草稿就被冲掉。
 * 这里锁住这个行为：载入节点画布时模板状态一律不动。
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
import { cloneTemplate, useDocumentStore } from './document'

const USER_KEY = 'metamatrix:auth:user'
const TOKEN_KEY = 'metamatrix:auth:token'

function loginAs(id: string) {
  localStorage.setItem(USER_KEY, JSON.stringify({ id, email: id + '@test' }))
  localStorage.setItem(TOKEN_KEY, 'token')
}

function swotDoc(): DocumentFull {
  const now = new Date().toISOString()
  return {
    id: 'doc-1',
    title: '模板文档',
    notes: '',
    templateId: 'swot',
    canvasType: 'swot',
    schemaVersion: 1,
    saveVersion: 1,
    headRevisionId: null,
    createdAt: now,
    updatedAt: now,
    ownerUserId: 'u1',
    currentData: cloneTemplate('swot'),
  }
}

function nodeGraphDoc(): DocumentFull {
  const now = new Date().toISOString()
  return {
    id: 'doc-node',
    title: '节点画布',
    notes: '',
    templateId: 'node-graph',
    canvasType: 'node-graph',
    projectId: 'p-1',
    schemaVersion: 1,
    saveVersion: 1,
    headRevisionId: null,
    createdAt: now,
    updatedAt: now,
    ownerUserId: 'u1',
    currentData: {
      id: 'doc-node',
      type: 'node-graph',
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    } as unknown as DocumentFull['currentData'],
  }
}

describe('模板视图载入节点画布', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    loginAs('u1')
    vi.mocked(documentsApi.getDocument).mockReset()
  })

  it('节点画布不占用模板状态，只交出类型与项目归属', async () => {
    vi.mocked(documentsApi.getDocument).mockResolvedValueOnce(swotDoc())
    const store = useDocumentStore()
    await store.load('doc-1')
    const templateData = store.current_data

    vi.mocked(documentsApi.getDocument).mockResolvedValueOnce(nodeGraphDoc())
    await store.load('doc-node')

    expect(store.loaded_canvas_type).toBe('node-graph')
    expect(store.loaded_project_id).toBe('p-1')
    // 模板状态原封不动：内容、文档 id 都不被节点画布顶掉。
    expect(store.current_data).toBe(templateData)
    expect(store.document_id).toBe('doc-1')
  })

  it('载入普通模板文档时行为不变', async () => {
    vi.mocked(documentsApi.getDocument).mockResolvedValueOnce(swotDoc())
    const store = useDocumentStore()
    await store.load('doc-1')

    expect(store.loaded_canvas_type).toBe('swot')
    expect(store.loaded_project_id).toBeNull()
    expect(store.document_id).toBe('doc-1')
    expect(store.current_data).not.toBeNull()
  })
})
