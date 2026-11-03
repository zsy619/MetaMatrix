/**
 * ECharts 模板真实渲染 e2e（39 类，含 WebGL 的 3D / GL）。
 *
 * 与 rte-echarts-e2e.mjs 的分工：
 * - rte-echarts-e2e.mjs 需要 API + 前端都跑起来，覆盖「工具栏图表分组 → 插入 → 渲染」；
 * - 本脚本只要前端（vite dev），用 echarts-preview.html 把 39 类模板逐个渲染，
 *   验证 SVG / WebGL 真渲染并截图（GL 在 jsdom 里跑不了，只能在这里验）。
 *
 * 前置：
 *   RTE_WEB_URL   前端地址，默认 http://127.0.0.1:5173
 *   RTE_BASELINE_DIR  截图输出目录
 *   CHROME_PATH   浏览器可执行文件，默认 /usr/bin/google-chrome
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // 无显卡环境用 SwiftShader 跑 WebGL（3D / GL 图要靠它）
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
})
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
const pageErrors = []
/**
 * 预览页没有 favicon，浏览器自己发的那次请求会报 404，与渲染无关。
 * 真正的资源 404 由下面的 response 监听单独记录（带 URL）。
 */
const isIgnorable = (text) => /favicon/i.test(text) || /Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!isIgnorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
})
page.on('response', (res) => {
  if (res.status() >= 400 && !isIgnorable(res.url())) {
    pageErrors.push(`HTTP ${res.status()} ${res.url()}`)
  }
})

await page.goto(`${web}/echarts-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__ECHARTS_PREVIEW_DONE__ === true, null, { timeout: 120000 })

const results = await page.evaluate(() => window.__ECHARTS_PREVIEW_RESULT__ || [])
const failed = results.filter((item) => !item.ok)
const glResults = results.filter((item) => item.renderer === 'canvas')
console.log(`模板总数：${results.length}`)
console.log(`Canvas（3D/GL）模板：${glResults.length}，其中失败 ${glResults.filter((i) => !i.ok).length}`)
for (const item of failed) {
  console.log(`FAIL ${item.categoryId}/${item.label}：${item.error}`)
}
if (pageErrors.length) {
  console.log('页面错误：')
  for (const message of pageErrors.slice(0, 10)) console.log('  ' + message)
}

await page.screenshot({ path: `${out}/echarts_templates.png`, fullPage: true })

await browser.close()
if (failed.length || pageErrors.length) process.exitCode = 1
else console.log('PASS 39 类模板全部渲染成功')
