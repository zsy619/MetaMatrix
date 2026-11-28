// @vitest-environment happy-dom
/**
 * HTTP 可靠性边界测试。
 * 重点固定“重试载荷不变”和“临时故障不登出”两条约定，避免上层保存逻辑被底层重试破坏。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, apiRequestBlob, getToken, setToken, setUnauthorizedHandler } from './http'
import { restoreBackup, type BackupBundle } from './documents'

function jsonResponse(status: number, body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HTTP 重试与会话失效边界', () => {
  beforeEach(() => {
    localStorage.clear()
    setUnauthorizedHandler(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    setUnauthorizedHandler(null)
    vi.unstubAllGlobals()
  })

  it('自动重试复用首次序列化的 body 和 operationId', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200))
    const body = { operationId: 'operation-1', nested: { value: 1 } }

    const request = apiRequest('/documents/doc-1', {
      method: 'PUT',
      body,
      retry: 1,
    })
    // 模拟第一次请求飞行期间响应式数据继续变化；重试仍必须发送原快照。
    body.nested.value = 2
    await request

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const bodies = fetchMock.mock.calls.map(([, init]) => init?.body)
    expect(bodies[0]).toBe('{"operationId":"operation-1","nested":{"value":1}}')
    expect(bodies[1]).toBe(bodies[0])
    expect(bodies.map((value) => JSON.parse(String(value)).operationId)).toEqual([
      'operation-1',
      'operation-1',
    ])
  })

  it('备份恢复自动重试复用 importBatchId 和完全相同的请求体', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { imported: 0, skipped: 0 }))
    const bundle: BackupBundle = {
      version: 1,
      exportedAt: '2026-11-17T00:00:00Z',
      count: 0,
      truncated: false,
      documents: [],
    }

    await restoreBackup(bundle, 'import-batch-1')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const bodies = fetchMock.mock.calls.map(([, init]) => String(init?.body))
    expect(bodies[0]).toBe(bodies[1])
    expect(JSON.parse(bodies[0])).toMatchObject({ importBatchId: 'import-batch-1', count: 0 })
  })

  it('401 后最多刷新并重放一次，第二次 401 直接结束且请求体不变', async () => {
    setToken('old-token')
    const fetchMock = vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(401, { message: 'unauthorized', code: 'invalid_session' }),
    )
    const refresh = vi.fn(async () => {
      setToken('new-token')
      return 'refreshed' as const
    })
    setUnauthorizedHandler(refresh)

    await expect(
      apiRequest('/documents/doc-1', {
        method: 'PUT',
        body: { operationId: 'operation-replay', value: 1 },
      }),
    ).rejects.toMatchObject({ status: 401 })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.body).toBe(fetchMock.mock.calls[1][1]?.body)
    // 第二次明确 401 才使会话失效，不能无限刷新重放。
    expect(getToken()).toBeNull()
  })

  it('刷新接口自身的 401 不再调用刷新处理器', async () => {
    setToken('expired-token')
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { message: 'unauthorized', code: 'invalid_session' }),
    )
    const refresh = vi.fn(async () => 'refreshed' as const)
    setUnauthorizedHandler(refresh)

    await expect(apiRequest('/auth/refresh', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(getToken()).toBeNull()
  })

  it('刷新遇到临时故障时保留 token，并抛出原请求错误', async () => {
    setToken('still-usable-token')
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { message: 'unauthorized' }),
    )
    const refresh = vi.fn(async () => 'unavailable' as const)
    setUnauthorizedHandler(refresh)

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getToken()).toBe('still-usable-token')
  })

  it('网络错误不清除会话', async () => {
    setToken('offline-token')
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(apiRequest('/auth/me', { retry: 0 })).rejects.toThrow('Failed to fetch')
    expect(getToken()).toBe('offline-token')
  })

  it('明确 500 响应也不清除会话', async () => {
    setToken('server-error-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { message: 'server error' }))

    await expect(apiRequest('/auth/me', { retry: 0 })).rejects.toMatchObject({ status: 500 })
    expect(getToken()).toBe('server-error-token')
  })

  it('备份下载直接返回 Blob，不经过 JSON 反序列化和二次序列化', async () => {
    const raw = '{"version":1,"documents":[]}'
    vi.mocked(fetch).mockResolvedValue(
      new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const result = await apiRequestBlob('/documents/backup', { retry: 0 })
    expect(result.data).toBeInstanceOf(Blob)
    expect(await result.data.text()).toBe(raw)
    expect(result.status).toBe(200)
  })

  it('Blob 下载的非成功响应仍按统一 JSON 错误契约处理', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { message: 'batch conflict', code: 'backup_import_conflict' }),
    )

    await expect(apiRequestBlob('/documents/backup', { retry: 0 })).rejects.toMatchObject({
      status: 409,
      code: 'backup_import_conflict',
      message: 'batch conflict',
    })
  })
})
