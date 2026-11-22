/**
 * 素材库内部路径规则。
 *
 * 文档里存的是稳定路径 /media/{id}；浏览器取图要走 /api（开发服务器把 /api 代理到
 * API 服务），并且必须带登录令牌，所以 <img src="/media/xxx"> 一定会 404。
 * 这里只负责「路径是否合法 + 拼出可请求的地址」，不碰令牌。
 *
 * 为什么必须带 API 基址（而不是写死 /api）：
 *   - 开发：VITE_API_BASE 未设置 → 用 /api，vite dev server 把 /api 代理到 API（同源）
 *   - 生产：VITE_API_BASE = https://metamatrix.api.yy24365.com，站点与 API **不同源**。
 *     此时若仍取相对地址 /media/xxx，请求会打到站点域名，被 SPA 的 index.html 吞掉，
 *     表现为「上传接口 201 成功，但图片一直裂开 / 取图 404」。
 *   这里与 src/api/mediaUpload.ts 使用同一份基址，保证「上传」与「取图」走同一个域。
 */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '/api').replace(/\/+$/, '')

export function mediaFetchUrl(path: string): string | null {
  const queryAt = path.indexOf('?')
  const base = queryAt >= 0 ? path.slice(0, queryAt) : path
  if (!/^\/media\/[0-9a-zA-Z-]+$/.test(base)) return null
  if (queryAt >= 0 && !/^\?[A-Za-z0-9._~%=&-]+$/.test(path.slice(queryAt))) return null
  return `${API_BASE}${path}`
}

/** 是否是素材库内部路径（需要登录令牌才能取）。 */
export function isInternalMediaPath(src: string): boolean {
  return mediaFetchUrl(src) !== null
}
