/**
 * echarts-gl 运行时（3D / GL 图表）。
 *
 * 与 echartsRuntime 分离的原因：
 * - echarts-gl 依赖 WebGL，且体积比常规图表大得多；
 * - 只有文档里真的插入了 3D / GL 图表时才动态加载，
 *   绝不进主包，也不进普通图表的 chunk。
 *
 * 注意：这里**不能**静态 import echartsRuntime —— 那样会把 echarts 拖进主包
 * （Vite 会提示 INEFFECTIVE_DYNAMIC_IMPORT）。所以改成运行时动态引入，
 * 保证 echarts 与 echarts-gl 各自独立成 chunk、按需下载。
 *
 * 兼容性：echarts-gl 2.1.0 的 peerDependencies 为 `echarts: ^5.1.2 || ^6.0.0`，
 * 与本仓库的 echarts 6.1.0 兼容（见 docs/rte-echarts-coverage.md）。
 */

type GlLoader = () => Promise<void>

let glPromise: Promise<void> | null = null

/** 加载并注册 echarts-gl（幂等）。 */
export const loadEchartsGl: GlLoader = () => {
  if (!glPromise) {
    glPromise = (async () => {
      const [runtime, charts, components] = await Promise.all([
        import('./echartsRuntime'),
        import('echarts-gl/charts'),
        import('echarts-gl/components'),
      ])
      const installs = [
        charts.Bar3DChart,
        charts.Line3DChart,
        charts.Scatter3DChart,
        charts.Lines3DChart,
        charts.Polygons3DChart,
        charts.SurfaceChart,
        charts.Map3DChart,
        charts.ScatterGLChart,
        charts.GraphGLChart,
        charts.FlowGLChart,
        charts.LinesGLChart,
        components.Grid3DComponent,
        components.Geo3DComponent,
        components.GlobeComponent,
      ]
      runtime.echarts.use(installs as unknown as Parameters<typeof runtime.echarts.use>[0])
    })().catch((err) => {
      // 失败后允许下次重试
      glPromise = null
      throw err
    })
  }
  return glPromise
}

/** 是否已经加载过 echarts-gl。 */
export function echartsGlLoaded(): boolean {
  return glPromise !== null
}
