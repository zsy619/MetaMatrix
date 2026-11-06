/**
 * 音视频选择弹窗：三档视口里可见、取消不插入、遮罩不丢掉已填链接、确认才插入。
 * 用法：vite 在 5173，然后 node scripts/rte-dialog-e2e.mjs
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const { chromium } = pw
const outDir = process.env.RTE_SHOT_DIR || '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const URL_VALUE = 'https://cdn.example/dialog-clip.mp4'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const fail = (step, detail) => {
  console.log(`FAIL ${step} — ${detail}`)
  throw new Error(`${step}: ${detail}`)
}
const pass = (step, detail = '') => console.log(`PASS ${step}${detail ? ` — ${detail}` : ''}`)

async function openVideo(page) {
  const video = page.getByRole('button', { name: '视频', exact: true })
  if (!(await video.isVisible())) {
    await page.getByRole('button', { name: '更多格式与插入' }).click()
  }
  await video.click()
  const dialog = page.getByRole('dialog', { name: '插入视频' })
  await dialog.waitFor({ state: 'visible' })
  return dialog
}

const viewports = [
  { width: 1440, height: 900, name: '1440' },
  { width: 1280, height: 800, name: '1280' },
  { width: 390, height: 700, name: '390' },
]

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
  const dialog = await openVideo(page)
  const box = await dialog.boundingBox()
  if (!box) fail(`${viewport.name} 弹窗`, '没有盒子')
  if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    fail(`${viewport.name} 溢出`, JSON.stringify(box))
  }
  const shot = path.join(outDir, `rte-dialog-video-${viewport.name}.png`)
  await page.screenshot({ path: shot })
  pass(`${viewport.name} 弹窗在视口内`, shot)
  await page.getByRole('button', { name: '取消' }).click()
  await dialog.waitFor({ state: 'hidden' })
  const html = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
  if (html.includes('<video') || html.includes(URL_VALUE)) fail(`${viewport.name} 取消插入了`, html.slice(0, 200))
  pass(`${viewport.name} 取消不插入`)
  await page.close()
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
let dialog = await openVideo(page)
await dialog.getByRole('button', { name: '外部链接' }).click()
await dialog.locator('textarea').fill('notaurl')
await dialog.getByRole('button', { name: '确认' }).click()
if (!(await dialog.isVisible())) fail('无效链接', '弹窗被关掉了')
await page.getByRole('button', { name: '取消' }).click()
dialog = await openVideo(page)
await dialog.getByRole('button', { name: '外部链接' }).click()
const leftover = await dialog.locator('textarea').inputValue()
if (leftover) fail('再次打开仍有错误文本', leftover)
pass('再次打开不留错误文本')
await dialog.locator('textarea').fill(URL_VALUE)
await page.locator('.rte-modal-overlay[data-av-kind="video"]').click({ position: { x: 8, y: 8 } })
if (!(await dialog.isVisible())) fail('遮罩', '未提交的链接被遮罩关掉了')
const kept = await dialog.locator('textarea').inputValue()
if (kept !== URL_VALUE) fail('遮罩清掉了链接', kept)
pass('遮罩不丢掉已填链接')
await dialog.getByRole('button', { name: '确认' }).click()
await dialog.waitFor({ state: 'hidden' })
const html = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
if (!html.includes(URL_VALUE)) fail('确认插入', html.slice(0, 300))
pass('确认插入视频地址')
await page.locator('.ProseMirror p').last().click()
await page.keyboard.type('还在编辑')
const after = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
if (!after.includes('还在编辑')) fail('关闭后继续编辑', after.slice(-200))
pass('关闭后可以继续编辑')
await page.screenshot({ path: path.join(outDir, 'rte-dialog-video-inserted.png') })
await browser.close()
console.log('e2e ok')
