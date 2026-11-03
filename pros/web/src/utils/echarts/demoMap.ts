/**
 * 内置示例地图（极小 GeoJSON）。
 *
 * 取舍说明（对应任务要求「地图选体积最小方案」）：
 * - 官方 echarts 5 起不再内置任何地图数据，完整 GeoJSON（例如 china.json）
 *   单文件就有数百 KB～数 MB，塞进主包不可接受；
 * - 走 URL 加载又依赖外部服务，离线/内网环境直接失效，且图表块是文档内容的一部分，
 *   不应该在渲染时去请求第三方地址；
 * - 因此这里内置一份「形状示意」的极小 GeoJSON（约 1KB，4 个矩形区域），
 *   只为让「地理坐标/地图」类目能真正跑通渲染链路；
 *   真实业务地图请在「编辑数据」里替换成自己的 map 数据源。
 */

/** 示例地图的 GeoJSON（4 个示意区域）。 */
export const DEMO_MAP_GEO_JSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '北部' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[2, 2], [98, 2], [98, 16], [2, 16], [2, 2]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: '西部' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[2, 20], [45, 20], [45, 80], [2, 80], [2, 20]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: '东部' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[55, 20], [98, 20], [98, 80], [55, 80], [55, 20]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: '南部' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[2, 84], [98, 84], [98, 98], [2, 98], [2, 84]]],
      },
    },
  ],
} as const

/** 内置示例地图的注册名。 */
export const DEMO_MAP_NAME = 'meta-demo'

/** 注册内置示例地图（重复注册会被 ECharts 忽略）。 */
export function registerDemoMap(echarts: {
  registerMap: (name: string, geoJson: Parameters<typeof import('echarts/core').registerMap>[1]) => void
}) {
  try {
    echarts.registerMap(DEMO_MAP_NAME, DEMO_MAP_GEO_JSON as unknown as Parameters<
      typeof import('echarts/core').registerMap
    >[1])
  } catch {
    /* 重复注册或运行环境缺少 geo 解析时忽略：地图类模板会退化为空图 */
  }
}
