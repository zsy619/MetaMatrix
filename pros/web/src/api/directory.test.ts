/**
 * 通讯录接口契约：
 * - 成功：把后端返回的真实用户映射成 DirectoryUser。
 * - 失败：抛「通讯录加载失败，请稍后重试」，不再回退到写死的示例名单。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIRECTORY_LOAD_ERROR, listDirectoryUsers } from './directory'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listDirectoryUsers', () => {
  it('映射后端返回的真实用户', async () => {
    let requestedUrl = ''
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      return jsonResponse([
        { id: 'u-1', name: '爱丽丝', email: 'alice@metamatrix.local', role: '产品' },
        { id: 'u-2', name: '鲍勃', email: 'bob@metamatrix.local' },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const users = await listDirectoryUsers({ q: 'ali', limit: 30, offset: 10 })

    expect(users).toEqual([
      { id: 'u-1', name: '爱丽丝', email: 'alice@metamatrix.local', role: '产品' },
      { id: 'u-2', name: '鲍勃', email: 'bob@metamatrix.local' },
    ])

    expect(requestedUrl).toContain('/directory/users?')
    expect(requestedUrl).toContain('q=ali')
    expect(requestedUrl).toContain('limit=30')
    expect(requestedUrl).toContain('offset=10')
  })

  it('兼容带 data 信封的响应体', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [{ id: 'u-3', name: '卡罗尔' }] })),
    )

    const users = await listDirectoryUsers()
    expect(users).toEqual([{ id: 'u-3', name: '卡罗尔' }])
  })

  it('丢弃缺字段的行', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          { id: 'u-4', name: '德古拉' },
          { id: '', name: '没有 id' },
          { id: 'u-5' },
          null,
        ]),
      ),
    )

    const users = await listDirectoryUsers()
    expect(users).toEqual([{ id: 'u-4', name: '德古拉' }])
  })

  it('接口失败时抛出友好提示，且不回退到示例数据', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'boom' }, 500)))

    await expect(listDirectoryUsers()).rejects.toThrow(DIRECTORY_LOAD_ERROR)
    await expect(listDirectoryUsers()).rejects.toThrow('通讯录加载失败，请稍后重试')
  })

  it('网络异常时同样抛出友好提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    await expect(listDirectoryUsers()).rejects.toThrow(DIRECTORY_LOAD_ERROR)
  })
})
