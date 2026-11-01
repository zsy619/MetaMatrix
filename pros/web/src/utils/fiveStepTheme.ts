import type { CSSProperties } from 'vue'
import type {
  CanvasTheme,
  FiveStepColumnChrome,
  FiveStepColumnTone,
  FiveStepRowTone,
  FiveStepTableTheme,
} from '../types/canvas'

/**
 * 五步法系列共用表色。
 * 对齐人类-AI 双三角：浅页底、发丝分隔、列语义色（奶油 / 陶 / 蓝 / 绿 / 玫），
 * 而不是整表霓虹黄 + #9aa0a6 灰框。
 * 列色优先读 column.*Color，其次 theme.table.columns，最后这里的默认值。
 */

export const FIVE_STEP_PAGE = '#f7f7f7'

export const FIVE_STEP_CHROME = {
  border: '#ececec',
  divider: 'rgba(60, 50, 20, 0.10)',
  surface: '#ffffff',
  footer: '#f6f4ef',
  footerText: '#6b6458',
  section: '#3c3424',
  negate: '#C4473A',
  quantitative: '#f4f7f8',
  bodyText: '#3c4043',
} as const

export type FiveStepChrome = { [K in keyof typeof FIVE_STEP_CHROME]: string }

/** 挑战版「非*」用更暖的琥珀，避免和提高/进阶的砖红混成同一种否定色。 */
export const FIVE_STEP_CHALLENGE_NEGATE = '#C47A2A'

export const FIVE_STEP_COLUMN_TONES: Record<string, Required<FiveStepColumnTone>> = {
  hypothesis: {
    header: '#E5EEF3',
    headerText: '#2C4456',
    accent: '#3D5A73',
    body: '#F7FAFC',
  },
  demand: {
    header: '#FBF6E4',
    headerText: '#7A5C00',
    accent: '#A67C00',
    body: '#FFFCF6',
  },
  solution: {
    header: '#FBF1EB',
    headerText: '#8A4024',
    accent: '#B85A38',
    body: '#FFF8F5',
  },
  business: {
    header: '#E8F1FA',
    headerText: '#1C4C7C',
    accent: '#2A649F',
    body: '#F7FAFD',
  },
  growth: {
    header: '#E7F6EF',
    headerText: '#125C3B',
    accent: '#187A4E',
    body: '#F6FCF9',
  },
  moat: {
    header: '#FBEFF2',
    headerText: '#84344C',
    accent: '#A84562',
    body: '#FDF7F9',
  },
}

export const FIVE_STEP_ROW_TONES: Record<string, Required<FiveStepRowTone>> = {
  qualitative: { rail: '#F6EBD4', railText: '#3c3424', body: '#FFFCF6' },
  quantitative: { rail: '#E5EEF3', railText: '#24343c', body: '#F5F9FC' },
  team: { rail: '#EFE8DF', railText: '#3c3424', body: '#FBF8F4' },
}

export type FiveStepStyle = CSSProperties & Record<`--${string}`, string>

function pick(value: string | undefined, fallback: string): string {
  const text = value?.trim()
  return text ? text : fallback
}

export function isLegacyPageWhite(color: string | undefined): boolean {
  const c = color?.trim().toLowerCase()
  return !c || c === '#fff' || c === '#ffffff'
}

export function resolveFiveStepPage(theme: CanvasTheme | undefined): string {
  const page = theme?.table?.page?.trim()
  if (page) return page
  const bg = theme?.background?.color
  if (bg && !isLegacyPageWhite(bg)) return bg.trim()
  return FIVE_STEP_PAGE
}

export function resolveFiveStepChrome(
  theme: CanvasTheme | undefined,
  overrides?: Partial<FiveStepChrome>,
): FiveStepChrome & { page: string } {
  const table: FiveStepTableTheme | undefined = theme?.table
  return {
    page: resolveFiveStepPage(theme),
    border: pick(table?.border, overrides?.border ?? FIVE_STEP_CHROME.border),
    divider: pick(table?.divider, overrides?.divider ?? FIVE_STEP_CHROME.divider),
    surface: pick(table?.surface, overrides?.surface ?? FIVE_STEP_CHROME.surface),
    footer: pick(table?.footer, overrides?.footer ?? FIVE_STEP_CHROME.footer),
    footerText: pick(
      table?.footerText,
      overrides?.footerText ?? FIVE_STEP_CHROME.footerText,
    ),
    section: pick(table?.section, overrides?.section ?? FIVE_STEP_CHROME.section),
    negate: pick(table?.negate, overrides?.negate ?? FIVE_STEP_CHROME.negate),
    quantitative: pick(
      table?.quantitative,
      overrides?.quantitative ?? FIVE_STEP_CHROME.quantitative,
    ),
    bodyText: pick(table?.bodyText, overrides?.bodyText ?? FIVE_STEP_CHROME.bodyText),
  }
}

export function fiveStepCanvasStyle(
  theme: CanvasTheme | undefined,
  overrides?: Partial<FiveStepChrome>,
): FiveStepStyle {
  const chrome = resolveFiveStepChrome(theme, overrides)
  return {
    backgroundColor: chrome.page,
    '--fs-border': chrome.border,
    '--fs-divider': chrome.divider,
    '--fs-surface': chrome.surface,
    '--fs-footer': chrome.footer,
    '--fs-footer-text': chrome.footerText,
    '--fs-section': chrome.section,
    '--fs-negate': chrome.negate,
    '--fs-quant': chrome.quantitative,
    '--fs-body-text': chrome.bodyText,
  }
}

export function fiveStepColumnStyle(
  theme: CanvasTheme | undefined,
  column: FiveStepColumnChrome & { id: string },
): FiveStepStyle {
  const builtin = FIVE_STEP_COLUMN_TONES[column.id]
  const fromTheme = theme?.table?.columns?.[column.id]
  return {
    '--fs-col-header': pick(
      column.headerColor,
      pick(fromTheme?.header, builtin?.header ?? '#F6EBD4'),
    ),
    '--fs-col-header-text': pick(
      column.headerTextColor,
      pick(fromTheme?.headerText, builtin?.headerText ?? '#3c3424'),
    ),
    '--fs-col-accent': pick(
      column.accentColor,
      pick(fromTheme?.accent, builtin?.accent ?? '#A67C00'),
    ),
    '--fs-col-body': pick(
      column.bodyColor,
      pick(fromTheme?.body, builtin?.body ?? '#ffffff'),
    ),
  }
}

export function fiveStepRowStyle(
  theme: CanvasTheme | undefined,
  row: { id: string; railColor?: string; railTextColor?: string; bodyColor?: string },
): FiveStepStyle {
  const builtin = FIVE_STEP_ROW_TONES[row.id]
  const fromTheme = theme?.table?.rows?.[row.id]
  return {
    '--fs-rail': pick(row.railColor, pick(fromTheme?.rail, builtin?.rail ?? '#F6EBD4')),
    '--fs-rail-text': pick(
      row.railTextColor,
      pick(fromTheme?.railText, builtin?.railText ?? '#3c3424'),
    ),
    '--fs-row-body': pick(row.bodyColor, pick(fromTheme?.body, builtin?.body ?? '#ffffff')),
  }
}

/** 结构升级重写列时保留模板上的表色，避免被裁成只剩 header/footer。 */
export function fiveStepColumnChromeFields(
  column: FiveStepColumnChrome,
): FiveStepColumnChrome {
  const out: FiveStepColumnChrome = {}
  if (column.headerColor) out.headerColor = column.headerColor
  if (column.headerTextColor) out.headerTextColor = column.headerTextColor
  if (column.accentColor) out.accentColor = column.accentColor
  if (column.bodyColor) out.bodyColor = column.bodyColor
  return out
}
