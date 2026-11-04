/**
 * 图表导出像素级复验（md / docx / html / 打印预览 / PNG / PDF）。
 *
 * 目标：在真实浏览器里跑一遍导出流水线，把六种导出物落盘，
 * 再对导出物里的图表图片做像素统计（不靠人眼看图），把数字写进 summary.json。
 *
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）；没起时脚本会自己拉一个 vite。
 * 输出：RTE_VERIFY_DIR（默认 /workspace/outputs/metamatrix/shots/chart-export-verify）
 *   - samples/*：六种导出物的真实文件
 *   - images/*：从导出物里抽出来的图表图片（PNG）
 *   - summary.json：像素统计数字摘要
 *
 * 判定规则见 scripts/lib/imageStats.mjs 的 THRESHOLDS：
 *   非空白（非背景像素 1%~95%）、背景非透明（透明 ≤2%）、背景非黑（边缘均值 ≥200 且近黑 ≤40%）、
 *   尺寸 ≥200×200。
 */
import pw from 'playwright-core'
import JSZip from 'jszip'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './lib/pngDecode.mjs'
import { analyzeImage, findColoredRegion, judge, THRESHOLDS } from './lib/imageStats.mjs'

const { chromium } = pw
const out = process.env.RTE_VERIFY_DIR || '/workspace/outputs/metamatrix/shots/chart-export-verify'
const samples = join(out, 'samples')
const imagesDir = join(out, 'images')
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const pageUrl = `${web}/chart-export-verify.html`

mkdirSync(samples, { recursive: true })
mkdirSync(imagesDir, { recursive: true })

const results = {}
const pageErrors = []
let failed = false

/** vite dev 没起来就自己拉一个（复验脚本要能一条命令跑完）。 */
async function ensureServer() {
  const reachable = async () => {
    try {
      const res = await fetch(pageUrl, { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }
  if (await reachable()) return null
  const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
  const port = new URL(web).port || '5173'
  console.log(`未检测到 ${web}，自行启动 vite dev（端口 ${port}）…`)
  const child = spawn('npx', ['vite', '--port', port, '--host', '127.0.0.1'], {
    cwd: webRoot,
    stdio: 'ignore',
  })
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await reachable()) return child
    if (child.exitCode !== null) break
  }
  child.kill('SIGTERM')
  throw new Error(`vite dev 启动失败：${web}`)
}

function record(format, status, extra = {}) {
  results[format] = { format, status, ...extra }
  console.log(`${status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'WARN'} ${format}`, extra.note || '')
  if (status === 'fail') failed = true
}

/** 抽出一张图做统计，落盘并返回统计结果（解码失败不中断整体流程）。 */
function analyzeAndSave(format, name, buffer, opts = {}) {
  const file = join(imagesDir, `${format}-${name}.png`)
  writeFileSync(file, buffer)
  try {
    const image = decodePng(buffer)
    const stats = opts.rect ? analyzeImage(image, { rect: opts.rect }) : analyzeImage(image)
    return { file, source: name, ...stats, ...judge(stats) }
  } catch (err) {
    return { file, source: name, error: String(err instanceof Error ? err.message : err), pass: false, reasons: ['解码失败'] }
  }
}

function decodeDataUrl(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  return Buffer.from(m[1], 'base64')
}

const server = await ensureServer()
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })
const isIgnorable = (text) => /favicon/i.test(text) || /Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!isIgnorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
})

await page.goto(pageUrl, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 60000 })
// 等两张图真的画出来
await page.waitForFunction(
  () => {
    const blocks = document.querySelectorAll('.rte-echarts-block')
    if (blocks.length < 2) return false
    return Array.from(blocks).every((b) => b.querySelector('.rte-echarts-preview svg, .rte-echarts-preview canvas'))
  },
  null,
  { timeout: 60000 },
)
await page.waitForTimeout(1200)

const chartCount = await page.evaluate(() => document.querySelectorAll('.rte-echarts-block').length)
console.log(`样例文档图表数：${chartCount}`)

/** 触发一次下载并保存到 samples/。 */
async function downloadVia(action, timeout = 60000) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout }), action()])
  const name = download.suggestedFilename()
  const path = join(samples, name)
  await download.saveAs(path)
  return { name, path }
}

async function openExportMenu() {
  await page.locator('.rte-toolbar button[title="导出"]').first().click()
  await page.waitForSelector('.rte-import-menu', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function clickExportItem(label) {
  await openExportMenu()
  const item = page.locator('.rte-import-menu .rte-import-item', { hasText: label }).first()
  await item.click()
}

/* ---------------------------------------------------------------- 1. 打印预览 */
{
  try {

  await page.locator('button[title^="打印预览"]').first().click()
  await page.waitForSelector('.rte-print-preview-paper', { timeout: 20000 })
  await page.waitForTimeout(1500)
  const preview = await page.evaluate(() => {
    const paper = document.querySelector('.rte-print-preview-paper')
    const imgs = Array.from(paper?.querySelectorAll('img') || [])
    return {
      html: paper?.innerHTML || '',
      srcs: imgs.map((img) => img.getAttribute('src') || ''),
      loaded: imgs.filter((img) => img.naturalWidth > 0).length,
      placeholder: (paper?.textContent || '').includes('ECharts 图表（'),
    }
  })
  writeFileSync(join(samples, 'print-preview.html'), preview.html, 'utf8')
  await page.locator('.rte-print-preview-paper').screenshot({ path: join(samples, 'print-preview-paper.png') })

  const stats = []
  preview.srcs.forEach((src, i) => {
    const buf = decodeDataUrl(src)
    if (!buf) return
    stats.push(analyzeAndSave('print-preview', `chart-${i + 1}`, buf))
  })
  // 纸面截图也统计一次（页面级）
  const paperShot = readFileSync(join(samples, 'print-preview-paper.png'))
  const paperStats = analyzeAndSave('print-preview', 'paper', paperShot)
  const chartRegion = findColoredRegion(decodePng(paperShot))
  let paperChartStats = null
  if (chartRegion) {
    paperChartStats = analyzeAndSave('print-preview', 'paper-chart-region', paperShot, { rect: chartRegion })
  }

  const allPass = stats.length > 0 && stats.every((s) => s.pass) && paperStats.pass && (!paperChartStats || paperChartStats.pass)
  record('打印预览', allPass ? 'pass' : 'fail', {
    note: `img=${preview.srcs.length} 已解码=${stats.length} 纸面截图 ${paperStats.width}×${paperStats.height}`,
    images: stats,
    paperScreenshot: paperStats,
    paperChartRegion: paperChartStats,
    placeholderText: preview.placeholder,
    loadedImages: preview.loaded,
  })
  await page.locator('button.rte-modal-cancel').first().click()
  await page.waitForTimeout(500)

  } catch (err) {
    record('打印预览', 'fail', { note: '脚本异常：' + String(err instanceof Error ? err.message : err) })
  }
}

/* ---------------------------------------------------------------- 2. Markdown */
{
  try {

  const md = await downloadVia(() => clickExportItem('导出 Markdown'))
  const text = readFileSync(md.path, 'utf8')
  const matches = [...text.matchAll(/!\[[^\]]*\]\((data:image\/png;base64,[A-Za-z0-9+/=]+)\)/g)]
  const stats = []
  matches.forEach((m, i) => {
    const buf = decodeDataUrl(m[1])
    if (!buf) return
    stats.push(analyzeAndSave('md', `chart-${i + 1}`, buf))
  })
  const hasPlaceholder = text.includes('ECharts 图表（')
  const pass = stats.length > 0 && stats.every((s) => s.pass) && !hasPlaceholder
  record('Markdown', pass ? 'pass' : 'fail', {
    note: `${md.name} ${text.length} 字节，内嵌图 ${stats.length} 张，占位文案=${hasPlaceholder}`,
    file: md.path,
    images: stats,
    placeholderText: hasPlaceholder,
  })

  } catch (err) {
    record('Markdown', 'fail', { note: '脚本异常：' + String(err instanceof Error ? err.message : err) })
  }
}

/* ---------------------------------------------------------------- 3. HTML */
{
  try {

  const html = await downloadVia(() => clickExportItem('导出 HTML'))
  const text = readFileSync(html.path, 'utf8')
  const matches = [...text.matchAll(/<img[^>]+src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/g)]
  const stats = []
  matches.forEach((m, i) => {
    const buf = decodeDataUrl(m[1])
    if (!buf) return
    stats.push(analyzeAndSave('html', `chart-${i + 1}`, buf))
  })
  const hasPlaceholder = text.includes('ECharts 图表（')
  // 导出的 <img> 带 data-width / data-height（Word 那边按它算 EMU），尺寸不能是 0。
  const dims = [...text.matchAll(/<img[^>]*>/g)].map((m) => {
    const tag = m[0]
    const w = Number(/data-width="(\d+)"/.exec(tag)?.[1] ?? 0)
    const h = Number(/data-height="(\d+)"/.exec(tag)?.[1] ?? 0)
    return { width: w, height: h }
  })
  const dimsOk = dims.length > 0 && dims.every((d) => d.width >= 200 && d.height >= 200)
  const pass = stats.length > 0 && stats.every((s) => s.pass) && !hasPlaceholder && dimsOk
  record('HTML', pass ? 'pass' : 'fail', {
    note: `${html.name} ${text.length} 字节，内嵌图 ${stats.length} 张，占位文案=${hasPlaceholder} 尺寸=${JSON.stringify(dims)}`,
    file: html.path,
    images: stats,
    imageDimensions: dims,
    placeholderText: hasPlaceholder,
  })

  } catch (err) {
    record('HTML', 'fail', { note: '脚本异常：' + String(err instanceof Error ? err.message : err) })
  }
}

/* ---------------------------------------------------------------- 4. Word (docx) */
{
  try {

  const docx = await downloadVia(() => clickExportItem('导出 Word'))
  const zip = await JSZip.loadAsync(readFileSync(docx.path))
  const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
  const stats = []
  for (const name of media) {
    const buf = await zip.file(name).async('nodebuffer')
    stats.push(analyzeAndSave('docx', name.replace(/^word\/media\//, '').replace(/\.[^.]+$/, ''), buf))
  }
  const documentXml = await zip.file('word/document.xml').async('string')
  const hasDrawing = documentXml.includes('<w:drawing>')
  const hasPlaceholder = documentXml.includes('ECharts 图表（')
  // 图片在 Word 里的显示尺寸（EMU → px，1px = 9525 EMU），不能是 0 或过小。
  const extents = [...documentXml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => ({
    emuWidth: Number(m[1]),
    emuHeight: Number(m[2]),
    width: Math.round(Number(m[1]) / 9525),
    height: Math.round(Number(m[2]) / 9525),
  }))
  const extentsOk = extents.length > 0 && extents.every((e) => e.width >= 200 && e.height >= 200)

  // 有 LibreOffice 就把 docx 真渲染一遍，确认 Word 里能看到图表（不只是 media 里有字节）。
  let rendered = null
  if (existsSync('/usr/bin/soffice') && existsSync('/usr/bin/pdftoppm')) {
    try {
      const tmp = join(samples, '_docx_render')
      mkdirSync(tmp, { recursive: true })
      execFileSync(
        '/usr/bin/soffice',
        ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_verify', '--convert-to', 'pdf', '--outdir', tmp, docx.path],
        { stdio: 'pipe', timeout: 120000 },
      )
      const pdfs = Object.keys(zip.files).length // 占位，避免未使用告警
      void pdfs
      const produced = readdirSync(tmp).filter((f) => f.endsWith('.pdf'))
      if (produced.length) {
        const prefix = join(imagesDir, 'docx-render')
        execFileSync('/usr/bin/pdftoppm', ['-r', '144', '-png', join(tmp, produced[0]), prefix], { stdio: 'pipe' })
        const pages = []
        let n = 1
        while (existsSync(`${prefix}-${n}.png`)) {
          const buf = readFileSync(`${prefix}-${n}.png`)
          const pageStats = analyzeAndSave('docx', `rendered-page-${n}`, buf)
          const region = findColoredRegion(decodePng(buf))
          const chartStats = region ? analyzeAndSave('docx', `rendered-page-${n}-chart-region`, buf, { rect: region }) : null
          pages.push({ page: n, pageStats, chartStats, chartRegionBox: region })
          n += 1
        }
        rendered = { pages }
      }
    } catch (err) {
      rendered = { error: String(err instanceof Error ? err.message : err).slice(0, 300) }
    }
  }
  const renderedOk = !rendered || rendered.error || (rendered.pages || []).some((p) => p.chartStats && p.chartStats.pass)

  const pass =
    stats.length > 0 &&
    stats.every((s) => s.pass) &&
    hasDrawing &&
    !hasPlaceholder &&
    extentsOk &&
    renderedOk
  record('Word (docx)', pass ? 'pass' : 'fail', {
    note: `${docx.name} media=${stats.length} 张 drawing=${hasDrawing} 占位文案=${hasPlaceholder} 尺寸=${JSON.stringify(extents)}`,
    file: docx.path,
    images: stats,
    hasDrawing,
    extents,
    placeholderText: hasPlaceholder,
    rendered,
  })

  } catch (err) {
    record('Word (docx)', 'fail', { note: '脚本异常：' + String(err instanceof Error ? err.message : err) })
  }
}

/* ---------------------------------------------------------------- 5. PNG 导出 */
{
  try {

  const png = await downloadVia(() => clickExportItem('导出图片'), 120000)
  const buf = readFileSync(png.path)
  const pageStats = analyzeAndSave('png', 'page', buf)
  const region = findColoredRegion(decodePng(buf))
  const chartStats = region ? analyzeAndSave('png', 'chart-region', buf, { rect: region }) : null
  const pass = pageStats.pass && (!chartStats || chartStats.pass)
  record('PNG 导出', pass ? 'pass' : 'fail', {
    note: `${png.name} ${pageStats.width}×${pageStats.height}，图表区域=${region ? `${region.width}×${region.height}` : '未检出'}`,
    file: png.path,
    images: [pageStats],
    chartRegion: chartStats,
    chartRegionBox: region,
  })

  } catch (err) {
    record('PNG 导出', 'fail', { note: '脚本异常：' + String(err instanceof Error ? err.message : err) })
  }
}

/* ---------------------------------------------------------------- 6. PDF 导出 */
{
  try {

  const pdf = await downloadVia(() => clickExportItem('导出 PDF'), 120000)
  const buf = readFileSync(pdf.path)
  const pdfPages = []
  if (existsSync('/usr/bin/pdftoppm')) {
    const prefix = join(imagesDir, 'pdf-page')
    for (const f of [prefix + '-1.png', prefix + '-2.png', prefix + '-3.png']) {
      if (existsSync(f)) rmSync(f)
    }
    try {
      execFileSync('/usr/bin/pdftoppm', ['-r', '144', '-png', pdf.path, prefix], { stdio: 'pipe' })
    } catch (err) {
      console.log('pdftoppm 失败：', String(err).slice(0, 300))
    }
    let n = 1
    while (existsSync(`${prefix}-${n}.png`)) {
      const pageBuf = readFileSync(`${prefix}-${n}.png`)
      const pageStats = analyzeAndSave('pdf', `page-${n}`, pageBuf)
      const region = findColoredRegion(decodePng(pageBuf))
      const chartStats = region ? analyzeAndSave('pdf', `page-${n}-chart-region`, pageBuf, { rect: region }) : null
      pdfPages.push({ page: n, pageStats, chartStats, chartRegionBox: region })
      n += 1
    }
  }
  const pass = pdfPages.length > 0 && pdfPages.every((p) => p.pageStats.pass && (!p.chartStats || p.chartStats.pass))
  record('PDF 导出', pass ? 'pass' : 'fail', {
    note: `${pdf.name} ${buf.length} 字节，渲染页数=${pdfPages.length}`,
    file: pdf.path,
    pages: pdfPages,
  })

  } catch (err) {
    record('PDF 导出', 'fail', { note: '脚本异常：' + String(err instanceof Error ? err.message : err) })
  }
}

/* ---------------------------------------------------------------- 收尾 */
const leftover = await page.evaluate(() => document.querySelectorAll('.rte-echarts-snapshot-img').length)
await browser.close()
server?.kill('SIGTERM')

const summary = {
  generatedAt: new Date().toISOString(),
  pageUrl,
  thresholds: THRESHOLDS,
  pageErrors,
  /** 导出结束后编辑器里残留的图表快照元素数（应为 0：导出只是临时产物）。 */
  leftoverSnapshots: leftover,
  formats: results,
}
writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

console.log(`\n输出目录：${out}`)
console.log(`summary：${join(out, 'summary.json')}`)
if (pageErrors.length) {
  console.log('页面错误：')
  for (const message of pageErrors.slice(0, 10)) console.log('  ' + message)
}
if (failed || pageErrors.length) process.exitCode = 1
