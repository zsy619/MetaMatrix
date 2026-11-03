/**
 * 3D / GL 图表（官方类别 29–39 共 11 种）。
 *
 * 与其它类别的差别：
 * - 依赖 echarts-gl（WebGL），渲染器必须是 Canvas；
 * - echarts-gl 只在插入 / 渲染 GL 图时动态加载，不进主包，也不进普通图表 chunk；
 * - 单测只做净化校验（jsdom 没有 WebGL），真实渲染由 e2e 在浏览器里验证。
 */
import { def, withTitle } from './helpers'
import { DEMO_MAP_NAME } from '../demoMap'
import type { EchartsTemplateDef } from '../types'

const GL_OPTIONS = { renderer: 'canvas', gl: true } as const

/** 3D 地球 */
const globe = def({
  id: 'globe',
  categoryId: 'globe',
  label: '3D 地球',
  hint: 'WebGL 地球 + 散点',
  chartType: 'scatter3D',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 地球', left: 'center' },
        globe: {
          environment: 'none',
          baseColor: '#2f6ea8',
          globeRadius: 60,
          showGraticule: true,
          showGroundAtmosphere: true,
          atmosphereColor: '#6fa8dc',
          atmosphereAlpha: 0.25,
          viewControl: { distance: 180, autoRotate: false },
          light: {
            main: { intensity: 1.1, shadow: false },
            ambient: { intensity: 0.6 },
          },
          itemStyle: { color: '#2f6ea8' },
        },
        series: [
          {
            name: '站点',
            type: 'scatter3D',
            coordinateSystem: 'globe',
            symbolSize: 8,
            itemStyle: { color: '#e05a4f' },
            data: [
              [116.4, 39.9, 20],
              [121.5, 31.2, 16],
              [113.3, 23.1, 12],
              [104.1, 30.6, 10],
              [-74.0, 40.7, 18],
            ],
          },
        ],
      },
      opts?.title,
      '3D 地球',
    ),
})

/** 3D 柱状图 */
const bar3D = def({
  id: 'bar3D',
  categoryId: 'bar3D',
  label: '3D 柱状图',
  hint: 'grid3D 坐标系',
  chartType: 'bar3D',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 柱状图', left: 'center' },
        tooltip: {},
        grid3D: {
          boxWidth: 100,
          boxDepth: 80,
          axisLine: { show: true },
          axisLabel: { show: true },
          viewControl: { distance: 180 },
        },
        xAxis3D: { type: 'category', data: ['一月', '二月', '三月', '四月'] },
        yAxis3D: { type: 'value' },
        zAxis3D: { type: 'category', data: ['产品', '研发'] },
        series: [
          {
            name: '销售额',
            type: 'bar3D',
            shading: 'color',
            barSize: 12,
            itemStyle: { color: '#4a7fb5' },
            data: [
              [0, 0, 120], [0, 0, 132], [1, 0, 101], [1, 0, 134],
              [2, 0, 90], [2, 0, 130], [3, 0, 110], [3, 0, 145],
            ],
          },
        ],
      },
      opts?.title,
      '3D 柱状图',
    ),
})

/** 3D 散点图 */
const scatter3D = def({
  id: 'scatter3D',
  categoryId: 'scatter3D',
  label: '3D 散点图',
  hint: 'grid3D 坐标系',
  chartType: 'scatter3D',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 散点图', left: 'center' },
        tooltip: {},
        grid3D: { boxWidth: 110, boxDepth: 90, viewControl: { distance: 170 } },
        xAxis3D: { type: 'value', name: 'X' },
        yAxis3D: { type: 'value', name: 'Y' },
        zAxis3D: { type: 'value', name: 'Z' },
        series: [
          {
            name: '样本',
            type: 'scatter3D',
            symbolSize: 10,
            itemStyle: { color: '#e05a4f' },
            data: [
              [10, 20, 30], [22, 14, 40], [31, 26, 22], [45, 38, 51], [52, 47, 33],
            ],
          },
        ],
      },
      opts?.title,
      '3D 散点图',
    ),
})

/** 3D 曲面 */
const surface = def({
  id: 'surface',
  categoryId: 'surface',
  label: '3D 曲面',
  hint: 'grid3D 上的曲面',
  chartType: 'surface',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 曲面', left: 'center' },
        tooltip: {},
        grid3D: { boxWidth: 120, boxDepth: 100, viewControl: { distance: 160 } },
        xAxis3D: { type: 'value', name: 'X' },
        yAxis3D: { type: 'value', name: 'Y' },
        zAxis3D: { type: 'value', name: 'Z' },
        series: [
          {
            name: '曲面',
            type: 'surface',
            shading: 'color',
            wireframe: { show: false },
            itemStyle: { opacity: 0.9 },
            data: [
              [0, 0, 10], [0, 1, 20], [0, 2, 30],
              [1, 0, 20], [1, 1, 35], [1, 2, 25],
              [2, 0, 30], [2, 1, 25], [2, 2, 40],
            ],
          },
        ],
      },
      opts?.title,
      '3D 曲面',
    ),
})

/** 3D 地图 */
const map3D = def({
  id: 'map3D',
  categoryId: 'map3D',
  label: '3D 地图',
  hint: 'geo3D + 内置示例地图',
  chartType: 'map3D',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 地图', left: 'center' },
        tooltip: {},
        geo3D: {
          map: DEMO_MAP_NAME,
          roam: true,
          regionHeight: 8,
          shading: 'color',
          itemStyle: { areaColor: '#dbe9f6', borderColor: '#4a7fb5' },
          emphasis: { itemStyle: { areaColor: '#9dc9e8' } },
          viewControl: { distance: 120 },
        },
        series: [
          {
            name: '区域',
            type: 'map3D',
            coordinateSystem: 'geo3D',
            // map3D 系列自身也要带 map（echarts-gl 用它来补齐区域列表）
            map: DEMO_MAP_NAME,
            data: [
              { name: '北部', value: 320 },
              { name: '西部', value: 240 },
              { name: '东部', value: 410 },
              { name: '南部', value: 180 },
            ],
          },
        ],
      },
      opts?.title,
      '3D 地图',
    ),
})

/** 3D 路径图 */
const lines3D = def({
  id: 'lines3D',
  categoryId: 'lines3D',
  label: '3D 路径图',
  hint: 'globe 上的航线',
  chartType: 'lines3D',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 路径图', left: 'center' },
        globe: {
          environment: 'none',
          baseColor: '#0e1b2c',
          globeRadius: 60,
          viewControl: { distance: 180 },
        },
        series: [
          {
            name: '航线',
            type: 'lines3D',
            coordinateSystem: 'globe',
            lineStyle: { width: 2, color: '#e05a4f', opacity: 0.9 },
            effect: { show: true, period: 4, trailLength: 0.4, symbol: 'arrow', symbolSize: 5 },
            data: [
              {
                coords: [
                  [116.4, 39.9, 10],
                  [121.5, 31.2, 20],
                  [139.7, 35.7, 30],
                ],
              },
              {
                coords: [
                  [-74.0, 40.7, 10],
                  [-118.2, 34.0, 20],
                  [0.1, 51.5, 30],
                ],
              },
            ],
          },
        ],
      },
      opts?.title,
      '3D 路径图',
    ),
})

/** 3D 折线图 */
const line3D = def({
  id: 'line3D',
  categoryId: 'line3D',
  label: '3D 折线图',
  hint: 'grid3D 上的折线',
  chartType: 'line3D',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: '3D 折线图', left: 'center' },
        tooltip: {},
        grid3D: { boxWidth: 120, boxDepth: 100, viewControl: { distance: 160 } },
        xAxis3D: { type: 'value', name: 'X' },
        yAxis3D: { type: 'value', name: 'Y' },
        zAxis3D: { type: 'value', name: 'Z' },
        series: [
          {
            name: '轨迹',
            type: 'line3D',
            lineStyle: { width: 4, color: '#4a7fb5' },
            data: [
              [0, 0, 10], [10, 12, 24], [20, 6, 32], [30, 18, 20], [40, 24, 38],
            ],
          },
        ],
      },
      opts?.title,
      '3D 折线图',
    ),
})

/** GL 散点图 */
const scatterGL = def({
  id: 'scatterGL',
  categoryId: 'scatterGL',
  label: 'GL 散点图',
  hint: 'GPU 加速散点',
  chartType: 'scatterGL',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: 'GL 散点图', left: 'center' },
        tooltip: {},
        grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'value' },
        series: [
          {
            name: '样本',
            type: 'scatterGL',
            symbolSize: 12,
            itemStyle: { color: '#4a7fb5', opacity: 0.85 },
            data: [
              [10, 8], [18, 15], [26, 22], [35, 28], [42, 36], [50, 41], [58, 49],
            ],
          },
        ],
      },
      opts?.title,
      'GL 散点图',
    ),
})

/** GL 路径图 */
const linesGL = def({
  id: 'linesGL',
  categoryId: 'linesGL',
  label: 'GL 路径图',
  hint: 'GPU 加速路径',
  chartType: 'linesGL',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: 'GL 路径图', left: 'center' },
        tooltip: {},
        grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
        xAxis: { type: 'value', min: 0, max: 100 },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          {
            name: '路径',
            type: 'linesGL',
            coordinateSystem: 'cartesian2d',
            polyline: true,
            lineStyle: { width: 4, color: '#e05a4f', opacity: 1 },
            effect: { show: true, period: 4, trailLength: 0.6, symbol: 'arrow', symbolSize: 8 },
            data: [
              { coords: [[10, 20], [30, 45], [40, 60], [60, 40], [80, 30]] },
              { coords: [[20, 80], [35, 60], [50, 40], [70, 55], [90, 70]] },
            ],
          },
        ],
      },
      opts?.title,
      'GL 路径图',
    ),
})

/** GL 矢量场图 */
const flowGL = def({
  id: 'flowGL',
  categoryId: 'flowGL',
  label: 'GL 矢量场图',
  hint: 'GPU 粒子流',
  chartType: 'flowGL',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: 'GL 矢量场图', left: 'center' },
        tooltip: {},
        grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
        xAxis: { type: 'value', min: 0, max: 100 },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          {
            name: '流场',
            type: 'flowGL',
            coordinateSystem: 'cartesian2d',
            supersampling: 2,
            particleType: 'line',
            itemStyle: { color: '#4a7fb5', opacity: 0.6 },
            data: [
              [30, 30, 10, 2, 2],
              [60, 60, -8, 3, -1],
            ],
          },
        ],
      },
      opts?.title,
      'GL 矢量场图',
    ),
})

/** GL 关系图 */
const graphGL = def({
  id: 'graphGL',
  categoryId: 'graphGL',
  label: 'GL 关系图',
  hint: 'GPU 加速力导向布局',
  chartType: 'graphGL',
  ...GL_OPTIONS,
  build: (opts) =>
    withTitle(
      {
        title: { text: 'GL 关系图', left: 'center' },
        tooltip: {},
        series: [
          {
            name: '关系',
            type: 'graphGL',
            layout: 'force',
            roam: true,
            draggable: true,
            symbolSize: 12,
            force: { repulsion: 180, edgeLength: 80 },
            lineStyle: { color: 'source', curveness: 0.2, width: 1.5 },
            label: { show: true, fontSize: 11 },
            data: [
              { name: '产品', value: 30 },
              { name: '设计', value: 20 },
              { name: '开发', value: 40 },
              { name: '测试', value: 15 },
              { name: '运营', value: 12 },
            ],
            links: [
              { source: '产品', target: '设计', value: 8 },
              { source: '产品', target: '开发', value: 10 },
              { source: '设计', target: '开发', value: 6 },
              { source: '开发', target: '测试', value: 9 },
              { source: '测试', target: '运营', value: 3 },
            ],
          },
        ],
      },
      opts?.title,
      'GL 关系图',
    ),
})

export const glTemplates: EchartsTemplateDef[] = [
  globe,
  bar3D,
  scatter3D,
  surface,
  map3D,
  lines3D,
  line3D,
  scatterGL,
  linesGL,
  flowGL,
  graphGL,
]
