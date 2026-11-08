/**
 * 素材库内部路径规则。
 *
 * 文档里存的是稳定路径 /media/{id}；浏览器取图要走 /api（开发服务器把 /api 代理到
 * API 服务），并且必须带登录令牌，所以 <img src="/media/xxx"> 一定会 404。
 * 这里只负责「路径是否合法 + 拼出可请求的地址」，不碰令牌。
 */
export function mediaFetchUrl(path: string): string | null {
  const queryAt = path.indexOf('?')
  const base = queryAt >= 0 ? path.slice(0, queryAt) : path
  if (!/^\/media\/[0-9a-zA-Z-]+$/.test(base)) return null
  if (queryAt >= 0 && !/^\?[A-Za-z0-9._~%=&-]+$/.test(path.slice(queryAt))) return null
  return `/api${path}`
}

/** 是否是素材库内部路径（需要登录令牌才能取）。 */
export function isInternalMediaPath(src: string): boolean {
  return mediaFetchUrl(src) !== null
}
