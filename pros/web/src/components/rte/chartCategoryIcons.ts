/**
 * 图表类别的专属图标（39 类）。
 *
 * 之前下拉面板里所有类别都回退到同一个通用柱状图图标，
 * 39 个条目看起来一模一样；这里给每个类别画一张线稿 SVG，
 * 统一 24×24 视框、1.7 描边、currentColor 描边色，缩到 16px 仍可辨认。
 */
import { h, type Component } from 'vue'

type Shape =
  | { tag: 'path'; d: string }
  | { tag: 'circle'; cx: number; cy: number; r: number }
  | { tag: 'rect'; x: number; y: number; w: number; h: number; rx?: number }
  | { tag: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { tag: 'polyline'; points: string }

function icon(shapes: Shape[], opts?: { fill?: boolean; size?: number }): Component {
  const size = opts?.size ?? 16
  return {
    render() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: opts?.fill ? 'currentColor' : 'none',
          stroke: 'currentColor',
          'stroke-width': 1.7,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        shapes.map((shape) =>
          shape.tag === 'path'
            ? h('path', { d: shape.d })
            : shape.tag === 'circle'
              ? h('circle', { cx: shape.cx, cy: shape.cy, r: shape.r })
              : shape.tag === 'rect'
                ? h('rect', { x: shape.x, y: shape.y, width: shape.w, height: shape.h, rx: shape.rx ?? 0 })
                : shape.tag === 'line'
                  ? h('line', { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 })
                  : h('polyline', { points: shape.points }),
        ),
      )
    },
  }
}

const AXIS: Shape[] = [
  { tag: 'path', d: 'M4 19V5' },
  { tag: 'path', d: 'M4 19h16' },
]

/** 类别 id → 图标。键与 utils/echarts/templates 里的 category id 一致。 */
export const CHART_CATEGORY_ICONS: Record<string, Component> = {
  // —— 基础 ——
  line: icon([...AXIS, { tag: 'polyline', points: '5.5,15.5 9,10 13,13 19,6' }]),
  bar: icon([...AXIS, { tag: 'path', d: 'M8 16v-4' }, { tag: 'path', d: 'M12 16V8' }, { tag: 'path', d: 'M16 16v-6' }]),
  pie: icon([
    { tag: 'path', d: 'M12 3v9h9' },
    { tag: 'path', d: 'M12 3a9 9 0 1 0 9 9h-9' },
  ]),
  scatter: icon([
    { tag: 'path', d: 'M4 19h16' },
    { tag: 'circle', cx: 7.5, cy: 14.5, r: 1.7 },
    { tag: 'circle', cx: 12, cy: 9.5, r: 1.7 },
    { tag: 'circle', cx: 16.5, cy: 12.5, r: 1.7 },
    { tag: 'circle', cx: 14, cy: 5.5, r: 1.7 },
  ]),
  pictorialBar: icon([
    ...AXIS,
    { tag: 'path', d: 'M6 16v-4' },
    { tag: 'path', d: 'M12 16V8' },
    { tag: 'path', d: 'M18 16v-6' },
    { tag: 'rect', x: 10, y: 4, w: 4, h: 4, rx: 1 },
  ]),
  // —— 统计 ——
  boxplot: icon([
    { tag: 'rect', x: 6, y: 8, w: 12, h: 8, rx: 1.5 },
    { tag: 'path', d: 'M3 12h3' },
    { tag: 'path', d: 'M18 12h3' },
    { tag: 'path', d: 'M12 8v8' },
  ]),
  heatmap: icon([
    { tag: 'rect', x: 4, y: 5, w: 5, h: 4, rx: 1 },
    { tag: 'rect', x: 10, y: 5, w: 5, h: 4, rx: 1 },
    { tag: 'rect', x: 16, y: 5, w: 4, h: 4, rx: 1 },
    { tag: 'rect', x: 4, y: 11, w: 5, h: 4, rx: 1 },
    { tag: 'rect', x: 10, y: 11, w: 5, h: 4, rx: 1 },
    { tag: 'rect', x: 16, y: 11, w: 4, h: 4, rx: 1 },
    { tag: 'rect', x: 4, y: 17, w: 5, h: 3, rx: 1 },
    { tag: 'rect', x: 10, y: 17, w: 10, h: 3, rx: 1 },
  ]),
  themeRiver: icon([
    { tag: 'path', d: 'M4 8c4-3 8 3 12 0' },
    { tag: 'path', d: 'M4 13c4-3 8 3 12 0' },
    { tag: 'path', d: 'M4 18c4-3 8 3 12 0' },
  ]),
  gauge: icon([
    { tag: 'path', d: 'M4 17a8 8 0 1 1 16 0' },
    { tag: 'path', d: 'M12 17l4.5-5.5' },
    { tag: 'circle', cx: 12, cy: 17, r: 1.4 },
  ]),
  funnel: icon([
    { tag: 'path', d: 'M4 5h16l-6.5 7.5V19l-3 1.5v-8z' },
    { tag: 'path', d: 'M8 9h8' },
  ]),
  // —— 关系 ——
  graph: icon([
    { tag: 'circle', cx: 6, cy: 7, r: 2 },
    { tag: 'circle', cx: 18, cy: 6, r: 2 },
    { tag: 'circle', cx: 12, cy: 17.5, r: 2 },
    { tag: 'path', d: 'M7.6 8.6l2.9 6.9' },
    { tag: 'path', d: 'M16.4 7.6l-2.9 7.9' },
    { tag: 'path', d: 'M8 6.6l8-0.4' },
  ]),
  lines: icon([
    { tag: 'path', d: 'M4 17c3.5-7 6 2 9-4s5 1 7-5' },
    { tag: 'circle', cx: 4, cy: 17, r: 1.3 },
    { tag: 'circle', cx: 20, cy: 8, r: 1.3 },
  ]),
  sankey: icon([
    { tag: 'path', d: 'M4 6h4.5c3.5 0 3.5 6 7 6H20' },
    { tag: 'path', d: 'M4 12h4c3.5 0 3.5 6 7 6h5' },
    { tag: 'path', d: 'M4 18h3' },
    { tag: 'path', d: 'M17 12h3' },
  ]),
  chord: icon([
    { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
    { tag: 'path', d: 'M6.8 7.5a8.5 8.5 0 0 1 10.4 10' },
    { tag: 'path', d: 'M17.2 7.5a8.5 8.5 0 0 0-10.4 10' },
  ]),
  // —— 层级 ——
  tree: icon([
    { tag: 'path', d: 'M12 4v5' },
    { tag: 'path', d: 'M6 12h12' },
    { tag: 'path', d: 'M6 12v-3' },
    { tag: 'path', d: 'M18 12v-3' },
    { tag: 'path', d: 'M6 20v-4h12v4' },
    { tag: 'path', d: 'M12 9v3' },
  ]),
  treemap: icon([
    { tag: 'rect', x: 4, y: 4, w: 10, h: 8, rx: 1 },
    { tag: 'rect', x: 14, y: 4, w: 6, h: 8, rx: 1 },
    { tag: 'rect', x: 4, y: 12, w: 7, h: 8, rx: 1 },
    { tag: 'rect', x: 11, y: 12, w: 9, h: 8, rx: 1 },
  ]),
  sunburst: icon([
    { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
    { tag: 'circle', cx: 12, cy: 12, r: 4.5 },
    { tag: 'circle', cx: 12, cy: 12, r: 1.4 },
    { tag: 'path', d: 'M12 3.5v4' },
    { tag: 'path', d: 'M19.4 15.5l-3.4-1.8' },
    { tag: 'path', d: 'M4.6 15.5l3.4-1.8' },
  ]),
  // —— 地理 / 金融 ——
  map: icon([
    { tag: 'path', d: 'M12 21s6-5.6 6-10.1A6 6 0 1 0 6 10.9C6 15.4 12 21 12 21z' },
    { tag: 'circle', cx: 12, cy: 10.6, r: 2 },
  ]),
  candlestick: icon([
    { tag: 'path', d: 'M4 19h16' },
    { tag: 'rect', x: 6.5, y: 8, w: 3, h: 7, rx: 0.8 },
    { tag: 'path', d: 'M8 5v3' },
    { tag: 'path', d: 'M8 15v3' },
    { tag: 'rect', x: 13, y: 10, w: 3, h: 6, rx: 0.8 },
    { tag: 'path', d: 'M14.5 7v3' },
    { tag: 'path', d: 'M14.5 16v3' },
  ]),
  // —— 坐标系 ——
  radar: icon([
    { tag: 'path', d: 'M12 3l8.5 6-3.2 10H6.7L3.5 9z' },
    { tag: 'path', d: 'M12 8.5l4 3-1.6 5H9.6L8 11.5z' },
  ]),
  parallel: icon([
    { tag: 'path', d: 'M6 4v16' },
    { tag: 'path', d: 'M12 4v16' },
    { tag: 'path', d: 'M18 4v16' },
    { tag: 'polyline', points: '6,15 12,9 18,13' },
  ]),
  calendar: icon([
    { tag: 'rect', x: 4, y: 5, w: 16, h: 15, rx: 2 },
    { tag: 'path', d: 'M4 10h16' },
    { tag: 'path', d: 'M8 3v4' },
    { tag: 'path', d: 'M16 3v4' },
    { tag: 'path', d: 'M8 14h2' },
    { tag: 'path', d: 'M14 14h2' },
    { tag: 'path', d: 'M8 17.5h2' },
  ]),
  matrix: icon([
    { tag: 'path', d: 'M7 4v16' },
    { tag: 'path', d: 'M17 4v16' },
    { tag: 'path', d: 'M4 8h16' },
    { tag: 'path', d: 'M4 16h16' },
    { tag: 'circle', cx: 12, cy: 12, r: 1.4 },
  ]),
  // —— 组件 ——
  dataset: icon([
    { tag: 'path', d: 'M4 6.5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z' },
    { tag: 'path', d: 'M4 6.5v11c0 1.7 3.6 3 8 3s8-1.3 8-3v-11' },
    { tag: 'path', d: 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  ]),
  dataZoom: icon([
    { tag: 'path', d: 'M4 12h16' },
    { tag: 'rect', x: 8, y: 8.5, w: 8, h: 7, rx: 1.5 },
    { tag: 'path', d: 'M6 6V4h3' },
    { tag: 'path', d: 'M18 18v2h-3' },
  ]),
  graphic: icon([
    { tag: 'rect', x: 4, y: 5, w: 7, h: 6, rx: 1.2 },
    { tag: 'circle', cx: 16.5, cy: 8, r: 2.4 },
    { tag: 'path', d: 'M6 19l3.5-5.5L13 19z' },
  ]),
  rich: icon([
    { tag: 'path', d: 'M4 6h16' },
    { tag: 'path', d: 'M4 11h9' },
    { tag: 'path', d: 'M4 16h12' },
    { tag: 'rect', x: 16, y: 13.5, w: 4.5, h: 4.5, rx: 1 },
  ]),
  custom: icon([
    { tag: 'path', d: 'M4 18l4.5-6 3.5 2.5L20 6' },
    { tag: 'circle', cx: 8.5, cy: 12, r: 1.3 },
    { tag: 'path', d: 'M17.5 3l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z' },
  ]),
  // —— 3D·GL ——
  globe: icon([
    { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
    { tag: 'path', d: 'M3.5 12h17' },
    { tag: 'path', d: 'M12 3.5c3.2 3.2 3.2 13.8 0 17' },
    { tag: 'path', d: 'M12 3.5c-3.2 3.2-3.2 13.8 0 17' },
  ]),
  bar3D: icon([
    { tag: 'path', d: 'M4 19h16' },
    { tag: 'path', d: 'M6 19v-5l3.5-2 3.5 2v5' },
    { tag: 'path', d: 'M6 14l3.5 2 3.5-2' },
    { tag: 'path', d: 'M14.5 19v-8l3-1.7 3 1.7v8' },
    { tag: 'path', d: 'M14.5 11l3 1.7 3-1.7' },
  ]),
  scatter3D: icon([
    { tag: 'circle', cx: 6.5, cy: 16, r: 1.4 },
    { tag: 'circle', cx: 11, cy: 10.5, r: 2 },
    { tag: 'circle', cx: 15.5, cy: 14, r: 1.4 },
    { tag: 'circle', cx: 17.5, cy: 7, r: 1.7 },
    { tag: 'path', d: 'M4 19h16' },
  ]),
  surface: icon([
    { tag: 'path', d: 'M3 15c3-4 6 2 9-2s6 2 9-2' },
    { tag: 'path', d: 'M3 19c3-4 6 2 9-2s6 2 9-2' },
    { tag: 'path', d: 'M8 5v16' },
    { tag: 'path', d: 'M16 5v16' },
  ]),
  map3D: icon([
    { tag: 'path', d: 'M4 12l8-4 8 4-8 4z' },
    { tag: 'path', d: 'M4 12v6l8 4 8-4v-6' },
    { tag: 'path', d: 'M12 16v6' },
  ]),
  lines3D: icon([
    { tag: 'path', d: 'M4 18c5-9 9-1 15-11' },
    { tag: 'circle', cx: 4, cy: 18, r: 1.3 },
    { tag: 'circle', cx: 19, cy: 7, r: 1.3 },
  ]),
  line3D: icon([
    { tag: 'path', d: 'M4 19h16' },
    { tag: 'path', d: 'M4 19V5' },
    { tag: 'polyline', points: '6,15 10,11 14,13 19,6' },
  ]),
  scatterGL: icon([
    { tag: 'circle', cx: 6, cy: 8, r: 1.5 },
    { tag: 'circle', cx: 17, cy: 6.5, r: 1.5 },
    { tag: 'circle', cx: 12, cy: 16.5, r: 1.8 },
    { tag: 'path', d: 'M7.3 9l3.4 5.9' },
    { tag: 'path', d: 'M15.8 8l-2.6 6.7' },
    { tag: 'path', d: 'M7.4 7.5l8.2-0.7' },
  ]),
  linesGL: icon([
    { tag: 'path', d: 'M4 16c4-8 8 2 16-9' },
    { tag: 'path', d: 'M4 20c4-8 8 2 16-9' },
    { tag: 'path', d: 'M4 12c4-8 8 2 16-9' },
  ]),
  flowGL: icon([
    { tag: 'path', d: 'M4 9h6' },
    { tag: 'path', d: 'M8 7l2 2-2 2' },
    { tag: 'path', d: 'M11 15h7' },
    { tag: 'path', d: 'M16 13l2 2-2 2' },
    { tag: 'path', d: 'M4 19h6' },
    { tag: 'path', d: 'M8 17l2 2-2 2' },
  ]),
  graphGL: icon([
    { tag: 'path', d: 'M6 18l6-9 6 9z' },
    { tag: 'circle', cx: 6, cy: 18, r: 1.5 },
    { tag: 'circle', cx: 12, cy: 9, r: 1.5 },
    { tag: 'circle', cx: 18, cy: 18, r: 1.5 },
  ]),
}

/** 取类别图标；未知类别回退到通用图表图标。 */
export function chartCategoryIcon(categoryId: string): Component | undefined {
  return CHART_CATEGORY_ICONS[categoryId]
}
