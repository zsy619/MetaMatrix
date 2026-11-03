/**
 * 每种 series 类型的最小 fixture。
 *
 * 用途：净化器白名单的回归测试——每种类型都要能被放行，
 * 并且不能因为白名单收紧而把合法配置误删。
 */
import { DEMO_MAP_NAME } from './demoMap'

/** 类型 → 最小可用 option。 */
export const SERIES_FIXTURES: Record<string, Record<string, unknown>> = {
  bar: {
    title: { text: '柱状' },
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [1, 2] }],
  },
  line: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [1, 2], smooth: true, areaStyle: { opacity: 0.1 } }],
  },
  pie: {
    series: [{ type: 'pie', radius: '60%', data: [{ name: 'A', value: 1 }] }],
  },
  scatter: {
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'scatter', data: [[1, 2]] }],
  },
  radar: {
    radar: { indicator: [{ name: 'A', max: 10 }, { name: 'B', max: 10 }, { name: 'C', max: 10 }] },
    series: [{ type: 'radar', data: [{ value: [1, 2, 3] }] }],
  },
  effectScatter: {
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'effectScatter', data: [[1, 2]], rippleEffect: { scale: 3 } }],
  },
  candlestick: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'candlestick', data: [[10, 20, 8, 22], [20, 18, 15, 25]] }],
  },
  boxplot: {
    xAxis: { type: 'category', data: ['A'] },
    yAxis: { type: 'value' },
    series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5]] }],
  },
  heatmap: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'category', data: ['X', 'Y'] },
    visualMap: { min: 0, max: 10, show: false },
    series: [{ type: 'heatmap', data: [[0, 0, 5], [1, 1, 8]] }],
  },
  graph: {
    series: [
      {
        type: 'graph',
        layout: 'force',
        data: [{ name: 'A' }, { name: 'B' }],
        links: [{ source: 'A', target: 'B', value: 1 }],
      },
    ],
  },
  lines: {
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'lines', coordinateSystem: 'cartesian2d', polyline: true, data: [{ coords: [[1, 2], [3, 4]] }] }],
  },
  tree: {
    series: [{ type: 'tree', data: [{ name: 'root', children: [{ name: 'leaf' }] }] }],
  },
  treemap: {
    series: [{ type: 'treemap', data: [{ name: 'root', value: 10, children: [{ name: 'leaf', value: 4 }] }] }],
  },
  sunburst: {
    series: [{ type: 'sunburst', data: [{ name: 'root', value: 10, children: [{ name: 'leaf', value: 4 }] }] }],
  },
  parallel: {
    parallel: { layout: 'horizontal' },
    parallelAxis: [{ dim: 0, name: 'A' }, { dim: 1, name: 'B' }],
    series: [{ type: 'parallel', coordinateSystem: 'parallel', data: [[1, 2]] }],
  },
  sankey: {
    series: [
      {
        type: 'sankey',
        data: [{ name: 'A' }, { name: 'B' }],
        links: [{ source: 'A', target: 'B', value: 3 }],
      },
    ],
  },
  funnel: {
    series: [{ type: 'funnel', data: [{ name: 'A', value: 10 }, { name: 'B', value: 5 }] }],
  },
  gauge: {
    series: [{ type: 'gauge', min: 0, max: 100, data: [{ value: 50, name: '完成率' }] }],
  },
  pictorialBar: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'pictorialBar', symbol: 'roundRect', symbolSize: 12, data: [1, 2] }],
  },
  themeRiver: {
    singleAxis: { type: 'time' },
    series: [{ type: 'themeRiver', data: [['A', '2026-01-01', 10]] }],
  },
  custom: {
    xAxis: { type: 'category', data: ['A'] },
    yAxis: { type: 'value' },
    series: [{ type: 'custom', renderItem: 'preset:scatter', data: [[0, 5]] }],
  },
  map: {
    series: [{ type: 'map', map: DEMO_MAP_NAME, data: [{ name: '北部', value: 1 }] }],
  },
  chord: {
    series: [
      {
        type: 'chord',
        data: [{ name: 'A', value: 10 }, { name: 'B', value: 8 }],
        links: [{ source: 'A', target: 'B', value: 4 }],
      },
    ],
  },
  // —— 3D / GL ——
  bar3D: {
    grid3D: { boxWidth: 100 },
    xAxis3D: { type: 'category', data: ['A'] },
    yAxis3D: { type: 'value' },
    zAxis3D: { type: 'category', data: ['B'] },
    series: [{ type: 'bar3D', shading: 'color', data: [[0, 0, 5]] }],
  },
  scatter3D: {
    grid3D: { boxWidth: 100 },
    xAxis3D: { type: 'value' },
    yAxis3D: { type: 'value' },
    zAxis3D: { type: 'value' },
    series: [{ type: 'scatter3D', data: [[1, 2, 3]] }],
  },
  line3D: {
    grid3D: { boxWidth: 100 },
    xAxis3D: { type: 'value' },
    yAxis3D: { type: 'value' },
    zAxis3D: { type: 'value' },
    series: [{ type: 'line3D', data: [[1, 2, 3], [2, 3, 4]] }],
  },
  lines3D: {
    globe: { environment: 'none' },
    series: [{ type: 'lines3D', coordinateSystem: 'globe', data: [{ coords: [[116, 39, 10], [121, 31, 20]] }] }],
  },
  surface: {
    grid3D: { boxWidth: 100 },
    xAxis3D: { type: 'value' },
    yAxis3D: { type: 'value' },
    zAxis3D: { type: 'value' },
    series: [{ type: 'surface', shading: 'color', data: [[0, 0, 1], [1, 1, 2]] }],
  },
  map3D: {
    geo3D: { map: DEMO_MAP_NAME, regionHeight: 8 },
    series: [{ type: 'map3D', coordinateSystem: 'geo3D', data: [{ name: '北部', value: 1 }] }],
  },
  scatterGL: {
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'scatterGL', symbolSize: 10, data: [[1, 2, 3]] }],
  },
  linesGL: {
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'linesGL', coordinateSystem: 'cartesian2d', data: [{ coords: [[1, 2], [3, 4]] }] }],
  },
  flowGL: {
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'flowGL', coordinateSystem: 'cartesian2d', data: [[1, 1, 1, 1, 1]] }],
  },
  graphGL: {
    series: [
      {
        type: 'graphGL',
        layout: 'force',
        data: [{ name: 'A' }, { name: 'B' }],
        links: [{ source: 'A', target: 'B', value: 1 }],
      },
    ],
  },
}

/** 组件类 fixture（不是 series，但同样要过白名单）。 */
export const COMPONENT_FIXTURES: Record<string, Record<string, unknown>> = {
  dataset: {
    dataset: { source: [['a', 'b'], [1, 2]] },
    xAxis: { type: 'category' },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', datasetIndex: 0, encode: { x: 'a', y: 'b' } }],
  },
  dataZoom: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    dataZoom: [{ type: 'inside', start: 0, end: 50 }],
    series: [{ type: 'line', data: [1, 2] }],
  },
  visualMap: {
    visualMap: { min: 0, max: 10, inRange: { color: ['#fff', '#000'] } },
    series: [{ type: 'bar', data: [1, 2] }],
  },
  graphic: {
    graphic: [{ type: 'text', left: 'center', style: { text: '标注', fill: '#333' } }],
    series: [{ type: 'bar', data: [1, 2] }],
  },
  rich: {
    xAxis: { type: 'category', data: ['A'] },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: [1],
        label: {
          show: true,
          formatter: '{a|标题}{b|副标题}',
          rich: { a: { fontSize: 14, color: '#333' }, b: { fontSize: 11, color: '#999' } },
        },
      },
    ],
  },
  polar: {
    polar: { radius: ['20%', '70%'] },
    angleAxis: { type: 'category', data: ['A', 'B'] },
    radiusAxis: { type: 'value' },
    series: [{ type: 'bar', coordinateSystem: 'polar', data: [1, 2] }],
  },
  singleAxis: {
    singleAxis: { type: 'category', data: ['A', 'B'] },
    series: [{ type: 'themeRiver', data: [['A', '2026-01-01', 10]] }],
  },
  calendar: {
    calendar: { range: ['2026-01-01', '2026-01-31'] },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [[1, 2]] }],
  },
  matrix: {
    matrix: { x: { data: ['A'] }, y: { data: ['X'] } },
    series: [{ type: 'heatmap', coordinateSystem: 'matrix', data: [[0, 0, 5]] }],
  },
  geo: {
    geo: { map: DEMO_MAP_NAME },
    series: [{ type: 'scatter', coordinateSystem: 'geo', data: [[10, 20]] }],
  },
  parallelAxis: {
    parallel: { layout: 'horizontal' },
    parallelAxis: [{ dim: 0, name: 'A' }, { dim: 1, name: 'B' }],
    series: [{ type: 'parallel', coordinateSystem: 'parallel', data: [[1, 2]] }],
  },
  grid3D: {
    grid3D: { boxWidth: 100, boxDepth: 80 },
    xAxis3D: { type: 'value' },
    yAxis3D: { type: 'value' },
    zAxis3D: { type: 'value' },
    series: [{ type: 'scatter3D', data: [[1, 2, 3]] }],
  },
  geo3D: {
    geo3D: { map: DEMO_MAP_NAME, regionHeight: 8 },
    series: [{ type: 'map3D', coordinateSystem: 'geo3D', data: [{ name: '北部', value: 1 }] }],
  },
  globe: {
    globe: { environment: 'none' },
    series: [{ type: 'scatter3D', coordinateSystem: 'globe', data: [[116, 39, 10]] }],
  },
  toolbox: {
    toolbox: { feature: { saveAsImage: {}, restore: {} } },
    series: [{ type: 'bar', data: [1, 2] }],
  },
  markLine: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [1, 2], markLine: { data: [{ type: 'average' }] } }],
  },
  markPoint: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [1, 2], markPoint: { data: [{ type: 'max' }] } }],
  },
  markArea: {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [1, 2], markArea: { data: [[{ xAxis: 'A' }, { xAxis: 'B' }]] } }],
  },
}
