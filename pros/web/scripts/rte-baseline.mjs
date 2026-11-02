/**
 * 富文本基线：登录后在四类画布里打开编辑器，并在 Y 模型最大化里走一遍主路径。
 * CHROME_PATH 默认 /usr/bin/google-chrome。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' })
await page.fill('#login-email', 'demo@metamatrix.local')
await page.fill('#login-password', 'demo123456')
await page.click('button[type="submit"]')
await page.waitForTimeout(800)

async function openTemplate(path, shot) {
  await page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const max = page.locator('button[aria-label="最大化"]').first()
  const count = await max.count()
  log(`${path} 有编辑块`, count > 0, String(count))
  if (!count) {
    await page.screenshot({ path: `${out}/${shot}_missing.png` })
    return
  }
  await max.click()
  await page.waitForSelector('.pm-overlay .ProseMirror', { timeout: 8000 })
  const paragraph = page.locator('.pm-overlay .ProseMirror p').first()
  if (await paragraph.count()) await paragraph.click()
  await page.keyboard.type('基线')
  await page.screenshot({ path: `${out}/${shot}.png` })
  const close = page.locator('.pm-overlay button[aria-label="关闭"], .pm-overlay button[aria-label="还原"]').first()
  if (await close.count()) await close.click()
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

await openTemplate('/canvas/dual-triangle', 'baseline_dual_triangle')
await openTemplate('/canvas/star-quadrant', 'baseline_star_quadrant')
await openTemplate('/canvas/five-step-basic', 'baseline_five_step')
await page.goto('http://127.0.0.1:5173/canvas/y-model?documentId=4d5f428c-a6e7-45a7-b29e-304120fccbb5', {
  waitUntil: 'domcontentloaded',
})
await page.waitForTimeout(1500)
const block = page.locator('.ym-block', { has: page.locator('h3', { hasText: '如何定性定量分析' }) })
await block.locator('button[aria-label="最大化"]').click()
await page.waitForSelector('.pm-overlay .ProseMirror')
const paragraph = page.locator('.pm-overlay .ProseMirror p').filter({ hasText: '第一段' }).first()
if (await paragraph.count()) await paragraph.click()
else await page.locator('.pm-overlay .ProseMirror').click({ position: { x: 80, y: 120 }, force: true })
await page.keyboard.press('End')
await page.keyboard.press('Enter')
await page.keyboard.type('/')
await page.waitForTimeout(500)
const slash = await page.locator('.rte-slash-menu').count()
log('slash 菜单', slash > 0, String(slash))
if (slash) {
  const scrolled = await page.evaluate(() => {
    const list = document.querySelector('.rte-slash-list')
    if (!(list instanceof HTMLElement)) return { ok: false, reason: 'no-list' }
    const overflowY = getComputedStyle(list).overflowY
    const before = list.scrollTop
    list.scrollTop = before + 240
    return {
      ok: (overflowY === 'auto' || overflowY === 'scroll') && list.scrollHeight > list.clientHeight && list.scrollTop > before,
      overflowY,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      scrollTop: list.scrollTop,
    }
  })
  log('slash 列表可滚动', !!scrolled.ok, JSON.stringify(scrolled))
}
await page.screenshot({ path: `${out}/baseline_slash.png` })
if (slash) await page.keyboard.press('Escape')
await page.waitForTimeout(200)
if ((await page.locator('.pm-overlay').count()) === 0) {
  await page.locator('.ym-block', { has: page.locator('h3', { hasText: '如何定性定量分析' }) }).locator('button[aria-label="最大化"]').click()
  await page.waitForSelector('.pm-overlay .ProseMirror')
}
log('Esc 后最大化仍在或已重新打开', (await page.locator('.pm-overlay').count()) > 0)
const size = page.locator('.pm-overlay select[aria-label="页面大小"]')
await size.selectOption('a4')
const margin = page.locator('.pm-overlay select[aria-label="页边距"]')
await margin.selectOption('narrow')
log('页面大小与页边距', (await size.inputValue()) === 'a4' && (await margin.inputValue()) === 'narrow')
await page.screenshot({ path: `${out}/baseline_page_layout.png` })
const preview = page.locator('.pm-overlay .rte-bottom-link', { hasText: '预览' })
if (await preview.count()) {
  await preview.click()
  await page.waitForSelector('.pm-overlay .rte-preview-banner')
  log('只读预览', true)
  await page.screenshot({ path: `${out}/baseline_preview.png` })
  await page.locator('.pm-overlay .rte-preview-back').click()
}
const print = page.locator('.pm-overlay button', { hasText: '打印' }).first()
if (await print.count()) {
  await print.click()
  const paper = await page.locator('.rte-print-preview-paper').count()
  log('打印预览', paper > 0, String(paper))
  await page.screenshot({ path: `${out}/baseline_print.png` })
  await page.keyboard.press('Escape')
}
log('Esc 后打印预览关闭', (await page.locator('.rte-print-preview-paper').count()) === 0)
await page.screenshot({ path: `${out}/baseline_y_model.png` })

console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
