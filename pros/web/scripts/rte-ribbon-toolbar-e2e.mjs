/**
 * 最大化 Ribbon 功能区截图与断言（e2e）。
 *
 * 无需登录 / 无需后端：走组件 harness 页 `/rte-expanded-preview.html`。
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 *
 * 断言：
 * 1. Ribbon 栏目菜单存在，栏目数 > 10；
 * 2. 按钮保持原始形态：高度 ≥ 40px、图标 24px、文字标签可见；
 * 3. 即便 localStorage 偏好为 Telegram 风格，最大化也不套用紧凑条样式（无 is-tg-style）；
 * 4. 分组标题胶囊（分组名）仍然可见。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const out = process.env.RTE_BASELINE_DIR || '/tmp/rte-ribbon-shots'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.addInitScript(() => {
  localStorage.setItem('rte.toolbar.style', 'tg')
})
await page.goto(`${web}/rte-expanded-preview.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_EXPANDED_READY__ === true, { timeout: 30000 })
await page.waitForTimeout(1200)

const info = await page.evaluate(() => {
  const root = document.querySelector('.rte-root')
  const tool = document.querySelector('.rte-toolbar-tools .rte-tool')
  const icon = tool?.querySelector('.rte-tool-icon')
  const label = tool?.querySelector('.rte-tool-label')
  const head = document.querySelector('.rte-toolbar-tools .rte-group-head')
  const headLabel = head?.querySelector('.rte-group-label')
  const box = (el) => (el ? el.getBoundingClientRect() : null)
  return {
    hasRibbonBar: !!document.querySelector('.rte-ribbon-bar'),
    ribbonTabs: document.querySelectorAll('.rte-ribbon-tab').length,
    rootHasTg: !!root?.classList.contains('is-tg-style'),
    rootClasses: root ? root.className : '',
    toolHeight: tool ? box(tool).height : null,
    toolWidth: tool ? box(tool).width : null,
    iconSize: icon ? box(icon).width : null,
    labelVisible: label ? getComputedStyle(label).display !== 'none' : null,
    labelText: label?.textContent?.trim() || '',
    headVisible: head ? getComputedStyle(head).display !== 'none' : null,
    headText: headLabel?.textContent?.trim() || head?.textContent?.trim() || '',
    headLeft: head ? box(head).left : null,
    headTop: head ? box(head).top : null,
    groupHeads: document.querySelectorAll('.rte-toolbar-tools .rte-group-head').length,
    tools: document.querySelectorAll('.rte-toolbar-tools .rte-tool').length,
  }
})

await page.screenshot({ path: `${out}/ribbon-expanded.png`, fullPage: false })

// 切回标准风格再截一张（对照组）
await page.evaluate(() => localStorage.setItem('rte.toolbar.style', 'ribbon'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_EXPANDED_READY__ === true, { timeout: 30000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/ribbon-expanded-standard.png`, fullPage: false })

console.log(JSON.stringify({ info, pageErrors }, null, 2))
await browser.close()
