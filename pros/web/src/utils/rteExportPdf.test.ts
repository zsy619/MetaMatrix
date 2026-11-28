// @vitest-environment happy-dom
/**
 * 导出安全测试不创建数百页真实 Canvas：
 * - 分页算法用纯高度验证 200 / 201 页及剩余正文；
 * - 位图预算在调用 html2canvas 前验证；
 * - 取消用可控的延迟栅格化任务验证，覆盖“取消后底层才返回”的竞态。
 */
import { describe, expect, it, vi } from 'vitest'
import type html2canvas from 'html2canvas'
import {
  ExportPixelBudgetError,
  assertRasterPixelBudget,
  planPdfSlices,
  rasterizeElementForExport,
  type ExportProgress,
} from './rteExportPdf'

function fakeElement(width = 100, height = 100): HTMLElement {
  return {
    scrollWidth: width,
    scrollHeight: height,
    clientWidth: width,
    clientHeight: height,
  } as HTMLElement
}

function fakeCanvas(width = 200, height = 200): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement
}

describe('PDF 分页完整性', () => {
  it('200 页边界完整规划，不把页数当作成功截断条件', () => {
    const slices = planPdfSlices({ canvasHeight: 20_000, pagePx: 100 })
    expect(slices).toHaveLength(200)
    expect(slices.every(height => height === 100)).toBe(true)
    expect(slices.reduce((sum, height) => sum + height, 0)).toBe(20_000)
  })

  it('201 页边界继续导出最后一页', () => {
    const slices = planPdfSlices({ canvasHeight: 20_100, pagePx: 100 })
    expect(slices).toHaveLength(201)
    expect(slices[200]).toBe(100)
    expect(slices.reduce((sum, height) => sum + height, 0)).toBe(20_100)
  })

  it('超过 200 页且末尾有余量时保留剩余内容', () => {
    const slices = planPdfSlices({ canvasHeight: 20_050, pagePx: 100 })
    expect(slices).toHaveLength(201)
    expect(slices.at(-1)).toBe(50)
    expect(slices.reduce((sum, height) => sum + height, 0)).toBe(20_050)
  })

  it('保留强制分页与软分页，同时覆盖全部正文高度', () => {
    const slices = planPdfSlices({
      canvasHeight: 260,
      pagePx: 100,
      forcedBreaks: [80],
      softBreak: (_startY, preferredEndY) => preferredEndY - 10,
    })
    // 第一页走显式分页；第二页在 170 处软分页；最后的 90px 必须形成尾页。
    expect(slices).toEqual([80, 90, 90])
    expect(slices.reduce((sum, height) => sum + height, 0)).toBe(260)
  })
})

describe('PNG / PDF 栅格化预算与取消', () => {
  it('预栅格化超预算时明确报错且不调用重型栅格化', async () => {
    const rasterize = vi.fn(async () => fakeCanvas())
    const promise = rasterizeElementForExport(
      fakeElement(1_000, 1_000),
      { scale: 2, maxPixels: 1_000_000 },
      rasterize as unknown as typeof html2canvas,
    )
    await expect(promise).rejects.toBeInstanceOf(ExportPixelBudgetError)
    await expect(promise).rejects.toThrow('未生成不完整文件')
    expect(rasterize).not.toHaveBeenCalled()
  })

  it('真实 Canvas 尺寸超过预算时同样拒绝，不静默缩小内容', () => {
    expect(() => assertRasterPixelBudget(2_001, 500, 1, 1_000_000)).toThrow(ExportPixelBudgetError)
  })

  it('底层栅格化在取消后才完成时仍返回 AbortError', async () => {
    const controller = new AbortController()
    let finishRasterize!: (canvas: HTMLCanvasElement) => void
    const rasterize = vi.fn(
      () => new Promise<HTMLCanvasElement>(resolve => {
        finishRasterize = resolve
      }),
    )
    const pending = rasterizeElementForExport(
      fakeElement(),
      { scale: 2, signal: controller.signal },
      rasterize as unknown as typeof html2canvas,
    )
    expect(rasterize).toHaveBeenCalledTimes(1)

    controller.abort()
    finishRasterize(fakeCanvas())
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('已取消任务不会启动栅格化，正常任务会报告实际阶段进度', async () => {
    const cancelled = new AbortController()
    cancelled.abort()
    const rasterize = vi.fn(async () => fakeCanvas())
    await expect(
      rasterizeElementForExport(
        fakeElement(),
        { signal: cancelled.signal },
        rasterize as unknown as typeof html2canvas,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(rasterize).not.toHaveBeenCalled()

    const progress: ExportProgress[] = []
    await rasterizeElementForExport(
      fakeElement(),
      { scale: 2, maxPixels: 40_000, onProgress: value => progress.push(value) },
      rasterize as unknown as typeof html2canvas,
    )
    expect(progress.map(value => value.phase)).toEqual(['prepare', 'rasterize', 'rasterize'])
    expect(progress.at(-1)).toMatchObject({ completed: 1, percent: 90 })
  })
})
