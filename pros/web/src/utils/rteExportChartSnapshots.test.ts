// @vitest-environment happy-dom
/**
 * 图表导出保真：含 echarts 块的文档导出 md / docx / html 时必须是真图，不是占位文案。
 */
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import {
  buildExportHtmlWithCharts,
  collectChartSnapshots,
  embedChartSnapshots,
} from './rteExportChartSnapshots'
import { htmlToMarkdown } from './rteExportMd'
import { buildDocxBlob } from './rteExportDocx'
import { RTE_AFTER_EXPORT_EVENT, RTE_BEFORE_EXPORT_EVENT } from '../extensions/echartsBlock'

/** 1×1 透明 PNG（够用来断言「真的有图」）。 */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** 模拟编辑器 DOM：一个图表块 + NodeView 生成的白底快照。 */
function fakeEditorRoot(chartId = 'chart-1'): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="ProseMirror">
      <p>正文</p>
      <div class="rte-echarts-block" data-type="echarts-block" data-chart-id="${chartId}">
        <div class="rte-echarts-preview" style="width:640px;height:320px">
          <div class="rte-echarts-snapshot">
            <img class="rte-echarts-snapshot-img" alt="图表快照" src="${PNG_DATA_URL}" />
          </div>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(root)
  return root
}

/** 编辑器 getHTML() 的样子：图表是占位块，不是图。 */
const EDITOR_HTML = `<p>正文</p><div data-type="echarts-block" data-chart-type="line" data-chart-id="chart-1"><div class="rte-echarts-fallback">ECharts 图表（折线图）</div></div>`

describe('图表导出保真', () => {
  it('快照采集：拿到白底图地址与尺寸', () => {
    const root = fakeEditorRoot()
    const snapshots = collectChartSnapshots(root)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].id).toBe('chart-1')
    expect(snapshots[0].src).toContain('data:image/png')
    expect(snapshots[0].width).toBe(640)
    expect(snapshots[0].height).toBe(320)
  })

  it('HTML 嵌入：占位块换成 <img>，不再有「[图表]」占位文案', () => {
    const root = fakeEditorRoot()
    const html = embedChartSnapshots(EDITOR_HTML, collectChartSnapshots(root))
    expect(html).toContain('<img')
    expect(html).toContain('data:image/png')
    expect(html).not.toContain('ECharts 图表（折线图）')
    expect(html).not.toContain('data-type="echarts-block"')
  })

  it('buildExportHtmlWithCharts：派发 before/after 事件并产出带图 HTML', async () => {
    const root = fakeEditorRoot()
    const before = vi.fn()
    const after = vi.fn()
    window.addEventListener(RTE_BEFORE_EXPORT_EVENT, before)
    window.addEventListener(RTE_AFTER_EXPORT_EVENT, after)
    const html = await buildExportHtmlWithCharts({ editorHtml: EDITOR_HTML, root })
    window.removeEventListener(RTE_BEFORE_EXPORT_EVENT, before)
    window.removeEventListener(RTE_AFTER_EXPORT_EVENT, after)
    expect(before).toHaveBeenCalled()
    expect(after).toHaveBeenCalled()
    expect(html).toContain('<img')
    expect(html).not.toContain('ECharts 图表（折线图）')
  })

  it('Markdown 导出：是图片语法，不是占位文案', async () => {
    const root = fakeEditorRoot()
    const html = await buildExportHtmlWithCharts({ editorHtml: EDITOR_HTML, root })
    const md = htmlToMarkdown(html)
    expect(md).toContain('![')
    expect(md).toContain('data:image/png')
    expect(md).not.toContain('ECharts 图表（折线图）')
  })

  it('Word 导出：图片进 media 关系，不是 alt 文本', async () => {
    const root = fakeEditorRoot()
    const html = await buildExportHtmlWithCharts({ editorHtml: EDITOR_HTML, root })
    const blob = await buildDocxBlob({ title: '图表文档', bodyHtml: html })
    const bytes = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(bytes)
    const names = Object.keys(zip.files)
    expect(names.some((name) => name.startsWith('word/media/'))).toBe(true)
    const documentXml = await zip.file('word/document.xml')!.async('string')
    expect(documentXml).toContain('<w:drawing>')
    expect(documentXml).toContain('r:embed=')
    expect(documentXml).not.toContain('ECharts 图表（折线图）')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    expect(rels).toContain('relationships/image')
    const contentTypes = await zip.file('[Content_Types].xml')!.async('string')
    expect(contentTypes).toContain('image/png')
  })
})
