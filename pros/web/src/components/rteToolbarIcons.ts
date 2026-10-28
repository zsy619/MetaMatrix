import { h, type Component } from 'vue'

/**
 * 知乎专栏工具栏线稿图标。
 * viewBox 仍为 0 0 24 24，但路径按「可视墨水 ≈20×20」绘制（边距约 2px），
 * 避免 Lucide 式大留白导致 24px 槽位里看起来只有 ~14px。
 * width/height 用 24 而非 1em，避免父级 font-size:0 时图标坍缩。
 */
function svgIcon(paths: string[], viewBox = '0 0 24 24'): Component {
  return {
    name: 'RteSvgIcon',
    inheritAttrs: false,
    render() {
      return h(
        'svg',
        {
          viewBox,
          width: 24,
          height: 24,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.7,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          focusable: 'false',
          ...(this.$attrs || {}),
        },
        paths.map((d) => h('path', { d })),
      )
    },
  }
}

function svgIconNodes(nodes: ReturnType<typeof h>[], viewBox = '0 0 24 24'): Component {
  return {
    name: 'RteSvgIconNodes',
    inheritAttrs: false,
    render() {
      return h(
        'svg',
        {
          viewBox,
          width: 24,
          height: 24,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.7,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          focusable: 'false',
          ...(this.$attrs || {}),
        },
        nodes,
      )
    },
  }
}

/* —— 字形尽量铺满 2..22，对齐知乎 closeup 约 19px 墨高 —— */
export const IconBold = svgIcon([
  'M5 3h9a4.5 4.5 0 0 1 0 9H5z',
  'M5 12h10a4.5 4.5 0 0 1 0 9H5z',
])
export const IconItalic = svgIcon(['M15 3H9', 'M19 21h-6', 'M13.5 3l-5 18'])
export const IconUnderline = svgIcon([
  'M5 3v8a7 7 0 0 0 14 0V3',
  'M3 21h18',
])
export const IconStrike = svgIcon(['M4 12h16', 'M16.5 6.5a4.5 4.5 0 0 0-9 .6', 'M7.5 17.5a4.5 4.5 0 0 0 9-.6'])
export const IconCode = svgIcon(['M8 7L3 12l5 5', 'M16 7l5 5-5 5', 'M13.5 5l-3 14'])
export const IconCodeInline = svgIcon(['M9 7L5 12l4 5', 'M15 7l4 5-4 5'])
export const IconFormula = svgIcon([
  'M4 4h7',
  'M7.5 4v16',
  'M4 20h7',
  'M14 7c2.2-3.2 5.5-3.2 5.5 0S18 10.2 16.2 12 14 15.5 14 17',
  'M19.5 17s1.2 2.2 0 3.3-3.3 1.1-4.4 0',
])
export const IconHeading = svgIcon(['M4 3v18', 'M4 12h12', 'M16 3v18'])
export const IconAlign = svgIcon(['M3 5h18', 'M3 12h12', 'M3 19h16'])
export const IconColorText = svgIcon(['M5 20h14', 'M8.5 15.5L12 3.5l3.5 12', 'M9.5 12h5'])
export const IconQuote = svgIcon([
  'M6 9h3.5v8H4.5v-5.5A4 4 0 0 1 6 9z',
  'M16 9h3.5v8H16v-5.5A4 4 0 0 1 17.5 9z',
])
export const IconFootnote = svgIcon([
  'M5 3h10l4 4v14H5z',
  'M15 3v4h4',
  'M8 13h8',
  'M8 17h5',
])

export const IconUndo = svgIcon([
  'M9 15L3 9l6-6',
  'M3 9h10a8 8 0 1 1 0 16h-2',
])
export const IconRedo = svgIcon([
  'M15 15l6-6-6-6',
  'M21 9H11a8 8 0 1 0 0 16h2',
])
export const IconClear = svgIcon([
  'M4 20h16',
  'M7 16.5l10-10',
  'M11 6.5l2.5-2.5 5.5 5.5-2.5 2.5',
  'M7 16.5l3-1.8',
])
export const IconList = svgIcon([
  'M8 5h13',
  'M8 12h13',
  'M8 19h13',
  'M3.5 5h.01',
  'M3.5 12h.01',
  'M3.5 19h.01',
])
export const IconHighlight = svgIcon([
  'M8 19l-2.5 2.5',
  'M14.5 3.5l6 6',
  'M12.5 5.5l-8 8 3.5 3.5 8-8z',
  'M4 20.5h7',
])
export const IconImage = svgIconNodes([
  h('rect', { x: 2.5, y: 4, width: 19, height: 16, rx: 2 }),
  h('circle', { cx: 8.5, cy: 9.5, r: 1.7 }),
  h('path', { d: 'M2.5 16.5l5.5-4.5 4 3.2 3.2-2.2 6.3 4.5' }),
])
export const IconVideo = svgIconNodes([
  h('rect', { x: 2.5, y: 5, width: 14, height: 14, rx: 2 }),
  h('path', { d: 'M16.5 9.5l5-3v11l-5-3z' }),
])
export const IconLink = svgIcon([
  'M9.5 13.5a5.5 5.5 0 0 0 7.78 0l1.55-1.55a5.5 5.5 0 0 0-7.78-7.78L9.5 5.72',
  'M14.5 10.5a5.5 5.5 0 0 0-7.78 0L5.17 12.05a5.5 5.5 0 0 0 7.78 7.78L14.5 18.28',
])
export const IconTable = svgIconNodes([
  h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
  h('path', { d: 'M3 9.5h18' }),
  h('path', { d: 'M3 15h18' }),
  h('path', { d: 'M9.5 3v18' }),
])
export const IconAttach = svgIcon([
  'M15 6.5l-7.2 7.2a3.2 3.2 0 0 0 4.53 4.53l7.5-7.5a4.8 4.8 0 1 0-6.79-6.79L5.5 11.5',
])
export const IconImport = svgIcon([
  'M12 2.5v11',
  'M7.5 9l4.5 4.5L16.5 9',
  'M4.5 17.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2',
])
export const IconMore: Component = {
  name: 'IconMore',
  inheritAttrs: false,
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 24,
        height: 24,
        fill: 'currentColor',
        stroke: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        focusable: 'false',
        ...(this.$attrs || {}),
      },
      [
        h('circle', { cx: 5.5, cy: 12, r: 1.8 }),
        h('circle', { cx: 12, cy: 12, r: 1.8 }),
        h('circle', { cx: 18.5, cy: 12, r: 1.8 }),
      ],
    )
  },
}
export const IconHr = svgIcon(['M3 12h18'])
export const IconDocument = svgIconNodes([
  h('path', { d: 'M6 2.5h8l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z' }),
  h('path', { d: 'M14 2.5V8h5.5' }),
  h('path', { d: 'M8.5 13h7' }),
  h('path', { d: 'M8.5 17h5' }),
])
export const IconConnection = svgIcon([
  'M9.5 13.5a5.5 5.5 0 0 0 7.78 0l1.55-1.55a5.5 5.5 0 1 0-7.78-7.78L9.8 5.5',
  'M14.5 10.5a5.5 5.5 0 0 0-7.78 0L5.17 12.05a5.5 5.5 0 1 0 7.78 7.78L14.2 18.5',
])

/** 表格弹窗 · 行数：圆角方框 + 水平分隔线 */
export const IconTableRows: Component = {
  name: 'IconTableRows',
  inheritAttrs: false,
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 24,
        height: 24,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.7,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        focusable: 'false',
        ...(this.$attrs || {}),
      },
      [
        h('rect', { x: 3.5, y: 3.5, width: 17, height: 17, rx: 2.5 }),
        h('path', { d: 'M4 10h16' }),
        h('path', { d: 'M4 14.5h16' }),
      ],
    )
  },
}

/** 表格弹窗 · 列数：圆角方框 + 垂直分隔线 */
export const IconTableCols: Component = {
  name: 'IconTableCols',
  inheritAttrs: false,
  render() {
    return h(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 24,
        height: 24,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.7,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        focusable: 'false',
        ...(this.$attrs || {}),
      },
      [
        h('rect', { x: 3.5, y: 3.5, width: 17, height: 17, rx: 2.5 }),
        h('path', { d: 'M10 4v16' }),
        h('path', { d: 'M14.5 4v16' }),
      ],
    )
  },
}

export const toolbarIconMap: Record<string, Component> = {
  undo: IconUndo,
  redo: IconRedo,
  clear: IconClear,
  heading: IconHeading,
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  strike: IconStrike,
  codeInline: IconCodeInline,
  highlight: IconHighlight,
  color: IconColorText,
  align: IconAlign,
  list: IconList,
  quote: IconQuote,
  hr: IconHr,
  code: IconCode,
  note: IconFootnote,
  image: IconImage,
  video: IconVideo,
  link: IconLink,
  formula: IconFormula,
  table: IconTable,
  attach: IconAttach,
  import: IconImport,
  more: IconMore,
  importDoc: IconDocument,
  importLink: IconConnection,
}

export { IconDocument as Document, IconConnection as Connection, IconLink as LinkIcon }
