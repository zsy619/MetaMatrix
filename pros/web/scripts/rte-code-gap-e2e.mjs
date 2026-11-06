/**
 * 代码块行号/换行 + 图片组间距。
 *
 * 用法：先起 vite（默认 http://127.0.0.1:5173），再
 *   node scripts/rte-code-gap-e2e.mjs
 * 截图目录：环境变量 RTE_SHOT_DIR，默认 /opt/cursor/artifacts
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
pass('预览页就绪')

await page.locator('.ProseMirror pre').first().click()
const chrome = page.locator('.rte-code-chrome')
await chrome.waitFor({ state: 'visible', timeout: 8000 })
await chrome.getByRole('button', { name: '行号' }).click()
await chrome.getByRole('button', { name: '自动换行' }).click()

const codeState = await page.evaluate(() => {
  const pre = document.querySelector('.ProseMirror pre')
  const gutter = pre?.querySelector('.rte-code-gutter')
  const html = window.__rte?.editor?.getHTML?.() || ''
  const code = pre?.querySelector('code')
  const style = code ? getComputedStyle(code) : null
  return {
    lineNumbers: pre?.getAttribute('data-line-numbers') || '',
    wordWrap: pre?.getAttribute('data-word-wrap') || '',
    gutter: gutter?.textContent || '',
    whiteSpace: style?.whiteSpace || '',
    htmlHasFlags: html.includes('data-line-numbers="1"') && html.includes('data-word-wrap="1"'),
    textHasGutter: (pre?.innerText || '').includes('function demo'),
  }
})
if (codeState.lineNumbers !== '1' || codeState.wordWrap !== '1') {
  fail('代码块属性', JSON.stringify(codeState))
}
if (!codeState.gutter.startsWith('1')) fail('行号', codeState.gutter)
if (!codeState.htmlHasFlags) fail('HTML 落库', 'getHTML 缺少 data-line-numbers / data-word-wrap')
if (codeState.whiteSpace !== 'pre-wrap' && codeState.whiteSpace !== 'break-spaces') {
  fail('换行样式', codeState.whiteSpace)
}
pass('代码块行号与换行', `gutter=${JSON.stringify(codeState.gutter.split('\n').slice(0, 4))} wrap=${codeState.whiteSpace}`)

const codeShot = path.join(outDir, 'rte-code-line-wrap.png')
await page.locator('.ProseMirror pre').first().screenshot({ path: codeShot })
pass('代码块截图', codeShot)

const group = page.locator('[data-type="image-group"]').first()
await group.scrollIntoViewIfNeeded()
await group.hover()
const gapBtn = group.locator('.rte-image-group-gap')
await gapBtn.waitFor({ state: 'visible', timeout: 5000 })
const before = (await gapBtn.textContent())?.trim()
await gapBtn.click()
await gapBtn.click()
const after = await page.evaluate(() => {
  const el = document.querySelector('[data-type="image-group"]')
  const row = el?.querySelector('.rte-image-group-row')
  const html = window.__rte?.editor?.getHTML?.() || ''
  return {
    label: el?.querySelector('.rte-image-group-gap')?.textContent?.trim() || '',
    dataGap: el?.getAttribute('data-gap') || '',
    cssGap: row ? getComputedStyle(row).gap : '',
    htmlGap: html.includes('data-gap="24"'),
  }
})
if (before !== '8') fail('间距初值', before || '')
if (after.label !== '24' || after.dataGap !== '24' || !after.htmlGap) {
  fail('间距切换', JSON.stringify(after))
}
if (after.cssGap !== '24px') fail('行间距', after.cssGap)
pass('图片组间距', `${before} → ${after.label}，计算值 ${after.cssGap}`)

const groupShot = path.join(outDir, 'rte-image-group-gap.png')
await group.hover()
await page.screenshot({ path: groupShot, fullPage: false })
pass('图片组截图', groupShot)

await browser.close()
console.log('e2e ok')
