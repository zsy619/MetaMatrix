/**
 * 编辑器阅读位置记忆。
 *
 * 按「文档作用域」（如 doc:xxx）把正文滚动位置存到 localStorage，
 * 下次打开同一篇文档时直接回到那个位置。
 */

const PREFIX = 'rte:scroll:'
/** 记忆有效期 30 天：过期后视为无效，避免很久以前的阅读位置把人带到奇怪的地方。 */
export const SCROLL_MEMORY_TTL = 30 * 24 * 60 * 60 * 1000

function safeStorage(storage?: Storage | null): Storage | null {
  if (storage) return storage
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

export function scrollMemoryKey(scope: string): string {
  return `${PREFIX}${scope}`
}

/** 读取上次滚动位置；无记录 / 过期 / 非法一律返回 null。 */
export function readScrollMemory(scope: string, storage?: Storage | null): number | null {
  if (!scope) return null
  const store = safeStorage(storage)
  if (!store) return null
  const key = scrollMemoryKey(scope)
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw) as { top?: number; at?: number }
    const top = Number(data.top)
    if (!Number.isFinite(top) || top <= 0) {
      store.removeItem(key)
      return null
    }
    const at = Number(data.at) || 0
    if (Date.now() - at > SCROLL_MEMORY_TTL) {
      store.removeItem(key)
      return null
    }
    return top
  } catch {
    return null
  }
}

/** 记录当前滚动位置。 */
export function writeScrollMemory(
  scope: string,
  top: number,
  storage?: Storage | null,
): void {
  if (!scope) return
  const store = safeStorage(storage)
  if (!store) return
  const value = Math.max(0, Math.round(Number(top) || 0))
  try {
    store.setItem(
      scrollMemoryKey(scope),
      JSON.stringify({ top: value, at: Date.now() }),
    )
  } catch {
    /* 隐私模式 / 配额满：忽略，不影响编辑 */
  }
}

/** 清除某个作用域的阅读位置。 */
export function clearScrollMemory(scope: string, storage?: Storage | null): void {
  if (!scope) return
  const store = safeStorage(storage)
  if (!store) return
  try {
    store.removeItem(scrollMemoryKey(scope))
  } catch {
    /* ignore */
  }
}
