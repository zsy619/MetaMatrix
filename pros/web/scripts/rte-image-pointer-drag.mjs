/**
 * 图片移动必须走 pointer 事件，而不是 HTML5 drag。
 * RTE_BROWSER=chromium|webkit。两种手势都要能把一张图拖到另一张图旁边。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium, webkit } = pw
const kind = process.env.RTE_BROWSER === 'webkit' ? 'webkit' : 'chromium'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
mkdirSync(out, { recursive: true })

const browser =
  kind === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      })

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok, detail: detail ?? '' })
  console.log(`${ok ? 'PASS' : 'FAIL'} [${kind}] ${step}`, detail ?? '')
}

await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' })
await page.fill('#login-email', 'demo@metamatrix.local')
await page.fill('#login-password', 'demo123456')
await page.click('button[type="submit"]')
await page.waitForTimeout(800)
await page.goto('http://127.0.0.1:5173/canvas/y-model?documentId=4d5f428c-a6e7-45a7-b29e-304120fccbb5', {
  waitUntil: 'domcontentloaded',
})
await page.waitForTimeout(1500)
const block = page.locator('.ym-block', { has: page.locator('h3', { hasText: '如何定性定量分析' }) })
await block.locator('button[aria-label="最大化"]').click()
await page.waitForSelector('.pm-overlay .ProseMirror')

const stamp = Date.now().toString(36)
const alts = ['鼠' + stamp, '手' + stamp, '拽' + stamp, '柄' + stamp, '角' + stamp, '邻' + stamp]

await page.evaluate((names) => {
  const root = document.querySelector('.pm-overlay .rte-root')
  let el = root
  let editor = null
  while (el) {
    const exposed = el.__vueParentComponent?.exposed
    const candidate = exposed?.editor?.chain ? exposed.editor : exposed?.editor?.value
    if (candidate?.chain) {
      editor = candidate
      break
    }
    el = el.parentElement
  }
  if (!editor) throw new Error('找不到最大化编辑器')
  window.__dragStarts = 0
  window.__drops = 0
  document.addEventListener('dragstart', () => { window.__dragStarts += 1 }, true)
  document.addEventListener('drop', () => { window.__drops += 1 }, true)
  window.__pd = ''
  window.__pm = 0
  window.__mm = 0
  document.addEventListener('pointerdown', (event) => {
    window.__pd = `${event.target?.tagName || ''}:${event.button}`
  }, true)
  document.addEventListener('pointermove', () => { window.__pm += 1 }, true)
  document.addEventListener('mousemove', () => { window.__mm += 1 }, true)
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  const colors = ['#e11d48', '#16a34a', '#2563eb', '#d97706', '#7c3aed', '#0891b2']
  editor.chain().focus('end').insertContent('<p></p>').run()
  names.forEach((alt, index) => {
    ctx.fillStyle = colors[index]
    ctx.fillRect(0, 0, 160, 96)
    ctx.fillStyle = '#fff'
    ctx.font = '24px sans-serif'
    ctx.fillText(String(index + 1), 70, 56)
    editor.chain().focus('end').insertContent('<p></p>').setImage({ src: canvas.toDataURL('image/png'), alt }).run()
  })
  window.__imageDraggable = editor.schema.nodes.image.spec.draggable
}, alts)

await page.waitForSelector(`.pm-overlay img[alt="${alts[0]}"]`)
const spec = await page.evaluate(() => window.__imageDraggable)
log('图片节点 draggable 为 false', spec === false, String(spec))

async function boxOf(alt) {
  const img = page.locator(`.pm-overlay img[alt="${alt}"]`)
  await img.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
  await page.waitForTimeout(80)
  const box = await img.boundingBox()
  if (!box) throw new Error(`没有盒子 ${alt}`)
  return box
}

function groupOf(altList) {
  return page.evaluate((names) => {
    const imgs = names.map((alt) => document.querySelector(`.pm-overlay img[alt="${alt}"]`))
    if (imgs.some((img) => !img)) return { ok: false, reason: 'missing' }
    const group = imgs[0].closest('[data-type="image-group"]')
    const same = !!group && imgs.every((img) => img.closest('[data-type="image-group"]') === group)
    const order = group ? [...group.querySelectorAll('img')].map((img) => img.getAttribute('alt')) : []
    return { ok: same, order }
  }, altList)
}

async function placeBelowToolbar(alt) {
  await page.evaluate((name) => {
    const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
    const canvas = img?.closest('.rte-canvas')
    if (!(img instanceof HTMLElement) || !(canvas instanceof HTMLElement)) return
    const toolbar = document.querySelector('.pm-overlay .rte-toolbar')
    const limit = (toolbar?.getBoundingClientRect().bottom || 0) + 16
    const rect = img.getBoundingClientRect()
    canvas.scrollTop += rect.top - limit
  }, alt)
  await page.waitForTimeout(120)
}

async function mouseDrag(fromAlt, toAlt) {
  await placeBelowToolbar(fromAlt)
  const from = await page.locator(`.pm-overlay img[alt="${fromAlt}"]`).boundingBox()
  const to = await page.locator(`.pm-overlay img[alt="${toAlt}"]`).boundingBox()
  if (!from || !to) throw new Error(`拖拽前缺少盒子 ${fromAlt} ${toAlt}`)
  const sx = from.x + Math.min(48, from.width / 2)
  const sy = from.y + from.height / 2
  const tx = to.x + Math.min(20, to.width * 0.18)
  const ty = to.y + to.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(tx, ty, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

await mouseDrag(alts[0], alts[1])
const byMouse = await groupOf([alts[0], alts[1]])
const native = await page.evaluate(() => ({
  dragstart: window.__dragStarts,
  drop: window.__drops,
  pointerdown: window.__pd,
  pointermove: window.__pm,
  mousemove: window.__mm,
}))
log(
  '低层 mouse 按住图片本体并排',
  byMouse.ok && native.pointermove > 0 && native.dragstart === 0,
  JSON.stringify({ order: byMouse.order, ...native }),
)

const source = page.locator(`.pm-overlay img[alt="${alts[2]}"]`)
const target = page.locator(`.pm-overlay img[alt="${alts[3]}"]`)
await source.evaluate((el) => el.scrollIntoView({ block: 'center' }))
await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
const targetBox = await target.boundingBox()
await source.dragTo(target, {
  sourcePosition: { x: 40, y: 30 },
  targetPosition: { x: Math.min(24, (targetBox?.width || 80) * 0.2), y: Math.max(12, (targetBox?.height || 40) / 2) },
})
await page.waitForTimeout(200)
const byDragTo = await groupOf([alts[2], alts[3]])
log('dragTo 按住图片本体并排', byDragTo.ok, JSON.stringify(byDragTo.order))

const handleHost = page.locator(`.pm-overlay img[alt="${alts[4]}"]`)
await handleHost.evaluate((el) => el.scrollIntoView({ block: 'center' }))
await handleHost.hover()
const handle = handleHost.locator('xpath=ancestor::*[@data-resize-container][1]').locator('.rte-image-drag-handle')
const handleStyle = await handle.evaluate((el) => {
  const cs = getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  const img = el.parentElement?.querySelector('img')?.getBoundingClientRect()
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  return {
    opacity: cs.opacity,
    pointerEvents: cs.pointerEvents,
    near: !!img && rect.left < img.right && rect.right > img.left && rect.top < img.bottom && rect.bottom > img.top,
    hit: hit?.className || hit?.tagName || '',
  }
})
log('悬停后手柄可见且落在图片上', handleStyle.opacity === '1' && handleStyle.near, JSON.stringify(handleStyle))

const beforeResize = await boxOf(alts[4])
const resize = handleHost.locator('xpath=ancestor::*[@data-resize-container][1]').locator('[data-resize-handle="right"]')
await handleHost.hover()
const resizeBox = await resize.boundingBox()
if (resizeBox) {
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizeBox.x + 70, resizeBox.y + resizeBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
const afterResize = await boxOf(alts[4])
const resizeJoined = await groupOf([alts[4], alts[5]])
log(
  '缩放锚点不会把图片拖走',
  !resizeJoined.ok && Math.abs(afterResize.y - beforeResize.y) < 80,
  JSON.stringify({ dy: Math.round(afterResize.y - beforeResize.y), dw: Math.round(afterResize.width - beforeResize.width), joined: resizeJoined.ok }),
)

await page.screenshot({ path: `${out}/image_pointer_drag_${kind}.png` })
console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
