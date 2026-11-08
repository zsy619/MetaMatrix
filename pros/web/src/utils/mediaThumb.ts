import { reactive } from 'vue'
import { getToken } from '../api/http'
import { mediaFetchUrl } from './mediaPath'

/**
 * 素材库缩略图 / 预览图加载。
 *
 * 背景：登录后上传的素材在文档与选择窗里存的 src 都是 /media/{id}。正文由
 * extensions/mediaHydrate 换成带令牌的 blob 地址，但选择窗直接 <img src="/media/{id}">，
 * 浏览器把 /media 当成前端静态路径 → 404 → 选择框里只看到破图。
 * 这里给选择窗补上同样的鉴权取图流程：先取元数据里的签名 previewUrl，再取字节，
 * 转成 blob: 地址交给 <img>/<video>。令牌只出现在请求头里，不进任何提示文案。
 */
export type MediaThumbStatus = 'direct' | 'loading' | 'ready' | 'error'

export type MediaThumbState = {
  status: MediaThumbStatus
  /** 可以直接给 <img src> 的地址（blob: / data: / http(s):） */
  url: string
  /** 面向用户的失败原因，不含令牌或内部堆栈 */
  error: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const states = reactive<Record<string, MediaThumbState>>({})
/** src -> 已经换好的 blob: 地址，避免同一个素材反复下载 */
const blobs = new Map<string, string>()
const pending = new Set<string>()

const DIRECT_RE = /^(data:|blob:|https?:\/\/)/i

function directState(src: string): MediaThumbState {
  return { status: 'direct', url: src, error: '' }
}

/** 读取某个素材当前的预览状态（模板里用）。 */
export function mediaThumbState(src: string): MediaThumbState {
  if (!src) return { status: 'direct', url: '', error: '' }
  const found = states[src]
  if (found) return found
  if (DIRECT_RE.test(src)) return directState(src)
  // 内部素材路径：还没开始取图时先按「加载中」处理，避免直接渲染 /media/{id} 变成破图
  if (mediaFetchUrl(src)) return { status: 'loading', url: '', error: '' }
  return directState(src)
}

/** 是否需要走鉴权取图流程（内部素材路径）。 */
export function needsAuthPreview(src: string): boolean {
  if (!src) return false
  if (DIRECT_RE.test(src)) return false
  return mediaFetchUrl(src) !== null
}

/** 保证某个素材有预览地址；重复调用不会重复下载。 */
export function ensureMediaThumb(src: string): void {
  if (!src) return
  if (DIRECT_RE.test(src)) {
    if (!states[src]) states[src] = directState(src)
    return
  }
  if (!mediaFetchUrl(src)) {
    if (!states[src]) states[src] = directState(src)
    return
  }
  const state = states[src]
  if (!state) {
    states[src] = { status: 'loading', url: '', error: '' }
    void load(src)
    return
  }
  if (state.status === 'loading' || state.status === 'ready') return
  if (state.status === 'error') void load(src)
}

/** 失败后重试：清掉旧结果与缓存，重新拉一次。 */
export function retryMediaThumb(src: string): void {
  if (!src) return
  if (DIRECT_RE.test(src) || !mediaFetchUrl(src)) {
    states[src] = directState(src)
    return
  }
  const cached = blobs.get(src)
  if (cached) {
    URL.revokeObjectURL(cached)
    blobs.delete(src)
  }
  states[src] = { status: 'loading', url: '', error: '' }
  void load(src)
}

/** 外链/直链图片加载失败时标记为错误，交给界面提示。 */
export function markMediaThumbError(src: string, error: string): void {
  if (!src) return
  const found = states[src]
  if (found && found.status === 'ready') return
  states[src] = { status: 'error', url: '', error: error || '加载失败，请重试' }
}

/** 丢弃缓存（登出等场景）。 */
export function clearMediaThumbs(): void {
  blobs.forEach((url) => URL.revokeObjectURL(url))
  blobs.clear()
  pending.clear()
  Object.keys(states).forEach((key) => delete states[key])
}

async function load(src: string, fetchImpl: FetchLike = fetch): Promise<void> {
  if (pending.has(src)) return
  pending.add(src)
  try {
    const token = getToken()
    if (!token) {
      states[src] = { status: 'error', url: '', error: '未登录，无法加载素材预览，请登录后重试' }
      return
    }
    const metaUrl = mediaFetchUrl(src)
    if (!metaUrl) {
      states[src] = { status: 'error', url: '', error: '素材地址不合法，无法加载预览' }
      return
    }
    const metaRes = await fetchImpl(metaUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (metaRes.status === 401) {
      states[src] = { status: 'error', url: '', error: '登录状态已失效，请重新登录后重试' }
      return
    }
    if (!metaRes.ok) {
      states[src] = { status: 'error', url: '', error: '素材已失效或被删除，请重新上传' }
      return
    }
    let preview = ''
    try {
      const meta = (await metaRes.json()) as { previewUrl?: string }
      preview = String(meta.previewUrl || '')
    } catch {
      preview = ''
    }
    const previewUrl = preview ? mediaFetchUrl(preview) : null
    if (!previewUrl) {
      states[src] = { status: 'error', url: '', error: '素材缺少可用预览地址，请重新上传' }
      return
    }
    const fileRes = await fetchImpl(previewUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!fileRes.ok) {
      states[src] = { status: 'error', url: '', error: '素材读取失败，请重试' }
      return
    }
    const blob = await fileRes.blob()
    const blobUrl = URL.createObjectURL(blob)
    const old = blobs.get(src)
    if (old) URL.revokeObjectURL(old)
    blobs.set(src, blobUrl)
    states[src] = { status: 'ready', url: blobUrl, error: '' }
  } catch {
    states[src] = { status: 'error', url: '', error: '素材加载失败，请检查网络后重试' }
  } finally {
    pending.delete(src)
  }
}
