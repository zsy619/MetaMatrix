/**
 * 飞书图片拖拽 15 项。按住图片本体用 pointer（mouse down/move/up），
 * 不依赖 HTML5 drag。RTE_BROWSER=chromium|webkit。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium, webkit } = pw
const kind = process.env.RTE_BROWSER === 'webkit' ? 'webkit' : 'chromium'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
mkdirSync(out, { recursive: true })
const id = `${kind.slice(0, 2)}${Date.now().toString(36)}`

const browser =
  kind === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
  acceptDownloads: true,
})
const page = await context.newPage()
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
await page.waitForFunction(() =>
  [...document.querySelectorAll('.ym-block h3')].some((el) => el.textContent?.includes('如何定性定量分析')),
)
await page.evaluate(() => {
  const block = [...document.querySelectorAll('.ym-block')].find((el) =>
    el.querySelector('h3')?.textContent?.includes('如何定性定量分析'),
  )
  block?.querySelector('button[aria-label="最大化"]')?.click()
})
await page.waitForSelector('.pm-overlay .ProseMirror')
const backupHtml = await withEditor((editor) => editor.getHTML())

async function withEditor(fn, arg) {
  return page.evaluate(
    async ({ fnSource, arg }) => {
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
      const run = new Function('editor', 'arg', `return (${fnSource})(editor, arg)`)
      return await run(editor, arg)
    },
    { fnSource: fn.toString(), arg },
  )
}

function png(w, h, color, label) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(label, 8, Math.min(36, h - 8))
  return canvas.toDataURL('image/png')
}

await withEditor((editor, arg) => {
  const { id } = arg
  const make = (w, h, color, label) => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText(label, 8, Math.min(36, h - 8))
    return canvas.toDataURL('image/png')
  }
  const shot = (alt, w, h, color) => {
    editor.chain().focus('end').insertContent('<p></p>').setImage({ src: make(w, h, color, alt), alt }).run()
  }
  editor.chain().focus('end').insertContent(`<p>${id}段落甲</p>`).run()
  shot(`${id}横`, 240, 80, '#e11d48')
  editor.chain().focus('end').insertContent(`<p>${id}段落乙</p>`).run()
  shot(`${id}竖`, 200, 80, '#2563eb')
  shot(`${id}方`, 120, 80, '#16a34a')
  shot(`${id}橙`, 180, 80, '#d97706')
  editor.chain().focus('end').insertContent(`<p>${id}下段</p>`).run()
  shot(`${id}组源`, 160, 90, '#7c3aed')
  shot(`${id}组伴`, 120, 160, '#0891b2')
  const extras = []
  for (let n = 0; n < 10; n += 1) {
    const alt = `${id}满${n}`
    extras.push(alt)
    shot(alt, 80 + (n % 3) * 20, 70 + (n % 2) * 30, n % 2 ? '#be123c' : '#1d4ed8')
  }
  shot(`${id}超额`, 100, 80, '#0f766e')
  return extras
}, { id })

async function scrollTo(alt) {
  await page.evaluate((name) => {
    const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
    const canvas = img?.closest('.rte-canvas')
    if (!(img instanceof HTMLElement) || !(canvas instanceof HTMLElement)) return
    const toolbar = document.querySelector('.pm-overlay .rte-toolbar')
    const limit = (toolbar?.getBoundingClientRect().bottom || 0) + 28
    canvas.scrollTop += img.getBoundingClientRect().top - limit
  }, alt)
  await page.waitForTimeout(90)
}

async function box(alt) {
  const loc = page.locator(`.pm-overlay img[alt="${alt}"]`)
  if (!(await loc.count())) return null
  return loc.boundingBox({ timeout: 3000 }).catch(() => null)
}

async function showAlts(alts) {
  await page.evaluate((names) => {
    const imgs = names
      .map((name) => document.querySelector(`.pm-overlay img[alt="${name}"]`))
      .filter((img) => img instanceof HTMLElement)
    const canvas = imgs[0]?.closest('.rte-canvas')
    if (!imgs.length || !(canvas instanceof HTMLElement)) return
    const toolbar = document.querySelector('.pm-overlay .rte-toolbar')
    const limit = (toolbar?.getBoundingClientRect().bottom || 0) + 28
    const top = Math.min(...imgs.map((img) => img.getBoundingClientRect().top))
    canvas.scrollTop += top - limit
  }, alts)
  await page.waitForTimeout(90)
}

async function info(alt) {
  return page.evaluate((name) => {
    const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
    if (!img) return { missing: true }
    const group = img.closest('[data-type="image-group"]')
    if (!group) {
      const prev = img.closest('[data-resize-container]')?.previousElementSibling
      const next = img.closest('[data-resize-container]')?.nextElementSibling
      return {
        grouped: false,
        prev: prev?.textContent?.slice(0, 24) || prev?.getAttribute?.('alt') || '',
        next: next?.textContent?.slice(0, 24) || '',
      }
    }
    const imgs = [...group.querySelectorAll('img')]
    const rects = imgs.map((el) => el.getBoundingClientRect())
    const gaps = []
    for (let i = 1; i < rects.length; i += 1) gaps.push(Math.round(rects[i].left - rects[i - 1].right))
    const row = group.querySelector('.rte-image-group-row')?.getBoundingClientRect()
    return {
      grouped: true,
      alts: imgs.map((el) => el.getAttribute('alt')),
      heights: rects.map((r) => Math.round(r.height)),
      widths: rects.map((r) => Math.round(r.width)),
      gaps,
      rowWidth: Math.round(row?.width || 0),
      mode: group.getAttribute('data-ratio-mode') || '',
      ratios: group.getAttribute('data-ratios') || '',
      count: imgs.length,
    }
  }, alt)
}

async function hitAlt(x, y) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest?.('[data-resize-container]')?.querySelector('img')?.getAttribute('alt') || el?.tagName || ''
  }, { x, y })
}

async function gesture(fromAlt, x, y) {
  const start = await box(fromAlt)
  if (!start || x == null || y == null) return { kind: '', line: false, vertical: false, horizontal: false, color: '', thumb: false, ghost: false, ghostOpacity: 1, tip: '', missing: true }
  let sx = start.x + start.width * 0.55
  let sy = start.y + start.height * 0.5
  for (let i = 0; i < 8 && (await hitAlt(sx, sy)) !== fromAlt; i += 1) sy += 12
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 16 })
  await page.waitForTimeout(80)
  const mid = await page.evaluate(() => {
    const line = document.querySelector('.rte-image-drop-line')
    const rect = line?.getBoundingClientRect()
    const ghost = document.querySelector('.rte-image-drag-source')
    return {
      kind: line?.dataset.kind || '',
      line: !!line,
      vertical: !!rect && rect.width <= 8 && rect.height > 16,
      horizontal: !!rect && rect.height <= 8 && rect.width > 20,
      color: line ? getComputedStyle(line).backgroundColor : '',
      thumb: !!document.querySelector('.rte-image-drag-thumb'),
      ghost: !!ghost,
      ghostOpacity: ghost ? Number(getComputedStyle(ghost).opacity) : 1,
      tip: document.querySelector('.rte-image-size-tip')?.textContent || '',
    }
  })
  await page.mouse.up()
  await page.waitForTimeout(200)
  return mid
}

async function edge(alt, side, also = []) {
  await showAlts([alt, ...also].filter(Boolean))
  const target = await box(alt)
  if (!target) return null
  const ratio = side === 'left' ? 0.2 : 0.82
  const point = { x: target.x + target.width * ratio, y: target.y + target.height * 0.5, target }
  point.hit = await hitAlt(point.x, point.y)
  for (let i = 0; i < 8 && point.hit !== alt; i += 1) {
    point.y += 8
    point.hit = await hitAlt(point.x, point.y)
  }
  return point
}

try {
const para = page.locator('.pm-overlay p', { hasText: `${id}段落乙` })
await para.evaluate((el) => el.scrollIntoView({ block: 'center' }))
const paraBox = await para.boundingBox()
const between = await gesture(`${id}横`, paraBox.x + 48, paraBox.y + paraBox.height * 0.72)
await page.screenshot({ path: `${out}/parity_${kind}_01_hline.png` })
const moved = await info(`${id}横`)
log('1 段落间蓝色横线并成为独立一行', between.horizontal && between.color.includes('51, 112, 255') && moved.grouped === false, JSON.stringify(between))

const left = await edge(`${id}竖`, 'left', [`${id}方`])
const joinLeft = await gesture(`${id}方`, left?.x, left?.y)
await page.screenshot({ path: `${out}/parity_${kind}_02_vline.png` })
const rowStart = await info(`${id}方`)
const dropDebug = await page.evaluate(() => window.__rteDrop || null)
log('2 左缘蓝竖线插入行首', joinLeft.vertical && joinLeft.kind === 'left' && rowStart.alts?.[0] === `${id}方`, JSON.stringify({ hit: left?.hit, joinLeft, alts: rowStart.alts, dropDebug }))

const right = await edge(`${id}竖`, 'right', [`${id}橙`])
const joinRight = await gesture(`${id}橙`, right?.x, right?.y)
const rowEnd = await info(`${id}橙`)
log('2 右缘蓝竖线插入行尾', joinRight.vertical && joinRight.kind === 'right' && rowEnd.alts?.at(-1) === `${id}橙`, JSON.stringify(rowEnd.alts))

const midHost = rowEnd.alts?.[1]
let midOrder = []
if (!midHost) log('2 行中插入', false, '没有行中图片')
else {
  const midEdge = await edge(midHost, 'right', [`${id}横`])
  const beforeOrder = (await info(midHost)).alts
  await gesture(`${id}横`, midEdge?.x, midEdge?.y)
  midOrder = (await info(`${id}横`)).alts || []
  const midIndex = midOrder.indexOf(`${id}横`)
  log('2 行中插入', midIndex > 0 && midIndex < midOrder.length - 1, JSON.stringify({ beforeOrder, midOrder }))
}

const reorderFrom = midOrder[0]
const reorderTo = midOrder.at(-1)
if (reorderFrom && reorderTo) {
  const reorderEdge = await edge(reorderTo, 'right', [reorderFrom])
  await gesture(reorderFrom, reorderEdge?.x, reorderEdge?.y)
  const reordered = (await info(reorderTo)).alts || []
  log('3 组内按右缘重排', reordered.at(-1) === reorderFrom && reordered[0] !== reorderFrom, JSON.stringify(reordered))
} else log('3 组内按右缘重排', false, '没有可重排的组')

const srcA = `${id}组源`
const srcB = `${id}组伴`
const pairEdge = await edge(srcB, 'left', [srcA])
await gesture(srcA, pairEdge?.x, pairEdge?.y)
const pair = await info(srcA)
log('4 准备两张一组', pair.grouped && pair.count === 2, JSON.stringify(pair.alts))
const other = (await info(`${id}橙`)).alts?.[0] || `${id}橙`
const cross = await edge(other, 'left')
await gesture(srcA, cross?.x, cross?.y)
const leftBehind = await info(srcB)
const joinedElsewhere = await info(srcA)
log(
  '4 跨行后源组只剩一张则还原成单图',
  leftBehind.grouped === false && joinedElsewhere.grouped === true,
  JSON.stringify({ leftBehind, joined: joinedElsewhere.alts }),
)

const still = (await info(`${id}方`)).alts || []
const pull = still.find((alt) => alt !== still[0]) || still[0]
const lower = page.locator('.pm-overlay p', { hasText: `${id}下段` })
await lower.evaluate((el) => el.scrollIntoView({ block: 'center' }))
const lowerBox = await lower.boundingBox()
const outLine = lowerBox && pull ? await gesture(pull, lowerBox.x + 40, lowerBox.y + Math.max(8, lowerBox.height * 0.7)) : { horizontal: false, kind: '' }
const pulled = await info(pull)
log('5 拖到下方蓝横线后脱离成单独一行', outLine.horizontal && pulled.grouped === false, JSON.stringify({ outLine: outLine.kind, pulled }))

{
  const back = await edge(srcA, 'right', [srcB])
  if (back) await gesture(srcB, back.x, back.y)
}
await showAlts([srcA, `${id}段落甲`])
const handleBox = await page.evaluate((name) => {
  const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
  const bar = img?.closest('[data-type="image-group"]')?.querySelector('.rte-image-group-bar')
  const handle = bar?.querySelector('.rte-image-group-handle')
  if (!(handle instanceof HTMLElement)) return null
  handle.closest('[data-type="image-group"]')?.classList.add('is-selected')
  if (bar) bar.style.display = 'flex'
  const rect = handle.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height }
}, srcA)
let groupMoved = false
if (handleBox && handleBox.w > 2 && handleBox.y > 0) {
  const beforePrev = await page.evaluate((name) => {
    const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
    return img?.closest('[data-type="image-group"]')?.previousElementSibling?.textContent?.slice(0, 40) || ''
  }, srcA)
  await page.mouse.move(handleBox.x, handleBox.y)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + 40, Math.min(860, handleBox.y + 180), { steps: 12 })
  const lineKind = await page.evaluate(() => document.querySelector('.rte-image-drop-line')?.dataset.kind || '')
  await page.mouse.up()
  await page.waitForTimeout(200)
  const afterPrev = await page.evaluate((name) => {
    const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
    return img?.closest('[data-type="image-group"]')?.previousElementSibling?.textContent?.slice(0, 40) || ''
  }, srcA)
  groupMoved = lineKind === 'before' || lineKind === 'after' || (!!afterPrev && afterPrev !== beforePrev)
}
await page.screenshot({ path: `${out}/parity_${kind}_06_group.png` })
log('6 整组手柄拖到其他块之间', groupMoved, JSON.stringify(handleBox))

await withEditor((editor, arg) => {
  const { id } = arg
  const paint = (color) => {
    const canvas = document.createElement('canvas')
    canvas.width = 72
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 72, 48)
    return canvas.toDataURL('image/png')
  }
  const content = []
  for (let n = 0; n < 10; n += 1) {
    content.push({ type: 'image', attrs: { src: paint('#334155'), alt: `${id}十${n}`, layout: 'block' } })
  }
  editor.chain().focus('end').insertContent({ type: 'imageGroup', attrs: { align: 'center' }, content }).run()
  editor.chain().focus('end').insertContent('<p></p>').setImage({ src: paint('#b91c1c'), alt: `${id}十一` }).run()
  return editor.getHTML().includes(`${id}十9`) && editor.getHTML().includes(`${id}十一`)
}, { id })
const limitTarget = `${id}十9`
const limitEdge = await edge(limitTarget, 'right', [`${id}十一`])
const fromLimit = await box(`${id}十一`)
if (fromLimit && limitEdge) {
await page.mouse.move(fromLimit.x + fromLimit.width / 2, fromLimit.y + fromLimit.height / 2)
await page.mouse.down()
await page.mouse.move(limitEdge.x, limitEdge.y, { steps: 12 })
await page.waitForTimeout(100)
let limitMid = await page.evaluate(() => document.querySelector('.rte-image-size-tip')?.textContent || '')
await page.screenshot({ path: `${out}/parity_${kind}_07_limit.png` })
await page.mouse.up()
await page.waitForTimeout(80)
if (!limitMid) limitMid = await page.evaluate(() => document.querySelector('.rte-image-size-tip')?.textContent || '')
const limitCount = (await info(limitTarget)).count
log('7 第 11 张提示且不插入', limitMid.includes('一行最多 10 张图片') && limitCount === 10, JSON.stringify({ limitMid, limitCount }))
} else log('7 第 11 张提示且不插入', false, '找不到第 11 张或满行')

const aspect = await info(`${id}方`)
const heights = aspect.heights || []
const equal = heights.length >= 2 && Math.max(...heights) - Math.min(...heights) <= 2
const gapOk = (aspect.gaps || []).every((gap) => Math.abs(gap - 8) <= 2)
const wideFirst = (aspect.widths?.[0] || 0) > 0
log('10 并排等高、间距 8px', aspect.grouped && equal && gapOk, JSON.stringify({ heights, gaps: aspect.gaps, widths: aspect.widths, rowWidth: aspect.rowWidth }))
await page.screenshot({ path: `${out}/parity_${kind}_10_row.png` })

await showAlts([`${id}方`])
const divBox = await page.evaluate((name) => {
  const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
  const divider = img?.closest('[data-type="image-group"]')?.querySelector('.rte-image-group-divider')
  if (!(divider instanceof HTMLElement)) return null
  const mark = divider.querySelector('i')
  const rect = divider.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    w: rect.width,
    h: rect.height,
    opacity: mark ? getComputedStyle(mark).opacity : getComputedStyle(divider).opacity,
  }
}, `${id}方`)
const dividerHit = divBox
  ? await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return `${el?.className || el?.tagName || ''}`
    }, divBox)
  : ''
const dividerOpacity = divBox?.opacity || '0'
if (divBox && divBox.h > 4) {
  await page.mouse.move(divBox.x, divBox.y)
  await page.mouse.down()
  await page.mouse.move(divBox.x + 56, divBox.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
const custom = await info(`${id}方`)
await showAlts([`${id}方`])
const dividerNow = await page.evaluate((name) => {
  const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
  const divider = img?.closest('[data-type="image-group"]')?.querySelector('.rte-image-group-divider')
  if (!(divider instanceof HTMLElement)) return null
  const rect = divider.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}, `${id}方`)
if (dividerNow) {
  await page.mouse.dblclick(dividerNow.x, dividerNow.y)
  await page.waitForTimeout(150)
}
const restored = await info(`${id}方`)
await page.screenshot({ path: `${out}/parity_${kind}_08_divider.png` })
log(
  '8 分隔条拖动写入比例，双击恢复宽高比',
  custom.mode === 'custom' && custom.ratios && !restored.mode && !restored.ratios,
  JSON.stringify({ dividerHit, div: await page.evaluate(() => window.__divDown || null), custom: { mode: custom.mode, ratios: custom.ratios }, restored: { mode: restored.mode, ratios: restored.ratios } }),
)

await showAlts([`${id}竖`])
const chromeFrom = await box(`${id}竖`)
let sx = chromeFrom ? chromeFrom.x + chromeFrom.width * 0.55 : 0
let sy = chromeFrom ? chromeFrom.y + chromeFrom.height * 0.5 : 0
if (chromeFrom) {
  for (let i = 0; i < 8 && (await hitAlt(sx, sy)) !== `${id}竖`; i += 1) sy += 10
}
if (!chromeFrom) log('9 半透明、缩略图、蓝线、边缘滚动', false, '没有源图')
else {
await page.mouse.move(sx, sy)
await page.mouse.down()
const canvasBox = await page.locator('.pm-overlay .rte-canvas').boundingBox()
const scrollBefore = await page.evaluate(() => {
  const canvas = document.querySelector('.pm-overlay .rte-canvas')
  if (canvas) canvas.scrollTop = Math.max(0, canvas.scrollTop - 240)
  return canvas?.scrollTop || 0
})
await page.mouse.move(canvasBox.x + 80, canvasBox.y + canvasBox.height - 8, { steps: 10 })
await page.waitForTimeout(180)
const scrollAfter = await page.evaluate(() => document.querySelector('.pm-overlay .rte-canvas')?.scrollTop || 0)
const chrome = await page.evaluate(() => {
  const line = document.querySelector('.rte-image-drop-line')
  const ghost = document.querySelector('.rte-image-drag-source')
  return {
    line: !!line,
    color: line ? getComputedStyle(line).backgroundColor : '',
    thumb: !!document.querySelector('.rte-image-drag-thumb'),
    ghostOpacity: ghost ? Number(getComputedStyle(ghost).opacity) : 1,
  }
})
await page.screenshot({ path: `${out}/parity_${kind}_09_chrome.png` })
await page.mouse.up()
log(
  '9 半透明、缩略图、蓝线、边缘滚动',
  chrome.ghostOpacity > 0 && chrome.ghostOpacity < 0.6 && chrome.thumb && chrome.line && chrome.color.includes('51, 112, 255') && scrollAfter > scrollBefore,
  JSON.stringify({ chrome, scrollBefore, scrollAfter }),
)
}

await withEditor((editor, arg) => {
  const canvas = document.createElement('canvas')
  canvas.width = 180
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0f766e'
  ctx.fillRect(0, 0, 180, 80)
  editor.chain().focus('end').insertContent('<p></p>').setImage({ src: canvas.toDataURL('image/png'), alt: `${arg.id}缩放` }).run()
  return true
}, { id })
const solo = `${id}缩放`
await showAlts([solo])
const soloBox = await box(solo)
if (soloBox) await page.mouse.click(soloBox.x + soloBox.width * 0.5, soloBox.y + soloBox.height * 0.5)
const beforeResize = await box(solo)
const resizeBox = await page.evaluate((name) => {
  const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
  const handle = img?.closest('[data-resize-container]')?.querySelector('[data-resize-handle="bottom-right"]')
  if (!(handle instanceof HTMLElement)) return null
  const rect = handle.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width }
}, solo)
if (resizeBox && beforeResize) {
  await page.mouse.move(resizeBox.x, resizeBox.y)
  await page.mouse.down()
  await page.mouse.move(resizeBox.x + 46, resizeBox.y + 28, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}
const afterResize = await box(solo)
await page.locator(`button[aria-label="图片居左"]`).click().catch(() => {})
await page.locator('.rte-image-caption-input').fill('题注样本')
await page.locator('button[title="应用题注"]').click()
const captioned = await page.evaluate((name) => document.querySelector(`.pm-overlay img[alt="${name}"]`)?.getAttribute('data-caption') || '', solo)
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 4000 }).catch(() => null),
  page.locator('button[aria-label="下载图片"]').click(),
])
await page.locator('button[aria-label="查看大图"]').click()
const lightbox = await page.locator('.rte-image-lightbox').count()
await page.locator('.rte-image-lightbox').click({ force: true }).catch(() => {})
log(
  '11 缩放、对齐题注、下载、大图',
  !!afterResize && !!beforeResize && afterResize.width > beforeResize.width + 8 && captioned === '题注样本' && !!download && lightbox > 0,
  JSON.stringify({ dw: afterResize && beforeResize ? Math.round(afterResize.width - beforeResize.width) : null, captioned, download: !!download, lightbox }),
)

await withEditor((editor, arg) => {
  const paint = (color) => {
    const canvas = document.createElement('canvas')
    canvas.width = 140
    canvas.height = 70
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 140, 70)
    return canvas.toDataURL('image/png')
  }
  editor.chain().focus('end').insertContent([
    { type: 'image', attrs: { src: paint('#e11d48'), alt: `${arg.id}键甲`, layout: 'block' } },
    { type: 'image', attrs: { src: paint('#16a34a'), alt: `${arg.id}键乙`, layout: 'block' } },
  ]).run()
  return true
}, { id })
await showAlts([`${id}键甲`])
const keyBox = await box(`${id}键甲`)
if (keyBox) {
  await page.mouse.move(keyBox.x + keyBox.width * 0.6, keyBox.y + keyBox.height * 0.5)
  await page.mouse.down()
  await page.mouse.up()
}
await page.waitForTimeout(80)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(80)
const selectedAlt = await page.evaluate(() => {
  let el = document.querySelector('.pm-overlay .rte-root')
  let editor = null
  while (el) {
    const exposed = el.__vueParentComponent?.exposed
    const candidate = exposed?.editor?.state ? exposed.editor : exposed?.editor?.value
    if (candidate?.state) { editor = candidate; break }
    el = el.parentElement
  }
  return editor?.state?.selection?.node?.attrs?.alt || ''
})
await page.keyboard.press('Backspace')
await page.waitForTimeout(120)
const deleted = await page.locator(`.pm-overlay img[alt="${id}键乙"]`).count()
log('12 Delete 删除，方向键移动选区', selectedAlt === `${id}键乙` && deleted === 0, JSON.stringify({ selectedAlt, deleted }))

await withEditor((editor, arg) => {
  const paint = (color, label) => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 120, 64)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, 8, 28)
    return canvas.toDataURL('image/png')
  }
  editor.chain().focus('end').insertContent([
    { type: 'image', attrs: { src: paint('#7c3aed', '甲'), alt: `${arg.id}撤甲`, layout: 'block' } },
    { type: 'image', attrs: { src: paint('#0891b2', '乙'), alt: `${arg.id}撤乙`, layout: 'block' } },
  ]).run()
  return true
}, { id })
const undoEdge = await edge(`${id}撤乙`, 'left', [`${id}撤甲`])
await gesture(`${id}撤甲`, undoEdge?.x, undoEdge?.y)
const undoJoined = await info(`${id}撤甲`)
await page.keyboard.press('Control+z')
await page.waitForTimeout(250)
const undoSplit = await info(`${id}撤甲`)
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(250)
const redoJoined = await info(`${id}撤甲`)
log(
  '13 Ctrl+Z / Ctrl+Shift+Z',
  undoJoined.grouped === true && undoSplit.grouped === false && redoJoined.grouped === true,
  JSON.stringify({ undoJoined: undoJoined.alts || undoJoined.grouped, undoSplit: undoSplit.grouped, redoJoined: redoJoined.alts || redoJoined.grouped }),
)

const fileHost = `${id}方`
await showAlts([fileHost])
const hostBefore = await info(fileHost)
const dropped = await page.evaluate(async (name) => {
  const img = document.querySelector(`.pm-overlay img[alt="${name}"]`)
  if (!img) return { ok: false, reason: 'missing' }
  const rect = img.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, 48, 48)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  const file = new File([blob], 'beside.png', { type: 'image/png' })
  const data = new DataTransfer()
  data.items.add(file)
  const x = rect.left + 10
  const y = rect.top + rect.height / 2
  const target = document.elementFromPoint(x, y) || img
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: data }))
  const prose = img.closest('.ProseMirror')
  prose?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: data }))
  prose?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: data }))
  return { ok: true, files: data.files.length }
}, fileHost)
await page.waitForTimeout(400)
const fileAfter = await info(fileHost)
log(
  '14 文件拖到左缘插入该行而不是替换',
  dropped.ok && fileAfter.grouped && (fileAfter.count || 0) > (hostBefore.count || 1) && (fileAfter.alts || []).includes(fileHost),
  JSON.stringify({ hostBefore: hostBefore.alts || hostBefore.count, fileAfter: fileAfter.alts }),
)

const preview = page.locator('.pm-overlay .rte-bottom-link', { hasText: '预览' })
await preview.click({ force: true })
await page.waitForSelector('.pm-overlay .rte-preview-banner')
const editable = await withEditor((editor) => editor.isEditable)
const frozen = await info(fileHost)
const frozenBox = await box((frozen.alts || [fileHost])[0])
if (frozenBox) {
await page.mouse.move(frozenBox.x + frozenBox.width / 2, frozenBox.y + frozenBox.height / 2)
await page.mouse.down()
await page.mouse.move(frozenBox.x + 80, frozenBox.y + 10, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(150)
const stillFrozen = await info(fileHost)
await page.screenshot({ path: `${out}/parity_${kind}_15_preview.png` })
log('15 预览不可拖', editable === false && JSON.stringify(frozen.alts) === JSON.stringify(stillFrozen.alts), JSON.stringify({ editable, frozen: frozen.alts, stillFrozen: stillFrozen.alts }))
} else log('15 预览不可拖', false, '预览里找不到图片')

await page.locator('.pm-overlay .rte-preview-back').click()
await page.locator('.pm-overlay button', { hasText: '打印' }).first().click()
await page.waitForSelector('.rte-print-preview-paper')
const printed = await page.evaluate((name) => {
  const paper = document.querySelector('.rte-print-preview-paper')
  return !!paper?.querySelector(`[data-type="image-group"] img[alt="${name}"], img[alt="${name}"]`)
}, fileHost)
await page.screenshot({ path: `${out}/parity_${kind}_15_print.png` })
await page.locator('.rte-print-preview-overlay .rte-modal-cancel').click()
log('15 打印预览沿用同一组图片', printed)

const migrated = await withEditor((editor, arg) => {
  const src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  editor.commands.setContent(
    `<div data-type="columns" data-cols="2"><div data-type="column"><img src="${src}" alt="${arg.id}旧甲"></div><div data-type="column"><img src="${src}" alt="${arg.id}旧乙"></div></div><p>migrated</p>`,
  )
  return editor.getHTML().includes('image-group')
}, { id })
log('15 旧图片分栏迁成图片组', migrated === true, String(migrated))
} catch (error) {
  console.error('ABORT', error)
  notes.push({ step: '脚本中断', ok: false, detail: String(error?.message || error) })
}
await withEditor((editor, html) => {
  editor.commands.setContent(html, { emitUpdate: true })
  return true
}, backupHtml)
await page.waitForTimeout(400)

console.log(JSON.stringify(notes, null, 2))
const video = page.video()
await context.close()
if (video) {
  const saved = await video.path()
  console.log('VIDEO', saved)
}
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
