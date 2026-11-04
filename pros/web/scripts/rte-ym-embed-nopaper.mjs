/**
 * Y 模型画布：嵌入式富文本区块不走 A4 纸张模式（布局塌陷根因修复的回归）。
 *
 * 前置：API 与前端已启动，且库里有一份 Y 模型样例文档
 * （默认 id 4d5f428c-a6e7-45a7-b29e-304120fccbb5，用 scripts/seed-e2e-fixtures.mjs 播）。
 * RTE_DOCUMENT_ID 可以换文档 id，RTE_WEB_URL 可以换前端地址。
 *
 * 检查项：
 *   1. 1440×900 / 1280×800 / 1920×1080 下 .ym-main 高度 > 300px；
 *   2. 区块之间没有重叠；
 *   3. 画布里的编辑器没有 is-page-sheet（不按 A4 纸张渲染）；
 *   4. 「最大化」按钮可点，且最大化后回到 A4 纸张视图（is-page-sheet + a4）；
 *   5. 截图落到 RTE_BASELINE_DIR（默认 /tmp/metamatrix-e2e/shots）。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out = process.env.RTE_BASELINE_DIR || '/tmp/metamatrix-e2e/shots'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const documentId = process.env.RTE_DOCUMENT_ID || '4d5f428c-a6e7-45a7-b29e-304120fccbb5'
mkdirSync(out, { recursive: true })

const VIEWPORTS = [
  { label: '1440x900', width: 1440, height: 900 },
  { label: '1280x800', width: 1280, height: 800 },
  { label: '1920x1080', width: 1920, height: 1080 },
]

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

await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('#login-email', 'demo@metamatrix.local')
await page.fill('#login-password', 'demo123456')
const debugAnswer = await page.getAttribute('.captcha__image', 'data-debug-answer')
if (debugAnswer) await page.fill('#captcha-code', debugAnswer)
await page.click('button[type="submit"]')
await page.waitForTimeout(800)

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.goto(`${web}/canvas/y-model?documentId=${documentId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(1800)

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('.ym-main')
    const tools = document.querySelector('.ym-tools')
    const blocks = [...document.querySelectorAll('.ym-block')]
    const rects = blocks.map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
    let overlaps = 0
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (ox > 2 && oy > 2) overlaps += 1
      }
    }
    const sheetInCanvas = document.querySelectorAll('.ym-block .rte-root.is-page-sheet').length
    const editorCount = document.querySelectorAll('.ym-block .rte-root').length
    const bodyMinHeights = [...document.querySelectorAll('.ym-block .rte-body')].map(
      (el) => Math.round(el.getBoundingClientRect().height),
    )
    return {
      mainHeight: main ? Math.round(main.getBoundingClientRect().height) : 0,
      toolsHeight: tools ? Math.round(tools.getBoundingClientRect().height) : 0,
      blocks: blocks.length,
      overlaps,
      sheetInCanvas,
      editorCount,
      bodyMinHeights,
    }
  })
  log(
    `${vp.label} .ym-main 高度 > 300px`,
    metrics.mainHeight > 300,
    JSON.stringify(metrics),
  )
  log(`${vp.label} 区块无重叠`, metrics.overlaps === 0, `overlaps=${metrics.overlaps}`)
  log(
    `${vp.label} 画布内编辑器不套 A4 纸张`,
    metrics.editorCount > 0 && metrics.sheetInCanvas === 0,
    `editors=${metrics.editorCount} sheet=${metrics.sheetInCanvas}`,
  )

  await page.screenshot({ path: `${out}/ym-embed-${vp.label}.png` })

  // 最大化：底部 tools 区块里的编辑器应回到 A4 纸张视图。
  const max = page.locator('.ym-tools button[aria-label="最大化"]').first()
  const maxCount = await max.count()
  log(`${vp.label} tools 区块有最大化按钮`, maxCount > 0, String(maxCount))
  if (maxCount) {
    try {
      await max.click({ timeout: 8000 })
      await page.waitForSelector('.pm-overlay .rte-root', { timeout: 8000 })
      await page.waitForTimeout(500)
      const overlay = await page.evaluate(() => {
        const root = document.querySelector('.pm-overlay .rte-root')
        return {
          sheet: !!root?.classList.contains('is-page-sheet'),
          pageSize: root?.getAttribute('data-page-size') || '',
          margin: root?.getAttribute('data-margin') || '',
        }
      })
      log(
        `${vp.label} 最大化后回到 A4 纸张视图`,
        overlay.sheet && overlay.pageSize === 'a4',
        JSON.stringify(overlay),
      )
      await page.screenshot({ path: `${out}/ym-embed-${vp.label}-maximized.png` })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    } catch (err) {
      log(`${vp.label} 最大化按钮可点击`, false, String(err).split('\n')[0])
      await page.screenshot({ path: `${out}/ym-embed-${vp.label}-maximize-failed.png` })
    }
  }
}

console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
