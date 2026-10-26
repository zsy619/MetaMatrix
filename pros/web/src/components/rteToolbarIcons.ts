import { h, type Component } from 'vue'
import {
  RefreshLeft,
  RefreshRight,
  Brush,
  List,
  Minus,
  Picture,
  VideoPlay,
  Link,
  Grid,
  Cloudy,
  Upload,
  MoreFilled,
  MagicStick,
  Document,
  Connection,
} from '@element-plus/icons-vue'

/** 简单笔画 SVG，风格贴近线稿图标 */
function svgIcon(paths: string[], viewBox = '0 0 24 24'): Component {
  return {
    name: 'RteSvgIcon',
    render() {
      return h(
        'svg',
        {
          viewBox,
          width: '1em',
          height: '1em',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.7,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          xmlns: 'http://www.w3.org/2000/svg',
        },
        paths.map((d) => h('path', { d })),
      )
    },
  }
}

export const IconBold = svgIcon([
  'M6 4h8a4 4 0 0 1 0 8H6z',
  'M6 12h9a4 4 0 0 1 0 8H6z',
])
export const IconItalic = svgIcon(['M14 4h-4', 'M18 20h-4', 'M12 4l-4 16'])
export const IconUnderline = svgIcon([
  'M6 4v7a6 6 0 0 0 12 0V4',
  'M4 20h16',
])
export const IconStrike = svgIcon(['M5 12h14', 'M16 7a4 4 0 0 0-8 .5', 'M8 17a4 4 0 0 0 8-.5'])
export const IconCode = svgIcon(['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13 6l-2 12'])
export const IconCodeInline = svgIcon(['M9 8l-3 4 3 4', 'M15 8l3 4-3 4'])
export const IconFormula = svgIcon([
  'M5 5h6',
  'M8 5v14',
  'M5 19h6',
  'M14 8c2-3 5-3 5 0s-1.5 3-3 4.5S14 16 14 16',
  'M19 16s1 2 0 3-3 1-4 0',
])
export const IconHeading = svgIcon(['M5 5v14', 'M5 12h10', 'M15 5v14'])
export const IconAlign = svgIcon(['M4 6h16', 'M4 12h10', 'M4 18h14'])
export const IconColorText = svgIcon(['M6 18h12', 'M9 14l3-10 3 10', 'M10 11h4'])
export const IconQuote = svgIcon([
  'M7 10h3v7H5v-5a4 4 0 0 1 2-2z',
  'M16 10h3v7h-5v-5a4 4 0 0 1 2-2z',
])
export const IconFootnote = svgIcon([
  'M6 4h9l3 3v13H6z',
  'M15 4v3h3',
  'M9 13h6',
  'M9 17h4',
])

export const toolbarIconMap: Record<string, Component> = {
  undo: RefreshLeft,
  redo: RefreshRight,
  clear: Brush,
  heading: IconHeading,
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  strike: IconStrike,
  codeInline: IconCodeInline,
  highlight: MagicStick,
  color: IconColorText,
  align: IconAlign,
  list: List,
  quote: IconQuote,
  hr: Minus,
  code: IconCode,
  note: IconFootnote,
  image: Picture,
  video: VideoPlay,
  link: Link,
  formula: IconFormula,
  table: Grid,
  attach: Cloudy,
  import: Upload,
  more: MoreFilled,
  // import menu
  importDoc: Document,
  importLink: Connection,
}

export { Document, Connection, Link as LinkIcon }
