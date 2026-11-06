/**
 * 标题自动编号：点工具栏「标题号」后，H1 的 ::before 应出现序号。
 * 用法：vite 在 5173，然后 node scripts/rte-heading-num-e2e.mjs
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const { chromium } = pw
const outDir = process.env.RTE_SHOT_DIR || '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const fail = (step, detail) => {
  console.log(`FAIL ${step} — ${detail}`)
  throw new Error(`${step}: ${detail}`)
}
const pass = (step, detail = '') => console.log(`PASS ${step}${detail ? ` — ${detail}` : ''}`)

await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })

const before = await page.evaluate(() => {
  const h1 = document.querySelector('.ProseMirror h1')
  return h1 ? getComputedStyle(h1, '::before').content : ''
})
if (before !== 'none' && before !== 'normal' && before !== '""') {
  fail('缺省不应有编号', before)
}
pass('缺省无编号', before || 'none')

await page.getByRole('button', { name: '标题自动编号 1 / 1.1 / 1.1.1' }).click()
await page.waitForFunction(() => document.querySelector('.rte-root.is-heading-auto-num'))
const after = await page.evaluate(() => {
  const h1 = document.querySelector('.ProseMirror h1')
  return {
    content: h1 ? getComputedStyle(h1, '::before').content : '',
    text: h1?.textContent || '',
  }
})
// headless 里 innerText 不含 ::before，但计算值会留下 counter(h1)。截图像素另见保存的图。
if (!after.content.includes('counter(h1)')) fail('H1 编号规则', JSON.stringify(after))
if (after.text.startsWith('1')) fail('编号写进了标题文字', after.text)
pass('H1 计数器规则生效且正文不含数字前缀', after.content)

const shot = path.join(outDir, 'rte-heading-auto-num.png')
await page.screenshot({ path: shot })
pass('截图', shot)
await browser.close()
console.log('e2e ok')
