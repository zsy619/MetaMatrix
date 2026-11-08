/**
 * 图片选择框缩略图验收（隔离 mock，不连真实 API / 数据库）。
 *
 * 覆盖：素材库内部路径 /media/{id} 的缩略图可见、选择确认后正文图片可见、
 * 刷新重开仍可见、失效素材给出明确错误且可重试、错误文案不出现令牌。
 *
 * 用法：vite 在 5173，然后 node scripts/rte-media-thumb-e2e.mjs
 */
import pw from 'playwright-core'
import { deflateSync } from 'node:zlib'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const { chromium } = pw
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const outDir = process.env.RTE_SHOT_DIR || '/workspace/outputs/metamatrix/artifacts/dsh-rte-ui-media-1107'
mkdirSync(outDir, { recursive: true })

const TOKEN = 'e2e-local-token-not-a-secret-value'

/** 生成一张纯色 PNG（不依赖任何图片库）。 */
function makePng(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < width; x += 1) {
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      offset += 3
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const table = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })()
  function crc32(buf) {
    let c = 0xffffffff
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return c ^ 0xffffffff
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const PNG = makePng(48, 48, [91, 140, 255])

const results = []
function check(step, ok, detail = '') {
  results.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ' — ' + detail : ''}`)
  if (!ok) throw new Error(`${step}: ${detail}`)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

// 令牌 + 素材清单（隔离 fixture，不连真实库）
await context.addInitScript(
  ([token]) => {
    window.localStorage.setItem('metamatrix:auth:token', token)
    window.localStorage.setItem(
      'metamatrix-rte-image-assets',
      JSON.stringify([
        { id: 'mock-1', src: '/media/mock-asset-1', name: 'ok.png', categoryId: 'uncategorized', createdAt: 1 },
        { id: 'mock-2', src: '/media/mock-missing', name: 'gone.png', categoryId: 'uncategorized', createdAt: 2 },
      ]),
    )
  },
  [TOKEN],
)

const page = await context.newPage()
const mediaHits = []

// 只拦截根路径 /api/（不要误伤 /src/api/ 之类的模块请求）
await page.route(
  (url) => url.pathname.startsWith('/api/'),
  async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/media/')) {
    mediaHits.push({ path: url.pathname, auth: route.request().headers().authorization || null })
    const id = url.pathname.replace('/api/media/', '')
    if (id === 'mock-asset-1' && !url.searchParams.get('sig')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ previewUrl: '/media/mock-asset-1?exp=9999999999&sig=mock' }),
      })
      return
    }
    if (id === 'mock-asset-1') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
      return
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'media not found' }),
    })
    return
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: null, items: [], total: 0 }),
  })
  },
)

async function openImageDialog() {
  const btn = page.getByRole('button', { name: '图片', exact: true }).first()
  if (!(await btn.isVisible())) {
    await page.getByRole('button', { name: '更多格式与插入' }).click()
  }
  await btn.click()
  const dialog = page.getByRole('dialog', { name: '插入图片' })
  await dialog.waitFor({ state: 'visible' })
  return dialog
}

await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })

// 1) 缩略图可见
let dialog = await openImageDialog()
const thumbs = dialog.locator('.rte-image-thumb')
await thumbs.first().waitFor({ state: 'visible' })
check('选择框列出两个素材缩略图', (await thumbs.count()) === 2, `count=${await thumbs.count()}`)

await page.waitForFunction(
  () => {
    const img = document.querySelector('.rte-image-thumb img')
    return !!img && img.getAttribute('src')?.startsWith('blob:') && img.naturalWidth > 0
  },
  null,
  { timeout: 15000 },
)
const thumbSrc = await page.evaluate(() => {
  const img = document.querySelector('.rte-image-thumb img')
  return { src: img.getAttribute('src') || '', w: img.naturalWidth, h: img.naturalHeight }
})
check('有效素材缩略图可见（blob 且有尺寸）', thumbSrc.src.startsWith('blob:') && thumbSrc.w > 0, JSON.stringify(thumbSrc))
check(
  '素材请求走 /api 且带登录令牌',
  mediaHits.length >= 2 && mediaHits.every((h) => h.auth === `Bearer ${TOKEN}`),
  JSON.stringify(mediaHits),
)
await page.screenshot({ path: path.join(outDir, 'media-thumb-dialog.png') })

// 2) 失效素材：明确错误 + 可重试
const errorBox = dialog.locator('.rte-image-thumb-error').first()
await errorBox.waitFor({ state: 'visible', timeout: 15000 })
const errorText = (await errorBox.innerText()).trim()
check('失效素材显示明确错误', errorText.includes('失效') || errorText.includes('失败'), errorText)
check('错误文案不包含令牌', !errorText.includes(TOKEN), errorText)
const retry = errorBox.locator('.rte-image-thumb-retry')
check('失效素材有重试入口', (await retry.count()) === 1)
const beforeRetry = mediaHits.length
await retry.click()
await page.waitForTimeout(800)
check('点击重试会重新请求素材接口', mediaHits.length > beforeRetry, `${beforeRetry} -> ${mediaHits.length}`)

// 3) 选择并确认：正文图片可见
await dialog.locator('.rte-image-thumb').first().click()
await dialog.getByRole('button', { name: '确认' }).click()
await page.waitForFunction(
  () => {
    const img = document.querySelector('.ProseMirror img[src^="/media/mock-asset-1"]')
    return !!img
  },
  null,
  { timeout: 15000 },
)
const bodyHtml = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
check('确认后正文保留素材稳定路径', bodyHtml.includes('/media/mock-asset-1'), bodyHtml.slice(0, 200))
await page.waitForFunction(
  () => {
    const img = document.querySelector('.ProseMirror img[src^="blob:"]')
    return !!img && img.naturalWidth > 0
  },
  null,
  { timeout: 15000 },
)
const bodyImg = await page.evaluate(() => {
  const img = document.querySelector('.ProseMirror img[src^="blob:"]')
  return { src: (img.getAttribute('src') || '').slice(0, 12), w: img.naturalWidth }
})
check('确认后正文图片可见', bodyImg.w > 0, JSON.stringify(bodyImg))
await page.screenshot({ path: path.join(outDir, 'media-thumb-inserted.png') })

// 4) 刷新重开：缩略图仍可见
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })
dialog = await openImageDialog()
await page.waitForFunction(
  () => {
    const img = document.querySelector('.rte-image-thumb img')
    return !!img && img.getAttribute('src')?.startsWith('blob:') && img.naturalWidth > 0
  },
  null,
  { timeout: 15000 },
)
check('刷新重开后缩略图仍可见', true)

await browser.close()
console.log(`\n全部通过：${results.length} 项`)
