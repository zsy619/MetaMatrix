import { Node, mergeAttributes } from '@tiptap/core'
import {
  ECHARTS_CHART_TYPES,
  buildTemplateOption,
  safeParseEchartsOption,
  serializeEchartsOption,
  type EchartsChartType,
} from '../utils/rteEchartsOption'
import { ECHARTS_CATEGORIES } from '../utils/echarts/templates'
import { echartsRendererFor, needsEchartsGl, resolveEchartsRenderItems } from '../utils/echarts/prepare'
import { loadEchartsGl } from '../utils/echartsGlRuntime'
import {
  resolveDataSourceConfig,
  startChartDataPolling,
  type ChartDataPoller,
} from '../utils/echarts/chartDataRuntime'

/** 生成图表块 id（用于把自定义密钥绑定到具体图表）。 */
export function createChartId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    echartsBlock: {
      insertEchartsBlock: (attrs?: {
        option?: string
        chartType?: EchartsChartType
        theme?: string
        renderer?: string
        chartId?: string
        dataSource?: string
      }) => ReturnType
      /** 更新指定位置的图表块属性。 */
      updateEchartsBlock: (pos: number, attrs: Record<string, unknown>) => ReturnType
      /** 删除指定位置的图表块。 */
      deleteEchartsBlock: (pos: number) => ReturnType
    }
  }
}

/** 图表块默认高度（px）。 */
const DEFAULT_HEIGHT = 320
/** 导出/打印前后的自定义事件，NodeView 靠它做白底快照。 */
export const RTE_BEFORE_EXPORT_EVENT = 'rte:before-export'
export const RTE_AFTER_EXPORT_EVENT = 'rte:after-export'

let echartsLoader: Promise<typeof import('../utils/echartsRuntime')> | null = null
/** 懒加载 echarts：文档里没有图表块时完全不下载。 */
function loadEcharts() {
  if (!echartsLoader) {
    echartsLoader = import('../utils/echartsRuntime').then((mod) => mod)
  }
  return echartsLoader
}

function isChartType(value: unknown): value is EchartsChartType {
  return ECHARTS_CATEGORIES.some((item) => item.id === value)
}

function defaultOption(type: EchartsChartType): string {
  return serializeEchartsOption(buildTemplateOption(type))
}

/** 渲染时强制浅色、关闭动画：编辑态不跑 zrender 动画，打印/PDF 结果一致。 */
function renderOption(option: Record<string, unknown>): Record<string, unknown> {
  return {
    ...option,
    animation: false,
    animationDuration: 0,
    backgroundColor: '#ffffff',
  }
}

export const EchartsBlock = Node.create({
  name: 'echartsBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      option: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-option') || ''
          const parsed = safeParseEchartsOption(raw)
          return parsed.ok ? serializeEchartsOption(parsed.option) : raw
        },
        renderHTML: (attrs: { option?: string }) => ({
          'data-option': attrs.option || '',
        }),
      },
      chartType: {
        default: 'bar',
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-chart-type') || ''
          return isChartType(raw) ? raw : 'bar'
        },
        renderHTML: (attrs: { chartType?: string }) => ({
          'data-chart-type': isChartType(attrs.chartType) ? attrs.chartType : 'bar',
        }),
      },
      theme: {
        default: 'light',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-theme') || 'light',
        renderHTML: (attrs: { theme?: string }) => ({
          'data-theme': attrs.theme || 'light',
        }),
      },
      renderer: {
        default: 'svg',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-renderer') || 'svg',
        renderHTML: (attrs: { renderer?: string }) => ({
          'data-renderer': attrs.renderer || 'svg',
        }),
      },
      // 图表块稳定 id：属性面板定位图表块 + 自定义密钥绑定都用它。
      // 不写进导出 HTML 的敏感信息，只是一个随机标识。
      chartId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-chart-id') || '',
        renderHTML: (attrs: { chartId?: string }) => ({
          'data-chart-id': attrs.chartId || '',
        }),
      },
      // 数据接口配置（JSON 文本）。**不含明文密钥**，密钥存本地。
      dataSource: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-datasource') || '',
        renderHTML: (attrs: { dataSource?: string }) => ({
          'data-datasource': attrs.dataSource || '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="echarts-block"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as {
      option?: string
      chartType?: string
      theme?: string
      renderer?: string
      chartId?: string
      dataSource?: string
    }
    const chartType = isChartType(attrs.chartType) ? attrs.chartType : 'bar'
    const label = ECHARTS_CHART_TYPES.find((item) => item.value === chartType)?.label || '图表'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'echarts-block',
        class: 'rte-echarts-block',
        'data-option': attrs.option || '',
        'data-chart-type': chartType,
        'data-theme': attrs.theme || 'light',
        'data-renderer': attrs.renderer || 'svg',
        // 数据接口配置随图表块持久化（不含明文密钥，密钥只存本地）
        'data-chart-id': attrs.chartId || '',
        'data-datasource': attrs.dataSource || '',
        style: `min-height:${DEFAULT_HEIGHT}px`,
      }),
      ['div', { class: 'rte-echarts-fallback' }, `ECharts 图表（${label}）`],
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      let chart: import('../utils/echartsRuntime').EChartsInstance | null = null
      let chartRenderer: 'svg' | 'canvas' = 'svg'
      let resizeObserver: ResizeObserver | null = null
      let snapshotEl: HTMLDivElement | null = null
      let destroyed = false
      let renderSeq = 0

      const dom = document.createElement('div')
      dom.className = 'rte-echarts-block'
      dom.dataset.type = 'echarts-block'
      // 复制粘贴时浏览器抓的是 NodeView 的 DOM，data-* 必须在这里，
      // 否则复制出去的块再粘回来就没有图表数据了（与 renderHTML 保持同一套属性）。
      dom.dataset.option = current.attrs.option || ''
      dom.dataset.chartType = isChartType(current.attrs.chartType)
        ? current.attrs.chartType
        : 'bar'

      // 块内不再挂任何操作控件（类型下拉 / 编辑数据 / 删除）：
      // 图表的所有操作都走「属性面板」，块内只负责渲染。
      const previewEl = document.createElement('div')
      previewEl.className = 'rte-echarts-preview'
      previewEl.contentEditable = 'false'
      previewEl.style.height = `${DEFAULT_HEIGHT}px`

      /** 数据接口拉取失败时的提示。 */
      const dataErrorEl = document.createElement('div')
      dataErrorEl.className = 'rte-echarts-datasource-error'
      dataErrorEl.style.display = 'none'

      const hint = document.createElement('div')
      hint.className = 'rte-echarts-hint'
      hint.textContent = '图表内容不参与逐条修订；导出与打印按当前显示呈现。'

      dom.appendChild(previewEl)
      dom.appendChild(dataErrorEl)
      dom.appendChild(hint)

      const currentOption = (): Record<string, unknown> => {
        const parsed = safeParseEchartsOption(current.attrs.option || '')
        return parsed.ok ? parsed.option : {}
      }

      /** 接口拉到的数据（只影响显示，不写回文档）。 */
      let remoteOption: Record<string, unknown> | null = null
      let dataPoller: ChartDataPoller | null = null
      let dataSourceKey = ''

      /** 数据接口配置变了就重开轮询。 */
      const syncDataSource = () => {
        const config = resolveDataSourceConfig(current.attrs.dataSource)
        const key = JSON.stringify(config)
        if (key === dataSourceKey) return
        dataSourceKey = key
        dataPoller?.stop()
        dataPoller = null
        remoteOption = null
        dataErrorEl.style.display = 'none'
        if (!config.enabled || !config.url) return
        dataPoller = startChartDataPolling({
          option: currentOption,
          config,
          chartId: String(current.attrs.chartId || ''),
          onOption: (next) => {
            remoteOption = next
            void render()
          },
          onError: (message) => {
            dataErrorEl.textContent = `数据接口：${message}`
            dataErrorEl.style.display = 'block'
          },
        })
      }

      /** 只读态下收起提示条（图表仍然正常渲染）。 */
      const applyEditableState = () => {
        const editable = editor?.isEditable !== false
        hint.style.display = editable ? '' : 'none'
      }

      const render = async () => {
        if (destroyed || !previewEl) return
        const seq = (renderSeq += 1)
        const parsed = safeParseEchartsOption(current.attrs.option || '')
        if (!parsed.ok) {
          chart?.dispose()
          chart = null
          previewEl.innerHTML = ''
          // 用 ownerDocument：测试环境销毁后全局 document 可能已不存在
          const box = previewEl.ownerDocument.createElement('pre')
          box.className = 'rte-echarts-error'
          box.textContent = parsed.error || 'option 无法解析'
          previewEl.appendChild(box)
          return
        }
        // 接口拉到的数据优先（只影响显示，不写回文档）
        const effective = remoteOption || parsed.option
        try {
          const mod = await loadEcharts()
          // 3D / GL 图表：先按需加载 echarts-gl（不进主包，也不进普通图表 chunk）
          if (needsEchartsGl(effective)) {
            await loadEchartsGl()
          }
          // 加载期间可能又改了 option，旧的渲染结果直接丢掉
          if (destroyed || !previewEl || seq !== renderSeq) return
          const renderer = echartsRendererFor(effective)
          if (chart && chartRenderer !== renderer) {
            // 渲染器不能热切换（SVG ↔ Canvas），重建实例
            try {
              chart.dispose()
            } catch {
              /* 忽略销毁异常 */
            }
            chart = null
          }
          if (!chart) {
            // 面板折叠时容器宽度是 0，这时初始化会得到一张空图。
            // 先不初始化，等容器有宽度了（ResizeObserver 回调里再 render）再画。
            if (!previewEl.clientWidth) return
            previewEl.innerHTML = ''
            chartRenderer = renderer
            chart = mod.echarts.init(previewEl, undefined, {
              renderer,
              width: previewEl.clientWidth,
              height: DEFAULT_HEIGHT,
            })
          }
          // custom 系列的 renderItem 在文档里只存预设名，这里换成内置函数
          chart.setOption(renderOption(resolveEchartsRenderItems(effective)), { notMerge: true })
          chart.resize()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (previewEl && seq === renderSeq) {
            previewEl.innerHTML = ''
            const box = previewEl.ownerDocument.createElement('pre')
            box.className = 'rte-echarts-error'
            box.textContent = `图表渲染失败：${message}`
            previewEl.appendChild(box)
          }
        }
      }

      /** 容器尺寸变化：没初始化就补一次初始化，已初始化就 resize。 */
      const onResize = () => {
        try {
          if (!chart) {
            void render()
            return
          }
          chart.resize()
        } catch {
          /* 实例已销毁时忽略 */
        }
      }

      /** 导出/打印前：换成白底静态快照，避免动画残帧与主题差异。 */
      const takeSnapshot = () => {
        if (!chart || !previewEl || snapshotEl) return
        // 首选 PNG 快照（html2canvas 抓 PNG 最稳）；失败时退到内联 SVG 序列化。
        let url = ''
        try {
          url =
            chart.getDataURL({
              type: 'png',
              pixelRatio: 2,
              backgroundColor: '#ffffff',
            }) || ''
        } catch {
          url = ''
        }
        if (!url) {
          try {
            const svg = previewEl.querySelector('svg')
            if (!svg) return
            const markup = new XMLSerializer().serializeToString(svg)
            url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
          } catch {
            return
          }
        }
        try {
          snapshotEl = document.createElement('div')
          snapshotEl.className = 'rte-echarts-snapshot'
          const img = document.createElement('img')
          img.className = 'rte-echarts-snapshot-img'
          img.alt = '图表快照'
          img.src = url
          snapshotEl.appendChild(img)
          previewEl.appendChild(snapshotEl)
          previewEl.classList.add('is-snapshot')
        } catch {
          snapshotEl = null
        }
      }

      /** 导出/打印后：还原实时图表。 */
      const dropSnapshot = () => {
        snapshotEl?.remove()
        snapshotEl = null
        previewEl?.classList.remove('is-snapshot')
      }

      const onBeforeExport = () => takeSnapshot()
      const onAfterExport = () => dropSnapshot()
      window.addEventListener(RTE_BEFORE_EXPORT_EVENT, onBeforeExport)
      window.addEventListener(RTE_AFTER_EXPORT_EVENT, onAfterExport)

      /**
       * 选中本图表块（属性面板随之弹出）。
       *
       * 块内不再有操作控件，「选中 → 属性面板」是唯一入口，
       * 所以点图表本身就要把节点选中。
       */
      const selectSelf = () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null || !editor) return
        const selection = editor.state.selection as { from?: number; node?: { type?: { name?: string } } }
        if (selection.node?.type?.name === 'echartsBlock' && selection.from === pos) return
        try {
          editor.commands.setNodeSelection(pos)
        } catch {
          /* 位置无效时忽略 */
        }
      }

      // 图表内部交互（tooltip / legend）不抢编辑器光标；
      // 但要把图表块选中，属性面板才知道该操作哪一张图。
      previewEl.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        selectSelf()
      })

      applyEditableState()
      // 数据接口：配置在图表块属性里，启用后按间隔拉取
      syncDataSource()
      // 观察容器尺寸：折叠→展开、窗口缩放都能触发重画
      resizeObserver = new ResizeObserver(onResize)
      resizeObserver.observe(previewEl)
      void render()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'echartsBlock') return false
          const optionChanged = updated.attrs.option !== current.attrs.option
          current = updated
          if (optionChanged) {
            // 文档里的数据被改了：接口数据先让位，等下一次拉取再覆盖显示
            remoteOption = null
          }
          syncDataSource()
          dom.dataset.option = updated.attrs.option || ''
          dom.dataset.chartType = isChartType(updated.attrs.chartType)
            ? updated.attrs.chartType
            : 'bar'
          applyEditableState()
          void render()
          return true
        },
        ignoreMutation: () => true,
        destroy() {
          destroyed = true
          dataPoller?.stop()
          dataPoller = null
          window.removeEventListener(RTE_BEFORE_EXPORT_EVENT, onBeforeExport)
          window.removeEventListener(RTE_AFTER_EXPORT_EVENT, onAfterExport)
          resizeObserver?.disconnect()
          resizeObserver = null
          dropSnapshot()
          try {
            chart?.dispose()
          } catch {
            /* 已销毁时忽略 */
          }
          chart = null
        },
      }
    }
  },

  addCommands() {
    return {
      insertEchartsBlock:
        (attrs) =>
        ({ commands, state }) => {
          const chartType = isChartType(attrs?.chartType) ? attrs.chartType : 'bar'
          const option = attrs?.option
            ? (() => {
                const parsed = safeParseEchartsOption(attrs.option)
                return parsed.ok ? serializeEchartsOption(parsed.option) : attrs.option
              })()
            : defaultOption(chartType)
          const node = {
            type: this.name,
            attrs: {
              option,
              chartType,
              theme: attrs?.theme || 'light',
              renderer: attrs?.renderer || 'svg',
              chartId: attrs?.chartId || createChartId(),
              dataSource: attrs?.dataSource || '',
            },
          }
          // 插完图表后，选区会落在图表这个原子节点上。再插一次时
          // insertContent 会拿这个选区去「替换」，结果是把上一张图换掉。
          // 所以这里显式改成：选区在图表上时，插到它后面去。
          const selection = state.selection
          const selected = (selection as unknown as { node?: { type?: { name?: string }; nodeSize?: number } })
            .node
          if (selected?.type?.name === this.name) {
            const pos = selection.from + (selected.nodeSize || 1)
            return commands.insertContentAt(pos, node)
          }
          return commands.insertContent(node)
        },
      /** 更新指定位置的图表块属性（属性面板写回用）。 */
      updateEchartsBlock:
        (pos, attrs) =>
        ({ tr }) => {
          if (!Number.isInteger(pos) || pos < 0) return false
          const node = tr.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
          return true
        },
      /** 删除指定位置的图表块（属性面板删除用）。 */
      deleteEchartsBlock:
        (pos) =>
        ({ tr }) => {
          if (!Number.isInteger(pos) || pos < 0) return false
          const node = tr.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.delete(pos, pos + node.nodeSize)
          return true
        },
    }
  },
})
