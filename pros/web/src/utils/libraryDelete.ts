import { ElMessageBox } from 'element-plus'
import { getToken } from '../api/http'

const API = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'

/** 删除前确认。取消或关掉弹窗时返回 false。 */
export async function confirmLibraryDelete(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      appendTo: 'body',
      modalClass: 'rte-library-delete-confirm',
    })
    return true
  } catch {
    return false
  }
}

/** `/media/{id}` 里的素材 id；外链和 data/blob 没有。 */
export function mediaIdFromSrc(src: string): string | null {
  const base = src.split('?')[0] || ''
  const matched = base.match(/^\/media\/([0-9a-zA-Z-]+)$/)
  return matched?.[1] ?? null
}

export function dropLibraryAssets<T extends { id: string }>(assets: T[], ids: Iterable<string>): T[] {
  const drop = new Set(ids)
  return assets.filter((asset) => !drop.has(asset.id))
}

/** 删分类时，里面的素材回到未分类，不连带删文件。 */
export function releaseLibraryCategory<T extends { categoryId: string }>(
  assets: T[],
  categoryId: string,
): T[] {
  return assets.map((asset) =>
    asset.categoryId === categoryId ? { ...asset, categoryId: 'uncategorized' } : asset,
  )
}

/**
 * 从服务端忘掉这份素材。已被文档引用时接口会拒绝，本地列表仍然去掉。
 * 外链、data URL 只存在浏览器里，没有服务端记录。
 */
export async function forgetStoredMedia(src: string): Promise<void> {
  if (src.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(src)
    } catch {
      /* 没有 revoke 时忽略 */
    }
    return
  }
  const id = mediaIdFromSrc(src)
  const token = getToken()
  if (!id || !token) return
  try {
    await fetch(`${API}/media/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    /* 网络失败不挡住素材库里的删除 */
  }
}
