import { getToken } from './http'
import { hashMediaFile } from '../utils/hashMediaFile'

const API = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'
/** Files larger than this use prepare/part/finish. Matches the server's 20MB line. */
export const MEDIA_CHUNK_THRESHOLD = 20 * 1024 * 1024
const PART_SIZE = 4 * 1024 * 1024

export type StoredMedia = {
  id: string
  insertedPath: string
  previewUrl: string
  sha256: string
  created: boolean
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type UploadDeps = {
  fetch?: FetchLike
  token?: string | null
  hash?: (file: Blob) => Promise<string>
  mediaType?: string
}

export async function uploadMediaFile(file: File, deps: UploadDeps = {}): Promise<StoredMedia> {
  const token = deps.token === undefined ? getToken() : deps.token
  if (!token) throw new Error('未登录，不能上传到素材库')
  const fetchImpl = deps.fetch || fetch
  const sha256 = await (deps.hash || hashMediaFile)(file)
  const checked = await requestJson(fetchImpl, token, '/media/check', {
    method: 'POST',
    body: JSON.stringify({ sha256, mediaType: deps.mediaType || '' }),
  })
  if (checked.exists && checked.id && checked.insertedPath) {
    return {
      id: String(checked.id),
      insertedPath: String(checked.insertedPath),
      previewUrl: String(checked.previewUrl || checked.insertedPath),
      sha256,
      created: false,
    }
  }
  if (file.size > MEDIA_CHUNK_THRESHOLD) return uploadChunks(fetchImpl, token, file, deps.mediaType || '')
  const body = new FormData()
  body.append('file', file)
  if (deps.mediaType) body.append('mediaType', deps.mediaType)
  const saved = await requestJson(fetchImpl, token, '/media/upload', { method: 'POST', body })
  return toStored(saved, sha256)
}

async function uploadChunks(fetchImpl: FetchLike, token: string, file: File, mediaType: string): Promise<StoredMedia> {
  const prepared = await requestJson(fetchImpl, token, '/media/upload/chunk/prepare', {
    method: 'POST',
    body: JSON.stringify({
      originalName: file.name || 'file',
      mediaType,
      mimeType: file.type || '',
      sizeBytes: file.size,
      partSize: PART_SIZE,
    }),
  })
  const uploadId = String(prepared.uploadId || '')
  if (!uploadId) throw new Error('分片会话没有返回')
  const partSize = Number(prepared.partSize) || PART_SIZE
  await sendMissing(fetchImpl, token, uploadId, file, partSize)
  const status = await requestJson(fetchImpl, token, `/media/upload/chunk/${uploadId}`, { method: 'GET' })
  const missing = Array.isArray(status.missing) ? status.missing.map(Number) : []
  if (missing.length) await sendParts(fetchImpl, token, uploadId, file, partSize, missing)
  const saved = await requestJson(fetchImpl, token, `/media/upload/chunk/${uploadId}/finish`, { method: 'POST' })
  return toStored(saved, String(saved.sha256 || ''))
}

async function sendMissing(fetchImpl: FetchLike, token: string, uploadId: string, file: File, partSize: number) {
  const count = Math.max(1, Math.ceil(file.size / partSize))
  const indexes = Array.from({ length: count }, (_, i) => i)
  await sendParts(fetchImpl, token, uploadId, file, partSize, indexes)
}

async function sendParts(
  fetchImpl: FetchLike,
  token: string,
  uploadId: string,
  file: File,
  partSize: number,
  indexes: number[],
) {
  for (const index of indexes) {
    const start = index * partSize
    const blob = file.slice(start, Math.min(file.size, start + partSize))
    await requestJson(fetchImpl, token, `/media/upload/chunk/${uploadId}/part?index=${index}`, {
      method: 'POST',
      body: blob,
    })
  }
}

async function requestJson(fetchImpl: FetchLike, token: string, path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const res = await fetchImpl(`${API}${path}`, { ...init, headers })
  const text = await res.text()
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) throw new Error(String(data.message || `上传失败 (${res.status})`))
  return data
}

function toStored(data: Record<string, unknown>, sha256: string): StoredMedia {
  const id = String(data.id || '')
  const insertedPath = String(data.insertedPath || (id ? `/media/${id}` : ''))
  if (!id || !insertedPath.startsWith('/media/')) throw new Error('素材响应缺少内部路径')
  if (insertedPath.includes('..') || insertedPath.includes('\\')) throw new Error('素材路径不合法')
  return {
    id,
    insertedPath,
    previewUrl: String(data.previewUrl || insertedPath),
    sha256: String(data.sha256 || sha256),
    created: Boolean(data.created),
  }
}
