/**
 * 块手柄留白 e2e：A4 纸张 + 窄边距下悬停段落，断言：
 * 1. 手柄（含容器）右边界 <= 首字左边界（横向无重叠）；
 * 2. 点击首字左边缘光标落在 offset 0（手柄容器不拦截正文点击）；
 * 3. 块菜单可打开、拖拽排序仍可用。
 *
 * 用法：node scripts/rte-gutter-handle-e2e.mjs
 * 依赖：本地 vite dev（默认 http://127.0.0.1:5173）+ /rte-gutter-preview.html
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = pw
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const outDir = process.env.RTE_SHOT_DIR || path.join(repoRoot, 'shots/rte-gutter-handle')
mkdirSync(outDir, { recursive: true })
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'

const notes = []
const log = (step, ok, detail = '') => {
  notes.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]

/** 悬停某个顶层块，返回手柄与首字的几何信息。 */
async function hoverBlock(page, blockIndex) {
  return page.evaluate((index) => {
    const blocks = Array.from(document.querySelectorAll('.ProseMirror > *'))
    const el = blocks[index]
    if (!el) return { error: `找不到第 ${index} 个块` }
    const rect = el.getBoundingClientRect()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node && !node.textContent?.trim()) node = walker.nextNode()
    if (!node) return { error: '块里没有文本' }
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 1)
    const charRect = range.getBoundingClientRect()
    return {
      blockRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      charRect: { left: charRect.left, top: charRect.top, right: charRect.right, bottom: charRect.bottom },
      text: el.textContent?.slice(0, 12) ?? '',
      point: { x: rect.left + Math.min(30, Math.max(6, (charRect.left - rect.left) / 2)), y: rect.top + 6 },
    }
  }, blockIndex)
}

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.goto(`${web}/rte-gutter-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, { timeout: 30000 })
  await page.waitForSelector('.ProseMirror > p')

  // 第 2 个顶层块是正文段落（0 是 h1）。
  const info = await hoverBlock(page, 1)
  if (info.error) {
    log(`[${tag}] 找到待悬停段落`, false, info.error)
    await context.close()
    continue
  }
  await page.mouse.move(info.point.x, info.point.y)
  await page.waitForSelector('.rte-block-tools', { timeout: 5000 }).catch(() => {})

  const geom = await page.evaluate(() => {
    const tools = document.querySelector('.rte-block-tools')
    if (!tools) return { missing: true }
    const toolsRect = tools.getBoundingClientRect()
    const buttons = Array.from(tools.querySelectorAll('button')).map((btn) => {
      const r = btn.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, label: btn.getAttribute('aria-label') }
    })
    const blocks = Array.from(document.querySelectorAll('.ProseMirror > *'))
    const el = blocks[1]
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node && !node.textContent?.trim()) node = walker.nextNode()
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 1)
    const charRect = range.getBoundingClientRect()
    return {
      tools: { left: toolsRect.left, right: toolsRect.right, top: toolsRect.top, bottom: toolsRect.bottom },
      buttons,
      charRect: { left: charRect.left, top: charRect.top, right: charRect.right, bottom: charRect.bottom },
    }
  })

  if (geom.missing) {
    log(`[${tag}] 悬停出现块手柄`, false, '未出现 .rte-block-tools')
    await context.close()
    continue
  }
  log(`[${tag}] 悬停出现块手柄`, true, `${geom.buttons.length} 个按钮`)

  const overlapPx = geom.tools.right - geom.charRect.left
  log(
    `[${tag}] 手柄与首字横向无重叠`,
    geom.tools.right <= geom.charRect.left + 0.5,
    `handle.right=${geom.tools.right.toFixed(1)} text.left=${geom.charRect.left.toFixed(1)} 重叠=${overlapPx.toFixed(1)}px`,
  )
  for (const btn of geom.buttons) {
    log(
      `[${tag}] 按钮「${btn.label}」不压首字`,
      btn.right <= geom.charRect.left + 0.5,
      `right=${btn.right.toFixed(1)}`,
    )
  }

  // 点击首字左边缘 → 光标落在 offset 0
  await page.mouse.click(geom.charRect.left + 1, (geom.charRect.top + geom.charRect.bottom) / 2)
  await page.waitForTimeout(200)
  const sel = await page.evaluate(() => {
    const ed = window.__rte?.editor
    if (!ed) return { missing: true }
    const { $from } = ed.state.selection
    return { parentOffset: $from.parentOffset, parent: $from.parent.type.name, text: $from.parent.textBetween(0, 8) }
  })
  log(
    `[${tag}] 点击首字左边缘光标落在 offset 0`,
    !sel.missing && sel.parentOffset === 0,
    JSON.stringify(sel),
  )

  // 块菜单仍可打开
  await page.mouse.move(info.point.x, info.point.y)
  await page.waitForTimeout(120)
  await page.click('.rte-block-tools button[aria-label="块操作"]')
  await page.waitForSelector('.rte-block-menu', { timeout: 3000 }).catch(() => {})
  const menuOpen = await page.evaluate(() => !!document.querySelector('.rte-block-menu'))
  log(`[${tag}] 块菜单可打开`, menuOpen)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)

  // 截图：悬停态（重新悬停后截）
  await page.mouse.move(info.point.x, info.point.y)
  await page.waitForTimeout(150)
  await page.screenshot({ path: path.join(outDir, `rte-gutter-handle-${tag}.png`) })

  // 拖拽排序：把第 2 块拖到第 4 块之前
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ProseMirror > *')).map((el) => (el.textContent ?? '').slice(0, 8)),
  )
  await page.evaluate(() => {
    const tools = document.querySelector('.rte-block-tools [draggable="true"]')
    const canvas = document.querySelector('.rte-canvas')
    if (!tools || !canvas) return
    const dt = new DataTransfer()
    tools.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    const blocks = Array.from(document.querySelectorAll('.ProseMirror > *'))
    const target = blocks[3]
    const rect = target.getBoundingClientRect()
    const y = rect.top + 2
    canvas.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: y, dataTransfer: dt }),
    )
    canvas.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: y, dataTransfer: dt }),
    )
  })
  await page.waitForTimeout(300)
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ProseMirror > *')).map((el) => (el.textContent ?? '').slice(0, 8)),
  )
  log(`[${tag}] 拖拽排序仍可用`, JSON.stringify(before) !== JSON.stringify(after), `${before.join('|')} → ${after.join('|')}`)

  await context.close()
}

await browser.close()

const failed = notes.filter((n) => !n.ok)
console.log(`\n${notes.length - failed.length}/${notes.length} 通过`)
if (failed.length) {
  console.log('失败项：')
  for (const f of failed) console.log(` - ${f.step}：${f.detail}`)
  process.exitCode = 1
}
