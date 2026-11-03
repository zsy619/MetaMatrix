/**
 * echarts-gl 的类型声明（官方包没有自带 .d.ts）。
 *
 * 只声明用到的入口：echarts-gl/charts 提供 11 个 3D/GL 图表的 install 函数，
 * echarts-gl/components 提供 3D 坐标系 / 地球等组件的 install 函数。
 */
declare module 'echarts-gl/charts' {
  export const Bar3DChart: (registers: unknown) => void
  export const Line3DChart: (registers: unknown) => void
  export const Scatter3DChart: (registers: unknown) => void
  export const Lines3DChart: (registers: unknown) => void
  export const Polygons3DChart: (registers: unknown) => void
  export const SurfaceChart: (registers: unknown) => void
  export const Map3DChart: (registers: unknown) => void
  export const ScatterGLChart: (registers: unknown) => void
  export const GraphGLChart: (registers: unknown) => void
  export const FlowGLChart: (registers: unknown) => void
  export const LinesGLChart: (registers: unknown) => void
}

declare module 'echarts-gl/components' {
  export const Grid3DComponent: (registers: unknown) => void
  export const Geo3DComponent: (registers: unknown) => void
  export const GlobeComponent: (registers: unknown) => void
  export const Mapbox3DComponent: (registers: unknown) => void
  export const Maptalks3DComponent: (registers: unknown) => void
}
