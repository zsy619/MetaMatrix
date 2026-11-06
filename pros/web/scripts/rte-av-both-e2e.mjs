/**
 * 音频和视频选择窗分别点开：桌面 1440 与窄屏 390。
 * 取消不插入；确认外部链接后正文里分别出现 audio / video。
 * 用法：vite 在 5173，然后 node scripts/rte-av-both-e2e.mjs
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
const fail = (step, detail) => {
  console.log(`FAIL ${step} — ${detail}`)
  throw new Error(`${step}: ${detail}`)
}
const pass = (step, detail = '') => console.log(`PASS ${step}${detail ? ` — ${detail}` : ''}`)

async function openKind(page, kind) {
  const buttonName = kind === 'video' ? '视频' : '插入音频'
  const dialogName = kind === 'video' ? '插入视频' : '插入音频'
  const button = page.getByRole('button', { name: buttonName, exact: true })
  if (!(await button.isVisible())) {
    const more = page.getByRole('button', { name: '更多格式与插入' })
    if (await more.isVisible()) await more.click()
  }
  await button.click()
  const dialog = page.getByRole('dialog', { name: dialogName })
  await dialog.waitFor({ state: 'visible' })
  return dialog
}

const viewports = [
  { width: 1440, height: 900, name: '1440' },
  { width: 390, height: 700, name: '390' },
]

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
  for (const kind of ['video', 'audio']) {
    const dialog = await openKind(page, kind)
    const box = await dialog.boundingBox()
    if (!box) fail(`${viewport.name} ${kind}`, '没有盒子')
    if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
      fail(`${viewport.name} ${kind} 溢出`, JSON.stringify(box))
    }
    const shot = path.join(outDir, `rte-dialog-${kind}-${viewport.name}.png`)
    await page.screenshot({ path: shot })
    pass(`${viewport.name} ${kind} 弹窗在视口内`, shot)
    await page.getByRole('button', { name: '取消' }).click()
    await dialog.waitFor({ state: 'hidden' })
  }
  await page.close()
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })

const videoUrl = 'https://cdn.example/clip.mp4'
const audioUrl = 'https://cdn.example/voice.mp3'
const video = await openKind(page, 'video')
await video.getByRole('button', { name: '外部链接' }).click()
await video.locator('textarea').fill(videoUrl)
await video.getByRole('button', { name: '确认' }).click()
await video.waitFor({ state: 'hidden' })

const audio = await openKind(page, 'audio')
await audio.getByRole('button', { name: '外部链接' }).click()
await audio.locator('textarea').fill(audioUrl)
await audio.getByRole('button', { name: '确认' }).click()
await audio.waitFor({ state: 'hidden' })

const html = await page.evaluate(() => window.__rte.editor.getHTML())
if (!html.includes(videoUrl) || !html.includes('<video')) fail('视频插入', html.slice(0, 400))
if (!html.includes(audioUrl) || !html.includes('<audio')) fail('音频插入', html.slice(0, 400))
pass('视频和音频分别确认后都在正文里')

const round = await page.evaluate(({ videoUrl, audioUrl }) => {
  const ed = window.__rte.editor
  const first = ed.getHTML()
  ed.commands.undo()
  const withoutAudio = ed.getHTML()
  ed.commands.undo()
  const withoutBoth = ed.getHTML()
  ed.commands.redo()
  ed.commands.redo()
  const restored = ed.getHTML()
  ed.commands.setContent(restored)
  return {
    bothGone: !withoutBoth.includes(videoUrl) && !withoutBoth.includes(audioUrl),
    restored: restored === first,
    reload: ed.getHTML() === restored,
  }
}, { videoUrl, audioUrl })
if (!round.bothGone || !round.restored || !round.reload) fail('撤销回显', JSON.stringify(round))
pass('两次撤销去掉音视频，重做后回显与再加载一致')
await page.screenshot({ path: path.join(outDir, 'rte-av-both-inserted.png') })
await browser.close()
console.log('e2e ok')
