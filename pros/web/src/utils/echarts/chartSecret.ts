/**
 * 图表数据接口的「自定义鉴权」密钥存放处。
 *
 * 约束：
 * - 密钥**不写入文档**，因此不会出现在导出 / 打印的 HTML 明文里；
 * - 密钥只存浏览器 localStorage，按图表块 id 隔离；
 * - 使用「读取本系统登录态」时复用 api/http.ts 的 token 存储，这里不另存一份。
 *
 * 自定义 Token 有泄露风险，界面上必须提示用户。
 */

const PREFIX = 'metamatrix:rte:chart:secret:'

/** 自定义鉴权密钥。 */
export type ChartSecret = {
  /** Bearer Token。 */
  bearerToken: string
  /** 自定义 Header 键值（值可能是密钥）。 */
  headers: Record<string, string>
}

function emptySecret(): ChartSecret {
  return { bearerToken: '', headers: {} }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 读某个图表块的密钥。 */
export function readChartSecret(chartId: string): ChartSecret {
  const store = storage()
  if (!store || !chartId) return emptySecret()
  try {
    const raw = store.getItem(PREFIX + chartId)
    if (!raw) return emptySecret()
    const parsed = JSON.parse(raw) as Partial<ChartSecret>
    const headers: Record<string, string> = {}
    if (parsed.headers && typeof parsed.headers === 'object') {
      for (const [key, value] of Object.entries(parsed.headers)) {
        if (key) headers[key] = String(value ?? '')
      }
    }
    return { bearerToken: String(parsed.bearerToken ?? ''), headers }
  } catch {
    return emptySecret()
  }
}

/** 写某个图表块的密钥。 */
export function writeChartSecret(chartId: string, secret: ChartSecret): void {
  const store = storage()
  if (!store || !chartId) return
  try {
    const payload: ChartSecret = {
      bearerToken: String(secret.bearerToken || ''),
      headers: secret.headers || {},
    }
    store.setItem(PREFIX + chartId, JSON.stringify(payload))
  } catch {
    /* 隐私模式 / 配额不足时静默失败 */
  }
}

/** 删掉某个图表块的密钥。 */
export function clearChartSecret(chartId: string): void {
  const store = storage()
  if (!store || !chartId) return
  try {
    store.removeItem(PREFIX + chartId)
  } catch {
    /* ignore */
  }
}
