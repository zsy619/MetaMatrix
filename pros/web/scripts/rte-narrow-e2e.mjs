/**
 * 窄屏（375 / 768）横向溢出 e2e。
 *
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 * 页面：/rte-narrow-preview.html（无后端依赖的组件 harness，见 src/rteNarrowPreview.ts）。
 * 输出：RTE_BASELINE_DIR（默认 /workspace/outputs/metamatrix/shots/rte-p0-narrow）。
 *
 * 判定：
 * - 硬断言：document.documentElement.scrollWidth <= window.innerWidth；
 * - 辅助定位：列出「右边界超出视口」且「祖先链上没有横向滚动容器」的元素。
 */
import pw from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out =
  process.env.RTE_BASELINE_DIR || '/workspace/outputs/metamatrix/shots/rte-p0-narrow'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const viewports = (process.env.RTE_NARROW_VIEWPORTS || '375,768')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter(Boolean)

mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

/** 页面内探针：整体溢出 + 越界元素清单。 */
const probe = () => {
  const innerWidth = window.innerWidth
  const doc = document.documentElement
  const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth)

  /** 祖先链上是否存在横向滚动容器（允许子元素超宽但被容器吸收）。 */
  const hasScrollableAncestor = (el) => {
    let node = el.parentElement
    while (node && node !== document.body) {
      const style = getComputedStyle(node)
      const overflowX = style.overflowX
      if (
        (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') &&
        node.scrollWidth > node.clientWidth + 1
      ) {
        return true
      }
      node = node.parentElement
    }
    return false
  }

  const offenders = []
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    if (rect.right <= innerWidth + 1) continue
    if (hasScrollableAncestor(el)) continue
    const style = getComputedStyle(el)
    if (style.position === 'fixed') continue
    offenders.push({
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      text: (el.textContent || '').trim().slice(0, 40),
    })
  }

  const toolbar = document.querySelector('.rte-toolbar')
  const body = document.querySelector('.rte-body')
  const canvas = document.querySelector('.rte-canvas')

  return {
    innerWidth,
    scrollWidth,
    overflow: scrollWidth > innerWidth,
    toolbarScrollWidth: toolbar ? toolbar.scrollWidth : null,
    toolbarClientWidth: toolbar ? toolbar.clientWidth : null,
    bodyScrollWidth: body ? body.scrollWidth : null,
    bodyClientWidth: body ? body.clientWidth : null,
    canvasScrollWidth: canvas ? canvas.scrollWidth : null,
    canvasClientWidth: canvas ? canvas.clientWidth : null,
    offenders: offenders.slice(0, 40),
    offenderCount: offenders.length,
  }
}

const report = { web, viewports: [], generatedAt: new Date().toISOString() }
let failed = false

for (const width of viewports) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const pageErrors = []
  const isIgnorable = (text) => /favicon/i.test(text) || /Failed to load resource/i.test(text)
  page.on('pageerror', (err) => {
    if (!isIgnorable(String(err))) pageErrors.push(String(err))
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
  })

  // 注意：用 domcontentloaded 而非 load —— vite dev 的 HMR websocket 会让 load 迟迟不触发。
  await page.goto(`${web}/rte-narrow-preview.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page
    .waitForFunction(() => !!document.querySelector('.rte-toolbar'), null, { timeout: 60000 })
    .catch(() => {})
  // 等图表渲染完（宽度由 echarts 计算，可能晚于 DOM ready）
  await page.waitForTimeout(2500)

  const result = await page.evaluate(probe)
  result.pageErrors = pageErrors
  report.viewports.push(result)

  const tag = String(width)
  // 不用 fullPage：溢出的超宽页面会让 fullPage 截图极大而超时。
  // 改为逐屏截图（顶部工具栏 + 若干滚动位置），前后对照足够。
  const shots = Number(process.env.RTE_NARROW_SHOTS || 3)
  await page.screenshot({ path: `${out}/narrow-${tag}-toolbar.png` })
  for (let i = 1; i < shots; i += 1) {
    await page.evaluate((n) => window.scrollTo(0, n * (window.innerHeight - 80)), i)
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/narrow-${tag}-scroll${i}.png` })
  }
  await page.evaluate(() => window.scrollTo(0, 0))

  if (result.overflow) failed = true
  console.log(
    `${result.overflow ? 'FAIL' : 'PASS'} ${tag}px scrollWidth=${result.scrollWidth} innerWidth=${result.innerWidth} offenders=${result.offenderCount}`,
  )
  for (const o of result.offenders.slice(0, 12)) {
    console.log(`   - <${o.tag} class="${o.className}"> right=${o.right} w=${o.width} text="${o.text}"`)
  }
  if (pageErrors.length) console.log(`   pageErrors: ${pageErrors.slice(0, 3).join(' | ')}`)

  await page.close()
}

await browser.close()
writeFileSync(`${out}/narrow-report.json`, JSON.stringify(report, null, 2))
console.log(failed ? 'RESULT: fail 存在横向溢出' : 'RESULT: ok')
process.exit(failed ? 1 : 0)
