// @vitest-environment happy-dom
/**
 * 图表块异步渲染的竞态回归测试。
 *
 * 这里挂载真实 TipTap NodeView，但替换 ECharts、ResizeObserver 和
 * IntersectionObserver，以便精确控制「首次 GL 加载」与「二次渲染」的先后顺序，
 * 不依赖 happy-dom 并不具备的 WebGL 能力。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EchartsBlock } from './echartsBlock'

// vi.mock 工厂会提升到 import 之前执行，因此 Mock 也必须通过 vi.hoisted 提前创建。
const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  loadEchartsGl: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('../utils/echartsRuntime', () => ({
  echarts: { init: mocks.init },
}))

vi.mock('../utils/echartsGlRuntime', () => ({
  loadEchartsGl: mocks.loadEchartsGl,
}))

const GLOBE_OPTION = JSON.stringify({
  title: { text: '首次加载' },
  globe: { environment: 'none' },
  series: [
    {
      type: 'scatter3D',
      coordinateSystem: 'globe',
      data: [[116.4, 39.9, 20]],
    },
  ],
})

/** 可手动决定完成时机的 Promise，用来稳定复现异步加载期间的竞态。 */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 等待动态 import、await 链和 NodeView 更新全部进入微任务队列。 */
function flushAsync() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/** 构造一个位于视口下方的布局矩形，触发 IntersectionObserver 延迟渲染分支。 */
function outOfViewRect(): DOMRect {
  return {
    x: 0,
    y: 1200,
    top: 1200,
    right: 640,
    bottom: 1600,
    left: 0,
    width: 640,
    height: 400,
    toJSON: () => ({}),
  }
}

let editor: Editor | undefined
let host: HTMLDivElement | undefined
let resizeCallback: ResizeObserverCallback | undefined
let intersectionObservers: Array<{
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}>

beforeEach(() => {
  vi.clearAllMocks()
  resizeCallback = undefined
  intersectionObservers = []

  // ECharts 实例只保留 NodeView 会调用的方法；断言重点是 init / setOption 是否发生。
  mocks.init.mockReturnValue({
    setOption: mocks.setOption,
    resize: mocks.resize,
    dispose: mocks.dispose,
    getDataURL: vi.fn(() => ''),
  })

  // happy-dom 不会自动发出观察器回调，由每个测试按目标时序手动触发。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      constructor(_callback: IntersectionObserverCallback) {
        intersectionObservers.push(this)
      }
    },
  )

  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  editor?.destroy()
  editor = undefined
  host?.remove()
  host = undefined
  vi.unstubAllGlobals()
})

/** 新建只含一个 3D 地球的编辑器，返回其真实预览元素。 */
function mountGlobe(option = GLOBE_OPTION): HTMLElement {
  editor = new Editor({
    element: host,
    extensions: [StarterKit, EchartsBlock],
    content: '<p>正文</p>',
  })
  editor.commands.insertEchartsBlock({ chartType: 'globe', option })
  const preview = host!.querySelector('.rte-echarts-preview')
  if (!(preview instanceof HTMLElement)) throw new Error('没有找到图表预览元素')
  return preview
}

describe('图表块异步渲染竞态', () => {
  it('首次 GL 加载期间，视口外延迟渲染不会作废正在加载的任务', async () => {
    const glLoading = deferred<void>()
    mocks.loadEchartsGl.mockReturnValue(glLoading.promise)
    const preview = mountGlobe()

    // 首次 render 在零尺寸布局下通过视口检查，并停在 loadEchartsGl()。
    await vi.waitFor(() => expect(mocks.loadEchartsGl).toHaveBeenCalledTimes(1))
    expect(mocks.init).not.toHaveBeenCalled()

    // 模拟布局完成后 ResizeObserver 再触发 render；这次元素已在视口外，
    // 因而只应注册 IntersectionObserver，不应递增 renderSeq 并打断首次加载。
    Object.defineProperty(preview, 'clientWidth', { configurable: true, value: 640 })
    preview.getBoundingClientRect = () => outOfViewRect()
    expect(resizeCallback).toBeTypeOf('function')
    resizeCallback!([], {} as ResizeObserver)
    expect(intersectionObservers).toHaveLength(1)
    expect(intersectionObservers[0]!.observe).toHaveBeenCalledWith(preview)

    glLoading.resolve()
    await flushAsync()

    // 旧实现会在这里因 seq !== renderSeq 静默 return，导致以下两个调用都不发生。
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.setOption).toHaveBeenCalledTimes(1)
  })

  it('加载期间真正进入渲染的新任务仍会作废旧任务', async () => {
    const firstLoading = deferred<void>()
    const secondLoading = deferred<void>()
    mocks.loadEchartsGl
      .mockReturnValueOnce(firstLoading.promise)
      .mockReturnValueOnce(secondLoading.promise)
    const preview = mountGlobe()
    Object.defineProperty(preview, 'clientWidth', { configurable: true, value: 640 })
    await vi.waitFor(() => expect(mocks.loadEchartsGl).toHaveBeenCalledTimes(1))

    // 修改 option 会触发一次真正通过视口检查的 render，而不是仅注册 IO 的延迟任务。
    let pos = -1
    editor!.state.doc.descendants((node, at) => {
      if (node.type.name === 'echartsBlock' && pos < 0) pos = at
    })
    expect(pos).toBeGreaterThanOrEqual(0)
    const nextOption = JSON.parse(GLOBE_OPTION) as { title: { text: string } }
    nextOption.title.text = '最新配置'
    editor!.commands.updateEchartsBlock(pos, { option: JSON.stringify(nextOption) })
    await vi.waitFor(() => expect(mocks.loadEchartsGl).toHaveBeenCalledTimes(2))

    // 新任务先完成后可以渲染；旧任务随后完成时必须被序号检查丢弃。
    secondLoading.resolve()
    await flushAsync()
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.setOption).toHaveBeenCalledTimes(1)
    const renderedOption = mocks.setOption.mock.calls[0]?.[0] as { title?: { text?: string } }
    expect(renderedOption.title?.text).toBe('最新配置')

    firstLoading.resolve()
    await flushAsync()
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.setOption).toHaveBeenCalledTimes(1)
  })
})
