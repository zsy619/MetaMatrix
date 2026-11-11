import { h, type Component } from 'vue'
import { TABLE_MENU_ICONS } from './tableMenuIcons'
import {
  IconCode,
  IconColumns,
  IconDocument,
  IconFirstIndent,
  IconFontFamily,
  IconFontSize,
  IconFormCheckbox,
  IconFormRadio,
  IconFormText,
  IconIndent,
  IconLineHeight,
  IconList,
  IconListOrdered,
  IconListTask,
  IconOutdent,
  IconQuote,
  IconTable,
  IconTemplate,
} from '../rteToolbarIcons'

function g(paths: string[]): Component {
  return {
    render() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '16',
          height: '16',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.8',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        paths.map((d) => h('path', { d })),
      )
    },
  }
}

function swatch(color: string): Component {
  return {
    render() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: '16', height: '16', 'aria-hidden': 'true' },
        [h('rect', { x: '4', y: '4', width: '16', height: '16', rx: '3', fill: color })],
      )
    },
  }
}

const alignLeft = g(['M4 6h16', 'M4 12h10', 'M4 18h16'])
const alignCenter = g(['M4 6h16', 'M7 12h10', 'M4 18h16'])
const alignRight = g(['M4 6h16', 'M10 12h10', 'M4 18h16'])
const alignJustify = g(['M4 6h16', 'M4 12h16', 'M4 18h16'])
const zoom = g(['M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0', 'M20 20l-4.3-4.3'])
const chart = g(['M4 19V5', 'M4 19h16', 'M8 15v-4', 'M12 15V8', 'M16 15v-7'])
const page = IconDocument
const calendar = g(['M5 5h14v14H5z', 'M5 9h14', 'M9 3v4', 'M15 3v4'])
const clock = g(['M12 7v5l3 2', 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0'])
const copy = g(['M8 8h10v12H8z', 'M6 16H5V4h10v2'])
const check = g(['M5 12l4 4L19 7'])
const arrowRight = g(['M5 12h14', 'M13 6l6 6-6 6'])
const arrowLeft = g(['M19 12H5', 'M11 6l-6 6 6 6'])
const arrowUp = g(['M12 19V5', 'M6 11l6-6 6 6'])
const arrowDown = g(['M12 5v14', 'M6 13l6 6 6-6'])
const fullWidth = g(['M5 6h14', 'M5 12h14', 'M5 18h14'])

const BY_ID: Record<string, Component> = {
  ltr: arrowRight,
  rtl: arrowLeft,
  manual: g(['M4 20h4l11-11-4-4L4 16z', 'M13 7l4 4']),
  auto: g(['M8 7h8', 'M12 7v10', 'M9 14l3 3 3-3']),
  decimal: IconListOrdered,
  'lower-alpha': g(['M7 16l2-8h2l2 8', 'M8 13h4']),
  'upper-alpha': g(['M7 16l2-8h2l2 8', 'M8 13h4', 'M6 7h8']),
  'lower-roman': g(['M8 7v10', 'M8 7h4', 'M8 12h3', 'M8 17h4']),
  'upper-roman': g(['M8 7v10', 'M8 7h5', 'M8 12h4', 'M8 17h5']),
  'cjk-ideographic': g(['M6 8h12', 'M12 8v8', 'M8 16h8']),
  blue: swatch('#1d4ed8'),
  green: swatch('#1f7a4d'),
  orange: swatch('#c2410c'),
  red: swatch('#c00000'),
  gray: swatch('#6b7280'),
  body: g(['M6 6h12', 'M6 12h12', 'M6 18h8']),
  lead: g(['M5 6h14', 'M5 12h14', 'M5 18h10']),
  caption: g(['M6 8h12', 'M8 13h8', 'M9 18h6']),
  codeish: IconCode,
  small: g(['M8 9h8', 'M9 14h6', 'M10 19h4']),
  upper: g(['M7 17l3-10h2l3 10', 'M8.5 13h5']),
  lower: g(['M8 16c0-4 8-4 8 0', 'M8 12h8']),
  title: g(['M6 17V7h3a3 3 0 0 1 0 6H6', 'M14 17V7h4']),
  half: g(['M6 6h12', 'M6 12h7', 'M6 18h12']),
  pangu: g(['M5 8h5', 'M14 8h5', 'M5 16h5', 'M14 16h5']),
  squeeze: g(['M8 7l-3 5 3 5', 'M16 7l3 5-3 5', 'M10 12h4']),
  sortLines: g(['M7 7h10', 'M7 12h7', 'M7 17h4', 'M17 15v4', 'M15 17l2 2 2-2']),
  uniqueLines: g(['M7 7h10', 'M7 12h10', 'M7 17h6', 'M16 16l3 3']),
  numberLines: IconListOrdered,
  spoiler: g(['M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6', 'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0']),
  dropCap: g(['M5 5h6v8H5z', 'M13 8h6', 'M13 13h6', 'M5 17h14']),
  center: alignCenter,
  left: alignLeft,
  right: alignRight,
  'wrap-left': g(['M4 6h7v8H4z', 'M13 7h7', 'M13 11h7', 'M4 17h16']),
  'wrap-right': g(['M13 6h7v8h-7z', 'M4 7h7', 'M4 11h7', 'M4 17h16']),
  solid: g(['M4 12h16']),
  dashed: g(['M4 12h3', 'M10.5 12h3', 'M17 12h3']),
  double: g(['M4 10h16', 'M4 14h16']),
  thick: g(['M4 10h16', 'M4 14h16', 'M4 12h16']),
}

const BY_LABEL: Record<string, Component> = {
  无序列表: IconList,
  有序列表: IconListOrdered,
  任务列表: IconListTask,
  任务: IconListTask,
  续号: g(['M5 12h10', 'M12 8l4 4-4 4', 'M19 7v10']),
  新列表: g(['M6 6h12', 'M6 12h8', 'M6 18h10', 'M16 15l3 3-3 3']),
  '修改编号值…': g(['M5 6h8', 'M5 12h6', 'M14 15l2 2 4-5']),
  '自定义起始…': g(['M5 6h8', 'M5 12h6', 'M14 15l2 2 4-5']),
  从此处重编号: g(['M7 7a7 7 0 1 1-2 5', 'M5 5v5h5']),
  '数字 1. 2. 3.': IconListOrdered,
  '字母 a. b. c.': BY_ID['lower-alpha'],
  '罗马 i. ii. iii.': BY_ID['lower-roman'],
  '1. 2. 3.': IconListOrdered,
  'a. b. c.': BY_ID['lower-alpha'],
  'A. B. C.': BY_ID['upper-alpha'],
  'i. ii. iii.': BY_ID['lower-roman'],
  'I. II. III.': BY_ID['upper-roman'],
  '一、二、三': BY_ID['cjk-ideographic'],
  增加缩进: IconIndent,
  减少缩进: IconOutdent,
  只缩进文字: IconFirstIndent,
  只减少缩进: IconOutdent,
  显示全部任务: IconListTask,
  只看未完成: check,
  左对齐: alignLeft,
  居中: alignCenter,
  居左: alignLeft,
  居右: alignRight,
  右对齐: alignRight,
  两端对齐: alignJustify,
  '首行缩进 2 字': IconFirstIndent,
  取消首行缩进: g(['M5 8h8', 'M7 12h12', 'M5 16h8', 'M16 6l3 3-3 3']),
  单选组: IconFormRadio,
  多选组: IconFormCheckbox,
  文本输入: IconFormText,
  多行文本: g(['M5 5h14v14H5z', 'M8 9h8', 'M8 13h8', 'M8 17h5']),
  数字输入: g(['M7 6h3v12', 'M6 18h6', 'M15 8h4', 'M15 13h4', 'M15 18h4']),
  下拉选择: g(['M5 6h14v12H5z', 'M15 12l-2 2-2-2']),
  日期: calendar,
  日期时间: g(['M5 5h9v6H5z', 'M5 8h9', 'M16 14v4', 'M16 14m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0']),
  开关: g(['M8 12a4 4 0 1 0 0.01 0', 'M8 8h8a4 4 0 0 1 0 8H8']),
  复制当前字段: copy,
  检查填写: check,
  表格: IconTable,
  从左到右: arrowRight,
  从右到左: arrowLeft,
  自动: g(['M6 8h12', 'M8 16h8', 'M12 8v8']),
  标准引用: IconQuote,
  强调引用: g(['M6 8h4v8H5', 'M14 8h4v8h-5', 'M4 6h16']),
  诗文引用: g(['M8 6h8', 'M7 12h10', 'M9 18h6']),
  手动填写: BY_ID.manual,
  自动注音: g(['M6 16c2-6 10-6 12 0', 'M9 10h.01', 'M15 10h.01']),
  直角: g(['M6 6h12v12H6z']),
  小圆: g(['M6 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z']),
  圆角: g(['M7 9a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z']),
  大圆: g(['M8 10a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4z']),
  胶囊: g(['M8 9h8a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6z']),
  无影: g(['M6 7h12v8H6z', 'M8 18h8']),
  轻影: g(['M6 6h10v8H6z', 'M9 17h9']),
  深影: g(['M5 5h10v8H5z', 'M9 16h10v3H9z']),
  无边: g(['M6 6h12v12H6z']),
  细边: g(['M6 6h12v12H6z', 'M6 6h12']),
  强调: g(['M5 5h14v14H5z', 'M8 9h8', 'M8 15h8']),
  转为半角: BY_ID.half,
  转为全角: fullWidth,
  中英文加空格: BY_ID.pangu,
  去掉多余空格: BY_ID.squeeze,
  按行排序: BY_ID.sortLines,
  去掉重复行: BY_ID.uniqueLines,
  给每行编号: IconListOrdered,
  全大写: BY_ID.upper,
  全小写: BY_ID.lower,
  词首大写: BY_ID.title,
  揭晓文字: BY_ID.spoiler,
  首字下沉: BY_ID.dropCap,
  左环绕: BY_ID['wrap-left'],
  右环绕: BY_ID['wrap-right'],
  '均分（1:1）': g(['M6 5h5v14H6z', 'M13 5h5v14h-5z']),
  '左窄右宽（1:2）': g(['M5 5h4v14H5z', 'M11 5h8v14h-8z']),
  '左宽右窄（2:1）': g(['M5 5h8v14H5z', 'M15 5h4v14h-4z']),
  '均分（1:1:1）': g(['M4 5h4v14H4z', 'M10 5h4v14h-4z', 'M16 5h4v14h-4z']),
  '中宽（1:2:1）': g(['M4 5h3v14H4z', 'M9 5h6v14H9z', 'M17 5h3v14h-3z']),
  四栏: IconColumns,
  五栏: IconColumns,
  六栏: IconColumns,
  实线: BY_ID.solid,
  虚线: BY_ID.dashed,
  双线: BY_ID.double,
  粗线: BY_ID.thick,
  全选当前块: g(['M5 5h14v14H5z', 'M8 12h8']),
  复制当前块: copy,
  上移一块: arrowUp,
  下移一块: arrowDown,
  今天日期: calendar,
  现在时间: clock,
  修改文字和链接: g(['M4 17l10-10 3 3L7 20H4z', 'M13 7l3 3']),
  专注模式: g(['M4 8h16', 'M7 8v8h10V8', 'M10 16v3', 'M14 16v3']),
  暗色编辑区: g(['M16 14a6 6 0 1 1-6-8 5 5 0 0 0 6 8z']),
  纸张参考线: g(['M6 3h9l3 3v15H6z', 'M15 3v3h3', 'M9 11h6', 'M9 15h6']),
  '宽度 100%': g(['M4 12h16', 'M7 9l-3 3 3 3', 'M17 9l3 3-3 3']),
  飞书样式: page,
  A3: page,
  A4: page,
  A5: page,
  '8K': page,
  B5: page,
  Letter: page,
  正文: BY_ID.body,
  导语: BY_ID.lead,
  题注体: BY_ID.caption,
  引用体: IconQuote,
  等宽说明: IconCode,
  注释小字: BY_ID.small,
  '一键生成…': chart,
  横向流程: g(['M4 9h5v6H4z', 'M15 9h5v6h-5z', 'M9 12h6', 'M13 10l2 2-2 2']),
  纵向流程: g(['M9 3h6v5H9z', 'M9 16h6v5H9z', 'M12 8v8', 'M10 14l2 2 2-2']),
  判断分支: g(['M12 4l6 6-6 6-6-6z', 'M12 16v4']),
  代码块: IconCode,
}

const FALLBACK: Record<string, Component> = {
  fontSize: IconFontSize,
  fontFamily: IconFontFamily,
  lineHeight: IconLineHeight,
  zoom,
  code: IconCode,
  page,
  template: IconTemplate,
  chart,
  columns: IconColumns,
}

/** 下拉子项图标。告示菜单不走这里。 */
export function menuGlyph(id = '', label = '', fallback = ''): Component | undefined {
  if (id && TABLE_MENU_ICONS[id]) return TABLE_MENU_ICONS[id]
  if (label && BY_LABEL[label]) return BY_LABEL[label]
  if (id && BY_ID[id]) return BY_ID[id]
  if (id === 'full') return page
  if (fallback && FALLBACK[fallback]) return FALLBACK[fallback]
  return undefined
}
