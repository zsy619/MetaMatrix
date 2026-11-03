/**
 * 图表导出保真 e2e：md / docx / html 导出 + 打印预览。
 *
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 * 输出：RTE_BASELINE_DIR（默认 /workspace/outputs/metamatrix/shots/chart-export-fidelity）
 *   - samples/*.md / *.html / *.docx：真实导出产物
 *   - 01-print-preview.png：打印预览纸面截图
 *
 * 断言：导出物里有真实图表快照（data:image + <img> / ![]( ) / docx media），
 * 而不是「[图表]」这类占位文案。
 */
import pw from 'playwright-core'
import JSZip from 'jszip'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out =
  process.env.RTE_BASELINE_DIR || '/workspace/outputs/metamatrix/shots/chart-export-fidelity'
const samples = join(out, 'samples')
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(samples, { recursive: true })

const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const pageErrors = []
const isIgnorable = (text) => /favicon/i.test(text) || /Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!isIgnorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
})

await page.goto(`${web}/chart-panel-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 60000 })
// 等图表真的画出来（svg / canvas 渲染完）
await page.waitForFunction(
  () => {
    const blocks = document.querySelectorAll('.rte-echarts-block')
    if (!blocks.length) return false
    return Array.from(blocks).every(
      (b) => b.querySelector('.rte-echarts-preview svg, .rte-echarts-preview canvas'),
    )
  },
  null,
  { timeout: 60000 },
)
await page.waitForTimeout(800)

/** 1. 打印预览：纸面里要能看到图表（真图，不是空白块）。 */
await page.locator('button[title^="打印预览"]').first().click()
await page.waitForSelector('.rte-print-preview-paper', { timeout: 15000 })
await page.waitForTimeout(1200)
const preview = await page.evaluate(() => {
  const paper = document.querySelector('.rte-print-preview-paper')
  const imgs = Array.from(paper?.querySelectorAll('img') || [])
  return {
    html: paper?.innerHTML || '',
    imgCount: imgs.length,
    withDataUrl: imgs.filter((img) => (img.getAttribute('src') || '').startsWith('data:image')).length,
    loaded: imgs.filter((img) => img.naturalWidth > 0).length,
    placeholder: (paper?.textContent || '').includes('ECharts 图表'),
  }
})
log(
  '打印预览里有图表快照图',
  preview.imgCount > 0 && preview.withDataUrl > 0 && preview.loaded > 0 && !preview.placeholder,
  `img=${preview.imgCount} dataUrl=${preview.withDataUrl} loaded=${preview.loaded} placeholder=${preview.placeholder}`,
)
await page.locator('.rte-print-preview-paper').screenshot({ path: `${out}/01-print-preview.png` })
await page.screenshot({ path: `${out}/02-print-preview-full.png` })
// 存一份预览纸面的 HTML 样例
writeFileSync(join(samples, 'print-preview.html'), preview.html, 'utf8')
await page.locator('button.rte-modal-cancel').first().click()
await page.waitForTimeout(400)

/** 2. 导出 Markdown / HTML / Word。 */
async function downloadVia(action) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), action()])
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

// Markdown
const md = await downloadVia(() =>
  page.locator('button[title^="导出当前面板 Markdown"]').first().click(),
)
const mdText = (await import('node:fs')).readFileSync(md.path, 'utf8')
log(
  '导出 Markdown 是真图（![](data:image)）',
  mdText.includes('![') && mdText.includes('data:image') && !mdText.includes('ECharts 图表（'),
  `${md.name} ${mdText.length} 字节`,
)

// HTML
const html = await downloadVia(() => clickExportItem('导出 HTML'))
const htmlText = (await import('node:fs')).readFileSync(html.path, 'utf8')
log(
  '导出 HTML 是真图（<img src="data:image">）',
  htmlText.includes('<img') &&
    htmlText.includes('data:image') &&
    !htmlText.includes('ECharts 图表（'),
  `${html.name} ${htmlText.length} 字节`,
)

// Word
const docx = await downloadVia(() => clickExportItem('导出 Word'))
const zip = await JSZip.loadAsync(await (await import('node:fs')).promises.readFile(docx.path))
const names = Object.keys(zip.files)
const media = names.filter((name) => name.startsWith('word/media/'))
const documentXml = await zip.file('word/document.xml').async('string')
const rels = await zip.file('word/_rels/document.xml.rels').async('string')
log(
  '导出 Word 内嵌图表 media（不是占位文案）',
  media.length > 0 && documentXml.includes('<w:drawing>') && rels.includes('relationships/image'),
  `media=${media.join(',')} drawing=${documentXml.includes('<w:drawing>')}`,
)

// 把 Markdown 里的快照图存成 PNG，作为「导出物里真的有图」的证据
const mdImg = /!\[[^\]]*\]\((data:image\/png;base64,[A-Za-z0-9+/=]+)\)/.exec(mdText)
if (mdImg) {
  writeFileSync(join(samples, 'chart-snapshot-from-md.png'), Buffer.from(mdImg[1].split(',')[1], 'base64'))
  log('从 Markdown 里取出图表 PNG', true, 'samples/chart-snapshot-from-md.png')
} else {
  log('从 Markdown 里取出图表 PNG', false, 'Markdown 里没找到 base64 PNG')
}

// 导出结束后编辑器要还原（快照只是导出用的临时产物）
const leftover = await page.evaluate(
  () => document.querySelectorAll('.rte-echarts-snapshot-img').length,
)
log('导出后编辑器态已还原', leftover === 0, `残留快照 ${leftover} 个`)

if (pageErrors.length) {
  console.log('页面错误：')
  for (const message of pageErrors.slice(0, 10)) console.log('  ' + message)
}

await browser.close()
const failed = notes.filter((item) => !item.ok)
console.log(`输出目录：${out}`)
if (failed.length || pageErrors.length) process.exitCode = 1
