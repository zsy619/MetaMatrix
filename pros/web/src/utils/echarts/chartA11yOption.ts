/**
 * 图表 option 的 aria 生成：渲染前把「可读屏摘要」写进 option.aria。
 *
 * 与 `chartA11y.ts`（摘要文本）、`chartA11yDom.ts`（DOM 隐藏表）分开，
 * 是为了守住「单文件 < 300 行」的规模约束。
 *
 * 规则：
 * - 默认开启 `aria` 与 `aria.label`（读屏能拿到数据）；
 * - `aria.label.description`：用户提供的优先（净化 + 限长），
 *   没有则用基于标题 / 类型 / 系列 / 数据自动生成的摘要；
 * - `aria.decal.show`：保留用户的设置（色觉障碍友好纹理）。
 */
import { buildChartA11ySummary } from './chartA11y'

/** aria.label.description 的最大长度。 */
export const CHART_ARIA_MAX_DESCRIPTION_LEN = 600

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 净化描述文本：去掉控制字符与尖括号、压缩空白，并限长。
 *
 * 描述最终会进 aria 属性，必须是纯文本（不能带标签 / 脚本）。
 */
export function sanitizeAriaDescription(
  raw: unknown,
  maxLen: number = CHART_ARIA_MAX_DESCRIPTION_LEN,
): string {
  if (typeof raw !== 'string') return ''
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned
}

/**
 * 给 option 补上 aria 配置（返回新对象，不改原 option）。
 *
 * - `aria.enabled`：默认 true（用户显式给布尔值时按用户的来）；
 * - `aria.label.enabled`：默认 true；
 * - `aria.label.description`：用户提供的优先，否则自动摘要；
 * - `aria.decal.show`：用户给了才保留。
 */
export function applyChartAria(option: unknown): Record<string, unknown> {
  const opt = isPlainObject(option) ? option : {}
  const aria = isPlainObject(opt.aria) ? opt.aria : {}
  const label = isPlainObject(aria.label) ? aria.label : {}
  const decal = isPlainObject(aria.decal) ? aria.decal : {}

  const enabled = typeof aria.enabled === 'boolean' ? aria.enabled : true
  const labelEnabled = typeof label.enabled === 'boolean' ? label.enabled : true

  const userDescription = sanitizeAriaDescription(label.description)
  const autoDescription = buildChartA11ySummary(opt).description
  const description = userDescription || autoDescription

  const nextAria: Record<string, unknown> = {
    enabled,
    label: { enabled: labelEnabled, description },
  }
  if (typeof decal.show === 'boolean') {
    nextAria.decal = { show: decal.show }
  }
  return { ...opt, aria: nextAria }
}
