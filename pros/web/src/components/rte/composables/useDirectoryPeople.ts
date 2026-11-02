import { ref, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { listDirectoryUsers, type DirectoryUser } from '../../../api/directory'
import {
  filterDirectoryUsers,
  type DirectoryPermission,
} from '../../../utils/rteDirectory'
import type { RteMentionItem } from '../../rteMentionItems'

/**
 * 组织通讯录里的真人。
 *
 * - 数据来源：api/directory.listDirectoryUsers。后端没实现该路由时回退到本地示例。
 * - 权限：文档侧的 DirectoryPermission 决定谁能被提到。权限钩子由宿主传入。
 * - 缓存在本组合式内，避免每次打开 @ 菜单都打一次接口。
 */
export function useDirectoryPeople(deps: {
  editor: () => ShallowRef<Editor | undefined>
  permission: () => DirectoryPermission | null | undefined
}) {
  const directoryUsers = ref<DirectoryUser[]>([])
  const directoryLoading = ref(false)
  const directoryLoaded = ref(false)
  const directoryError = ref('')
  let pending: Promise<DirectoryUser[]> | null = null

  async function loadDirectoryUsers(force = false): Promise<DirectoryUser[]> {
    if (directoryLoaded.value && !force) return directoryUsers.value
    if (pending) return pending
    directoryLoading.value = true
    directoryError.value = ''
    pending = listDirectoryUsers({ limit: 60 })
      .then((users) => {
        directoryUsers.value = users
        directoryLoaded.value = true
        return users
      })
      .catch((err) => {
        directoryError.value = err instanceof Error ? err.message : '通讯录加载失败'
        directoryUsers.value = []
        return directoryUsers.value
      })
      .finally(() => {
        directoryLoading.value = false
        pending = null
      })
    return pending
  }

  /** 当前文档允许 @ 的人。 */
  function permittedUsers(): DirectoryUser[] {
    return filterDirectoryUsers(directoryUsers.value, deps.permission())
  }

  /** 通讯录用户转成 @ 菜单候选。 */
  function toMentionItems(users: readonly DirectoryUser[]): RteMentionItem[] {
    return users.map((u) => ({
      id: u.id,
      label: u.name,
      role: u.department || u.role,
      kind: 'person' as const,
    }))
  }

  /** 给 @ 菜单用：拉取通讯录并按权限过滤。 */
  async function mentionPeople(): Promise<RteMentionItem[]> {
    const users = await loadDirectoryUsers()
    return toMentionItems(filterDirectoryUsers(users, deps.permission()))
  }

  return {
    directoryUsers,
    directoryLoading,
    directoryLoaded,
    directoryError,
    loadDirectoryUsers,
    permittedUsers,
    toMentionItems,
    mentionPeople,
  }
}
