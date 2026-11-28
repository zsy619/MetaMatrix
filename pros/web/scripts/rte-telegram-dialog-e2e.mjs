/**
 * Telegram App 风格弹窗 / Ribbon 视觉验证（无登录 harness）。
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const out = process.env.RTE_BASELINE_DIR || '/tmp/rte-tg-shots'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const report = {}
await page.goto(`${web}/rte-expanded-preview.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_EXPANDED_READY__ === true, { timeout: 30000 })
await page.waitForTimeout(800)

// Ribbon 浅灰底 / 白磁贴
report.ribbon = await page.evaluate(() => {
  const bar = document.querySelector('.rte-ribbon-bar')
  const tools = document.querySelector('.rte-toolbar-tools')
  return {
    barBg: bar ? getComputedStyle(bar).backgroundColor : null,
    toolsBg: tools ? getComputedStyle(tools).backgroundColor : null,
  }
})
await page.screenshot({ path: `${out}/10-ribbon-tg.png`, clip: { x: 0, y: 0, width: 1440, height: 200 } })

// 打开二维码弹窗
const insertTab = await page.$('.rte-ribbon-tab:text-is("插入")')
if (insertTab) {
  await insertTab.click()
  await page.waitForTimeout(600)
}
const qr = await page.$('.rte-toolbar-tools .rte-tool:has-text("二维码")')
if (qr) {
  await qr.click()
  await page.waitForTimeout(900)
  report.qr = await page.evaluate(() => {
    const card = document.querySelector('.rte-qr-card')
    if (!card) return null
    const cs = getComputedStyle(card)
    const row = document.querySelector('.rte-tg-row')
    const seg = document.querySelector('.rte-tg-segmented')
    const segBtn = seg?.querySelector('button.active')
    const tile = document.querySelector('.rte-tg-row-icon')
    const r = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null)
    return {
      cardBg: cs.backgroundColor,
      cardRadius: cs.borderRadius,
      shadow: cs.boxShadow,
      sectionTitles: [...document.querySelectorAll('.rte-tg-section-title')].map((e) => e.textContent.trim()),
      rowHeight: r(row),
      rowIconSize: tile ? `${Math.round(tile.getBoundingClientRect().width)}x${Math.round(tile.getBoundingClientRect().height)}` : null,
      rowIconRadius: tile ? getComputedStyle(tile).borderRadius : null,
      segmentedBg: seg ? getComputedStyle(seg).backgroundColor : null,
      activeTab: segBtn?.textContent?.trim(),
      hasSvgIcon: !!tile?.querySelector('svg'),
      actions: [...document.querySelectorAll('.rte-tg-actions button')].map((b) => b.textContent.trim()),
    }
  })
  await page.screenshot({ path: `${out}/11-qr-dialog.png` })
}
console.log(JSON.stringify(report, null, 2))
await browser.close()
