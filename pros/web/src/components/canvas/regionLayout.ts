/**
 * 画布「区域编辑器」共享布局约定。
 *
 * 参考图里的静态标签（圈名、顶点名、交叠区名）用 SVG 文本绘制，保持与参考图
 * 一致的配色与排版；用户填写的内容用 HTML 浮层编辑器绘制，位置同样以
 * viewBox 坐标描述，运行时换算成百分比，与 SVG 严格对齐。
 */

export interface RegionLabelSpec {
  x: number
  y: number
  /** 文本锚点 */
  anchor: 'start' | 'middle' | 'end'
  /** 字号（viewBox 单位） */
  size: number
  weight: number
  color: string
  /** 额外的描边宽度（用于「难题」这类带白边的水印字） */
  stroke?: string
  strokeWidth?: number
  /** 旋转角度（度） */
  rotate?: number
  /** 额外字距 */
  letterSpacing?: number
  /** 主标题文字（默认取区域标题；用于把「管理 / 确定执行」拆成主副两行） */
  mainText?: string
  /** 副标题（第二行说明文字） */
  sub?: {
    text: string
    dy: number
    size: number
    weight: number
    color: string
  }
}

export interface RegionChipSpec {
  /** 浮层中心 / 锚点 x（viewBox 单位） */
  x: number
  /** 浮层顶部 y（viewBox 单位） */
  y: number
  /** 浮层宽度（viewBox 单位） */
  width: number
  /** 水平对齐方式 */
  align: 'left' | 'center' | 'right'
}

export interface RegionLayout {
  /** 静态标签（SVG） */
  label: RegionLabelSpec
  /** 可编辑内容浮层（HTML） */
  chip: RegionChipSpec
}

export interface CanvasViewBox {
  w: number
  h: number
}

/** viewBox 坐标 → 百分比定位（HTML 浮层与 SVG 严格对齐） */
export function toPercent(value: number, total: number): string {
  return `${(value / total) * 100}%`
}

/**
 * 依据对齐方式计算浮层左边界（viewBox 单位）。
 * 返回的已经是左边界，调用方不要再叠加 translate。
 */
export function chipLeft(chip: RegionChipSpec): number {
  if (chip.align === 'left') return chip.x
  if (chip.align === 'right') return chip.x - chip.width
  return chip.x - chip.width / 2
}
