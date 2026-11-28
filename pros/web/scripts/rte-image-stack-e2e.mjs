/**
 * 三张并排的图：拖到另一张的下沿排成 12，拖到上沿排成 21。
 * 依赖本地 vite：http://127.0.0.1:5173/rte-code-gap-preview.html
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
mkdirSync(out, { recursive: true })
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'

const notes = []
const log = (step, ok, detail = '') => {
  notes.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`)
}

function svg(fill, label) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${fill}"/><text x="36" y="220" fill="#ffffff" font-size="72" font-family="sans-serif">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(xml)}`
}

const html = [
  '<p>拖到上沿或下沿</p>',
  `<div data-type="image-group" data-align="center"><div class="rte-image-group-row">`,
  `<img src="${svg('#3370ff', 'A')}" alt="A">`,
  `<img src="${svg('#14c9c9', 'B')}" alt="B">`,
  `<img src="${svg('#f77234', 'C')}" alt="C">`,
  `</div></div>`,
].join('')

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
await page.evaluate((content) => {
  const editor = window.__rte?.editor?.value || window.__rte?.editor
  if (!editor?.commands?.setContent) throw new Error('找不到预览编辑器')
  editor.commands.setContent(content)
}, html)
await page.waitForSelector('.ProseMirror img[alt="C"]')
await page.waitForTimeout(400)

async function layoutOf() {
  return page.evaluate(() => {
    const group = document.querySelector('.ProseMirror [data-type="image-group"]')
    const row = group?.querySelector('.rte-image-group-row')
    const imgs = [...(group?.querySelectorAll('img') || [])]
    return {
      layout: group?.getAttribute('data-layout') || 'row',
      display: row instanceof HTMLElement ? getComputedStyle(row).display : '',
      order: imgs.map((img) => img.getAttribute('alt')),
      areas: [...(row?.children || [])].map((child) => (child instanceof HTMLElement ? child.style.gridArea : '')),
    }
  })
}

async function drag(fromAlt, toAlt, yRatio, xRatio = 0.5) {
  const from = page.locator(`.ProseMirror img[alt="${fromAlt}"]`)
  const to = page.locator(`.ProseMirror img[alt="${toAlt}"]`)
  await from.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(100)
  const source = await from.boundingBox()
  const target = await to.boundingBox()
  if (!source || !target) throw new Error(`缺少盒子 ${fromAlt} ${toAlt}`)
  const sx = source.x + source.width / 2
  const sy = source.y + source.height / 2
  const tx = target.x + target.width * xRatio
  const ty = target.y + target.height * yRatio
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(tx, ty, { steps: 20 })
  const kind = await page.evaluate(() => document.querySelector('.rte-image-drop-line')?.dataset.kind || '')
  await page.mouse.up()
  await page.waitForTimeout(300)
  return kind
}

const belowKind = await drag('C', 'B', 0.86)
const stacked12 = await layoutOf()
log(
  'C 拖到 B 下沿形成 12',
  belowKind === 'after' && stacked12.layout === '12' && stacked12.display === 'grid' && stacked12.order.join(',') === 'A,B,C',
  JSON.stringify({ belowKind, ...stacked12 }),
)
await page.screenshot({ path: `${out}/image-stack-12.png` })

await page.evaluate((content) => {
  const editor = window.__rte?.editor?.value || window.__rte?.editor
  editor.commands.setContent(content)
}, html)
await page.waitForSelector('.ProseMirror img[alt="C"]')
await page.waitForTimeout(300)

const aboveKind = await drag('A', 'B', 0.12)
const stacked21 = await layoutOf()
log(
  'A 拖到 B 上沿形成 21',
  aboveKind === 'before' && stacked21.layout === '21' && stacked21.display === 'grid' && stacked21.order.join(',') === 'A,B,C',
  JSON.stringify({ aboveKind, ...stacked21 }),
)
await page.screenshot({ path: `${out}/image-stack-21.png` })

const sideKind = await drag('C', 'A', 0.5, 0.12)
const back = await layoutOf()
log(
  '再拖到左右缘回到横排',
  (sideKind === 'left' || sideKind === 'right') && back.layout === 'row' && back.display === 'flex',
  JSON.stringify({ sideKind, ...back }),
)

console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
