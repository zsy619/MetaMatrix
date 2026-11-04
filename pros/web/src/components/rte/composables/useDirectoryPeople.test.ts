/**
 * 通讯录组合式的失败提示：
 * 接口挂了 → 没有候选人 + 给出「通讯录加载失败，请稍后重试」。
 */
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { DIRECTORY_LOAD_ERROR } from '../../../api/directory'
import { useDirectoryPeople } from './useDirectoryPeople'

const listDirectoryUsers = vi.fn()

vi.mock('../../../api/directory', async () => {
  const actual = await vi.importActual<typeof import('../../../api/directory')>(
    '../../../api/directory',
  )
  return {
    ...actual,
    listDirectoryUsers: (opts: unknown) => listDirectoryUsers(opts),
  }
})

describe('useDirectoryPeople', () => {
  it('接口失败时给出友好提示且没有候选人', async () => {
    listDirectoryUsers.mockRejectedValueOnce(new Error(DIRECTORY_LOAD_ERROR))

    const people = useDirectoryPeople({
      editor: () => shallowRef(undefined),
      permission: () => null,
    })

    const users = await people.loadDirectoryUsers()

    expect(users).toEqual([])
    expect(people.directoryUsers.value).toEqual([])
    expect(people.directoryError.value).toBe('通讯录加载失败，请稍后重试')
  })

  it('接口成功时保留真实用户', async () => {
    listDirectoryUsers.mockResolvedValueOnce([
      { id: 'u-1', name: '爱丽丝', email: 'alice@metamatrix.local' },
    ])

    const people = useDirectoryPeople({
      editor: () => shallowRef(undefined),
      permission: () => null,
    })

    const users = await people.loadDirectoryUsers()

    expect(users).toEqual([{ id: 'u-1', name: '爱丽丝', email: 'alice@metamatrix.local' }])
    expect(people.directoryError.value).toBe('')
    expect(people.mentionPeople).toBeTypeOf('function')
  })
})
