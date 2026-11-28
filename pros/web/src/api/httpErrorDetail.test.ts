// @vitest-environment happy-dom
/**
 * 错误响应的「具体原因」要能透出。
 *
 * 背景（前端 F-04）：服务端 500 的 message 多半是「服务器错误」这种
 * 没有信息量的文案，真正的原因在 `detail` 里
 * （如多字段排序时的 `table name "sv" specified more than once`）。
 * 之前前端只读 `message`，用户只能看到一句没有指向的报错。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from './http'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('错误响应 detail 透出', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('5xx 时把 detail 拼进报错文案，并单独挂在 detail 字段上', async () => {
    const detail = 'ERROR: table name "sv" specified more than once (SQLSTATE 42712)'
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(500, { message: '服务器错误', code: '50001', detail }),
    )

    const err = await apiRequest('/base/tables/t1/query', { method: 'POST', body: {} }).catch(
      (e) => e as ApiError,
    )

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).detail).toBe(detail)
    // 5xx 的文案必须带上具体原因，否则用户无从判断是哪条筛选出的问题。
    expect((err as ApiError).message).toContain(detail)
  })

  it('4xx 不改写文案，只把 detail 挂上（避免把业务提示冲掉）', async () => {
    const detail = 'field name is required'
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(422, { message: '字段名不能为空', code: '42202', detail }),
    )

    const err = await apiRequest('/base/tables/t1/fields', { method: 'POST', body: {} }).catch(
      (e) => e as ApiError,
    )

    expect((err as ApiError).message).toBe('字段名不能为空')
    expect((err as ApiError).detail).toBe(detail)
  })

  it('没有 detail 时保持原样', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { message: '服务器错误', code: '50001' }))

    const err = await apiRequest('/base/tables/t1/query', { method: 'POST', body: {} }).catch(
      (e) => e as ApiError,
    )

    expect((err as ApiError).message).toBe('服务器错误')
    expect((err as ApiError).detail).toBeUndefined()
  })
})
