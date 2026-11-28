/**
 * 重定向目标的白名单校验：只允许跳回本应用的站内路径。
 *
 * 为什么需要它：登录页会把 ?redirect= 原样带回。这是个用户可控的入参，
 * 如果不校验，攻击者就能构造 /login?redirect=https://evil.com 把用户
 * 登录后送去钓鱼站点。
 *
 * 规则：
 * - 必须是字符串，且以单个 "/" 开头（"//evil.com" 是协议相对 URL，会被浏览器
 *   当成外站，必须拒掉）；
 * - 不能含反斜杠（"\/\/evil.com" 在部分浏览器里会被归一化成协议相对 URL）；
 * - 路径部分不能含 "://"。
 */
export function safeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback
  }
  // 只校验路径部分。查询串里出现 "://" 是合法的（比如 ?q=https://a.com），
  // 用整串判断会把这种正常的站内跳转误杀。
  const path = raw.split('?')[0].split('#')[0]
  if (path.includes('://')) return fallback
  return raw
}
