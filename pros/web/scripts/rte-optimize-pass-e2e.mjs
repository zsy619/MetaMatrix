/**
 * 审阅「深优化」：整理空格和标点，并给出 12 / 21 一键套用。
 * 依赖 http://127.0.0.1:5174/rte-code-gap-preview.html
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const out = '/opt/cursor/artifacts'
mkdirSync(out, { recursive: true })
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5174'

function svg(fill, label) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${fill}"/><text x="36" y="220" fill="#ffffff" font-size="72" font-family="sans-serif">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(xml)}`
}

const html = [
  '<p>你好  世界！！Hello世界</p>',
  '<div data-type="image-group" data-align="center"><div class="rte-image-group-row">',
  `<img src="${svg('#3370ff', 'A')}" alt="甲">`,
  `<img src="${svg('#14c9c9', 'B')}" alt="乙">`,
  `<img src="${svg('#f77234', 'C')}" alt="丙">`,
  '</div></div>',
].join('')

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
const notes = []
const log = (step, ok, detail = '') => {
  notes.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`)
}

await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
await page.evaluate((content) => {
  const editor = window.__rte?.editor?.value || window.__rte?.editor
  editor.commands.setContent(content)
}, html)
await page.waitForSelector('.ProseMirror img[alt="丙"]')

await page.getByRole('tab', { name: '审阅' }).click()
await page.locator('button', { hasText: '深优化' }).click()
await page.waitForSelector('.rte-optimize-dialog')
const report = await page.locator('.rte-optimize-dialog').innerText()
log('报告列出已整理项和 12/21', report.includes('套用 12') && report.includes('套用 21'), report.slice(0, 240))
await page.screenshot({ path: `${out}/optimize-report.png` })

await page.getByRole('button', { name: '套用 12' }).click()
await page.waitForTimeout(400)
const after = await page.evaluate(() => {
  const group = document.querySelector('.ProseMirror [data-type="image-group"]')
  const text = document.querySelector('.ProseMirror p')?.textContent || ''
  return { layout: group?.getAttribute('data-layout') || '', text }
})
log('套用 12 并整理正文', after.layout === '12' && after.text === '你好 世界！Hello 世界', JSON.stringify(after))
await page.screenshot({ path: `${out}/optimize-layout-12.png` })

console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
