/**
 * 图片选择框 + 正文插图验收（隔离 mock，不连真实 API / 数据库）。
 *
 * 覆盖：素材库内部路径 /media/{id} 的缩略图可见、选择确认后正文出现所选图
 * （尺寸与像素内容可证，不是占位图）、文档序列化保留稳定 /media 路径、
 * 刷新重开同一文档仍可见、失效素材给出明确错误且可重试、错误文案不出现令牌、
 * 分类筛选与多选最小回归。
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
/** 复原「刷新后重开同一文档」用的本地存储键 */
const DOC_KEY = 'rte-media-e2e-doc'

/** 生成一张纯色 PNG（不依赖任何图片库）。 */
function makePng(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < width; x += 1) {
      // 每个像素 3 个字节（RGB），不能多跳过字节，否则整张图会错位
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

/** 两个可区分的素材：48x48 蓝、24x24 绿 */
const PNG_BLUE = makePng(48, 48, [91, 140, 255])
const PNG_GREEN = makePng(24, 24, [20, 180, 90])
const BLUE_RGB = [91, 140, 255]
const GREEN_RGB = [20, 180, 90]

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
      'metamatrix-rte-image-categories',
      JSON.stringify([{ id: 'cat-blue', name: '蓝色分类' }]),
    )
    window.localStorage.setItem(
      'metamatrix-rte-image-assets',
      JSON.stringify([
        { id: 'mock-1', src: '/media/mock-asset-1', name: 'ok.png', categoryId: 'uncategorized', createdAt: 1 },
        { id: 'mock-2', src: '/media/mock-missing', name: 'gone.png', categoryId: 'uncategorized', createdAt: 2 },
        { id: 'mock-3', src: '/media/mock-asset-2', name: 'blue.png', categoryId: 'cat-blue', createdAt: 3 },
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
      const signed = Boolean(url.searchParams.get('sig'))
      if (id === 'mock-asset-1' && !signed) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ previewUrl: '/media/mock-asset-1?exp=9999999999&sig=mock' }),
        })
        return
      }
      if (id === 'mock-asset-1') {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_BLUE })
        return
      }
      if (id === 'mock-asset-2' && !signed) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ previewUrl: '/media/mock-asset-2?exp=9999999999&sig=mock2' }),
        })
        return
      }
      if (id === 'mock-asset-2') {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_GREEN })
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

/** 缩略图按钮按素材名定位（title = 素材名）。 */
function thumb(dialog, name) {
  return dialog.locator(`.rte-image-thumb[title="${name}"]`)
}

/**
 * 正文里「已渲染出来」的素材图：返回尺寸与像素内容，用于证明不是占位图。
 *
 * 像素直接从当前 src 的字节解出来（blob: 走 fetch + createImageBitmap），
 * 避免编辑器重绘导致 <img> 元素被换掉、读到空白画布。
 */
async function bodyImages() {
  return await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.ProseMirror img')]
    const out = []
    for (const img of imgs) {
      const src = img.currentSrc || img.src || ''
      let rgb = null
      let err = ''
      try {
        let source = img
        let width = img.naturalWidth
        let height = img.naturalHeight
        if (src.startsWith('blob:')) {
          const res = await fetch(src)
          const blob = await res.blob()
          const bitmap = await createImageBitmap(blob)
          source = bitmap
          width = bitmap.width
          height = bitmap.height
        } else {
          await img.decode()
        }
        if (width > 0 && height > 0) {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(source, 0, 0)
          const d = ctx.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data
          rgb = [d[0], d[1], d[2]]
        }
      } catch (e) {
        err = String(e)
        rgb = null
      }
      out.push({
        src: (img.getAttribute('src') || '').slice(0, 16),
        w: img.naturalWidth,
        h: img.naturalHeight,
        rgb,
        err,
      })
    }
    return out
  })
}

await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })

// 1) 选择窗列出素材 + 缩略图可见
let dialog = await openImageDialog()
const thumbs = dialog.locator('.rte-image-thumb')
await thumbs.first().waitFor({ state: 'visible' })
check('选择框列出三个素材缩略图', (await thumbs.count()) === 3, `count=${await thumbs.count()}`)

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
const errorBox = thumb(dialog, 'gone.png').locator('.rte-image-thumb-error')
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

// 3) 分类筛选最小回归
await dialog.getByRole('button', { name: '未分类' }).click()
await page.waitForTimeout(200)
check('未分类筛选只剩未分类素材', (await thumbs.count()) === 2, `count=${await thumbs.count()}`)
await dialog.getByRole('button', { name: '蓝色分类' }).click()
await page.waitForTimeout(200)
check('分类筛选只剩该分类素材', (await thumbs.count()) === 1, `count=${await thumbs.count()}`)
check('分类筛选命中正确素材', (await thumb(dialog, 'blue.png').count()) === 1)
await dialog.getByRole('button', { name: '我的图片' }).click()
await page.waitForTimeout(200)
check('回到全部素材', (await thumbs.count()) === 3, `count=${await thumbs.count()}`)

// 4) 选择正确素材 → 确认 → 弹窗关闭
await thumb(dialog, 'ok.png').click()
await page.waitForTimeout(150)
const selectedNames = await page.evaluate(() =>
  [...document.querySelectorAll('.rte-image-thumb.selected')].map((el) => el.getAttribute('title')),
)
check('选中的是所选素材', selectedNames.length === 1 && selectedNames[0] === 'ok.png', JSON.stringify(selectedNames))
await dialog.getByRole('button', { name: '确认' }).click()
await dialog.waitFor({ state: 'hidden', timeout: 10000 })
check('确认后选择弹窗关闭', (await page.getByRole('dialog', { name: '插入图片' }).count()) === 0)

// 5) 正文出现所选图（非占位：尺寸 + 像素内容可证）
await page.waitForFunction(
  () => {
    const img = [...document.querySelectorAll('.ProseMirror img')].find((i) => i.naturalWidth === 48)
    return !!img
  },
  null,
  { timeout: 15000 },
)
const inserted = (await bodyImages()).filter((i) => i.w === 48)
check('正文出现所选图（48x48）', inserted.length === 1, JSON.stringify(inserted))
check(
  '正文图片内容可证（像素等于素材原图颜色）',
  inserted.length === 1 &&
    inserted[0].rgb &&
    inserted[0].rgb[0] === BLUE_RGB[0] &&
    inserted[0].rgb[1] === BLUE_RGB[1] &&
    inserted[0].rgb[2] === BLUE_RGB[2],
  JSON.stringify(inserted),
)
const bodyHtml = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
check('正文序列化保留素材稳定路径', bodyHtml.includes('/media/mock-asset-1'), bodyHtml.slice(0, 160))
check('正文序列化不写入 blob 地址', !bodyHtml.includes('blob:'), bodyHtml.slice(0, 160))
await page.screenshot({ path: path.join(outDir, 'media-thumb-inserted.png') })

// 6) 刷新后重开同一文档：仍可见
await page.evaluate(
  ([key, html]) => window.localStorage.setItem(key, html),
  [DOC_KEY, bodyHtml],
)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })
const restored = await page.evaluate(
  ([key]) => {
    const html = window.localStorage.getItem(key) || ''
    window.__rte?.editor?.commands?.setContent?.(html)
    return html
  },
  [DOC_KEY],
)
await page.waitForFunction(
  () => {
    const img = [...document.querySelectorAll('.ProseMirror img')].find((i) => i.naturalWidth === 48)
    return !!img
  },
  null,
  { timeout: 15000 },
)
const reopened = (await bodyImages()).filter((i) => i.w === 48)
check(
  '刷新重开同一文档后图片仍可见且内容一致',
  reopened.length === 1 &&
    reopened[0].rgb &&
    reopened[0].rgb[0] === BLUE_RGB[0] &&
    reopened[0].rgb[1] === BLUE_RGB[1] &&
    reopened[0].rgb[2] === BLUE_RGB[2],
  JSON.stringify(reopened),
)
const reopenedHtml = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
check('刷新重开后序列化仍是稳定路径', reopenedHtml.includes('/media/mock-asset-1') && !reopenedHtml.includes('blob:'))
check('复原用的文档内容确实来自保存结果', restored.includes('/media/mock-asset-1'), restored.slice(0, 120))

// 7) 刷新后重新打开选择窗：缩略图仍可见
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

// 8) 多选最小回归：两张素材一次插入
await thumb(dialog, 'ok.png').click()
await thumb(dialog, 'blue.png').click()
await page.waitForTimeout(150)
const multiSelected = await page.evaluate(() =>
  [...document.querySelectorAll('.rte-image-thumb.selected')].map((el) => el.getAttribute('title')),
)
check('多选命中两张素材', multiSelected.length === 2, JSON.stringify(multiSelected))
await dialog.getByRole('button', { name: '确认' }).click()
await dialog.waitFor({ state: 'hidden', timeout: 10000 })
await page.waitForFunction(
  () => {
    const imgs = [...document.querySelectorAll('.ProseMirror img')]
    return imgs.some((i) => i.naturalWidth === 48) && imgs.some((i) => i.naturalWidth === 24)
  },
  null,
  { timeout: 15000 },
)
const multiHtml = await page.evaluate(() => window.__rte?.editor?.getHTML?.() || '')
check('多选后正文序列化含两张素材路径', multiHtml.includes('/media/mock-asset-1') && multiHtml.includes('/media/mock-asset-2'))
const multiImages = await bodyImages()
check(
  '多选后正文两张图都渲染出正确内容',
  multiImages.filter((i) => i.w === 24 && i.rgb && i.rgb[1] === GREEN_RGB[1]).length === 1 &&
    multiImages.filter((i) => i.w === 48 && i.rgb && i.rgb[0] === BLUE_RGB[0]).length >= 1,
  JSON.stringify(multiImages),
)
await page.screenshot({ path: path.join(outDir, 'media-thumb-multi.png') })

await browser.close()
console.log(`\n全部通过：${results.length} 项`)
