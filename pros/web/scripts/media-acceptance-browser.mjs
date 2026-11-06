/**
 * 登录后的真实 Chromium 验收。
 * 验证码答案来自本机 CAPTCHA_DEBUG_LOOPBACK，不是绕过校验。
 * 粘贴和拖拽是页面里构造的 DataTransfer（无系统剪贴板），其余请求打到本机 API。
 */
import pw from 'playwright-core'
import { createHmac } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const { chromium } = pw
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const api = process.env.RTE_API_URL || 'http://127.0.0.1:3000'
const signSecret = process.env.MEDIA_SIGN_SECRET || 'acceptance-sign-secret'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
mkdirSync(out, { recursive: true })

const stamp = Date.now().toString(36)
const password = 'demo123456'
const emailA = `media-a-${stamp}@metamatrix.local`
const emailB = `media-b-${stamp}@metamatrix.local`

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok, detail: detail ?? '' })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

async function apiJSON(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return data
}

async function captcha() {
  return apiJSON('/auth/captcha')
}

async function register(email) {
  const challenge = await captcha()
  return apiJSON('/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      displayName: email,
      captchaId: challenge.captchaId,
      captchaCode: challenge.debugAnswer,
    },
  })
}

function sign(userId, assetId, exp) {
  return createHmac('sha256', signSecret)
    .update(`${userId}\n/media/${assetId}\n${exp}`)
    .digest('hex')
}

async function login(page, email) {
  await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-debug-answer]', { timeout: 15000 })
  const answer = await page.locator('[data-debug-answer]').getAttribute('data-debug-answer')
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await page.fill('#captcha-code', answer || '')
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 })
}

async function openEditor(page) {
  await page.goto(`${web}/canvas/y-model`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 20000 })
  await page.waitForTimeout(400)
}

async function dispatchFile(page, kind, bytes, name, type) {
  await page.evaluate(
    ({ kind, bytes, name, type }) => {
      const file = new File([new Uint8Array(bytes)], name, { type })
      const dt = new DataTransfer()
      dt.items.add(file)
      const target = document.querySelector('.ProseMirror')
      const event = new Event(kind === 'paste' ? 'paste' : 'drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: dt })
      Object.defineProperty(event, 'clientX', { value: target.getBoundingClientRect().left + 24 })
      Object.defineProperty(event, 'clientY', { value: target.getBoundingClientRect().top + 24 })
      target.dispatchEvent(event)
    },
    { kind, bytes: Array.from(bytes), name, type },
  )
}

await register(emailA)
await register(emailB)

const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const pageA = await contextA.newPage()
pageA.setDefaultTimeout(120000)
const workers = []
const mediaReqs = []
pageA.on('worker', (worker) => workers.push(worker.url()))
pageA.on('request', (req) => {
  if (req.url().includes('/api/media/')) mediaReqs.push(`${req.method()} ${req.url()}`)
})
pageA.on('pageerror', (err) => console.log('PAGEERROR', err.message))

await login(pageA, emailA)
await pageA.screenshot({ path: `${out}/media-login.png` })
await openEditor(pageA)
await pageA.screenshot({ path: `${out}/media-editor.png` })

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
)
const beforePaste = mediaReqs.length
await dispatchFile(pageA, 'paste', png, `paste-${stamp}.png`, 'image/png')
await pageA.waitForTimeout(2500)
const pasteReqs = mediaReqs.slice(beforePaste)
const workerHit = workers.some((url) => url.includes('mediaHash') || url.includes('worker'))
log('登录后粘贴启动哈希 Worker', workerHit, workers.join(' | ') || '(无 worker)')
log(
  '粘贴走到素材接口',
  pasteReqs.some((line) => line.includes('/api/media/check')) &&
    pasteReqs.some((line) => line.includes('/api/media/upload')),
  pasteReqs.join('\n'),
)
await pageA.screenshot({ path: `${out}/media-paste.png` })

const beforeAgain = mediaReqs.length
await dispatchFile(pageA, 'paste', png, `paste-${stamp}.png`, 'image/png')
await pageA.waitForTimeout(1500)
const againReqs = mediaReqs.slice(beforeAgain)
log(
  '同一用户再次粘贴只检查不重复上传',
  againReqs.some((line) => line.startsWith('POST') && line.includes('/api/media/check')) &&
    !againReqs.some((line) => line.includes('/api/media/upload') && !line.includes('/upload/chunk')),
  againReqs.join('\n'),
)

const beforeDrop = mediaReqs.length
await dispatchFile(pageA, 'drop', png, `drop-${stamp}.png`, 'image/png')
await pageA.waitForTimeout(1500)
const dropReqs = mediaReqs.slice(beforeDrop)
log(
  '拖拽同一字节也只检查不重复上传',
  dropReqs.some((line) => line.includes('/api/media/check')) &&
    !dropReqs.some((line) => line.includes('/api/media/upload') && !line.includes('chunk')),
  dropReqs.join('\n'),
)
await pageA.screenshot({ path: `${out}/media-drag.png` })

const userA = await pageA.evaluate(() => JSON.parse(localStorage.getItem('metamatrix:auth:user') || 'null'))
const tokenA = await pageA.evaluate(() => localStorage.getItem('metamatrix:auth:token'))
const listed = await apiJSON('/media?limit=5', { token: tokenA })
const asset = listed.items?.[0]
if (!asset) throw new Error('登录用户没有素材')
const previewPath = asset.previewUrl
const rangeRes = await pageA.evaluate(async ({ path, token }) => {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-3' } })
  const buf = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, len: buf.length, contentRange: res.headers.get('content-range') }
}, { path: previewPath, token: tokenA })
log('浏览器 Range 读取返回 206', rangeRes.status === 206 && rangeRes.len === 4, JSON.stringify(rangeRes))

const pastExp = 1_600_000_000
const expiredSig = sign(userA.id, asset.id, pastExp)
const expired = await pageA.evaluate(async ({ id, exp, sig, token }) => {
  const res = await fetch(`/api/media/${id}?exp=${exp}&sig=${sig}`, { headers: { Authorization: `Bearer ${token}` } })
  return { status: res.status, body: await res.text() }
}, { id: asset.id, exp: pastExp, sig: expiredSig, token: tokenA })
log('过期签名在浏览器里是 403', expired.status === 403, expired.body.slice(0, 180))

const ref = await pageA.evaluate(async ({ id, token }) => {
  const created = await fetch(`/api/media/${id}/references`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refType: 'document', refId: 'browser-doc', insertedPath: '/tmp/secret.png' }),
  })
  const createdBody = await created.json()
  const removed = await fetch(`/api/media/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  return { create: created.status, path: createdBody.insertedPath, delete: removed.status, body: await removed.text() }
}, { id: asset.id, token: tokenA })
log(
  '被引用后浏览器删除得到 409，路径仍是内部 id',
  ref.create === 201 && ref.delete === 409 && ref.path === `/media/${asset.id}`,
  JSON.stringify(ref),
)

const chunk = await pageA.evaluate(async () => {
  const token = localStorage.getItem('metamatrix:auth:token')
  const headers = { Authorization: `Bearer ${token}` }
  const size = 20 * 1024 * 1024 + 1
  const partSize = 4 * 1024 * 1024
  const raw = new Uint8Array(size)
  raw.fill(0x5a)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const preparedRes = await fetch('/api/media/upload/chunk/prepare', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalName: 'big.bin', mediaType: 'file', sizeBytes: size, partSize }),
  })
  const prepared = await preparedRes.json()
  const count = Math.ceil(size / partSize)
  for (let i = 0; i < count; i++) {
    if (i === 1) continue
    const start = i * partSize
    const res = await fetch(`/api/media/upload/chunk/${prepared.uploadId}/part?index=${i}`, {
      method: 'POST',
      headers,
      body: raw.slice(start, Math.min(size, start + partSize)),
    })
    if (!res.ok) return { step: 'part', index: i, status: res.status, body: await res.text() }
  }
  const early = await fetch(`/api/media/upload/chunk/${prepared.uploadId}/finish`, { method: 'POST', headers })
  const earlyBody = await early.text()
  const missingRes = await fetch(`/api/media/upload/chunk/${prepared.uploadId}`, { headers })
  const missing = await missingRes.json()
  const hole = await fetch(`/api/media/upload/chunk/${prepared.uploadId}/part?index=1`, {
    method: 'POST',
    headers,
    body: raw.slice(partSize, partSize * 2),
  })
  const doneRes = await fetch(`/api/media/upload/chunk/${prepared.uploadId}/finish`, { method: 'POST', headers })
  const done = await doneRes.json()
  return {
    early: early.status,
    earlyBody,
    missing: missing.missing,
    hole: hole.status,
    finish: doneRes.status,
    sha: done.sha256,
    want: sha,
    path: done.insertedPath,
    id: done.id,
  }
})
log(
  '浏览器里大于 20MB 缺片后续传，哈希一致',
  chunk.early === 409 && Array.isArray(chunk.missing) && chunk.missing.includes(1) && chunk.finish === 201 && chunk.sha === chunk.want && String(chunk.path || '').startsWith('/media/'),
  JSON.stringify(chunk),
)
await pageA.evaluate((text) => {
  const pre = document.createElement('pre')
  pre.id = 'accept-log'
  pre.textContent = text
  pre.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;background:#fff;padding:8px;max-width:70vw;font-size:12px'
  document.body.appendChild(pre)
}, JSON.stringify({ range: rangeRes, expired: expired.status, ref, chunk: { early: chunk.early, finish: chunk.finish, shaMatch: chunk.sha === chunk.want } }, null, 2))
await pageA.screenshot({ path: `${out}/media-browser-results.png` })

const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const pageB = await contextB.newPage()
await login(pageB, emailB)
const tokenB = await pageB.evaluate(() => localStorage.getItem('metamatrix:auth:token'))
const isolated = await pageB.evaluate(async ({ id, preview, token }) => {
  const meta = await fetch(`/api/media/${id}`, { headers: { Authorization: `Bearer ${token}` } })
  const replay = await fetch(`/api${preview}`, { headers: { Authorization: `Bearer ${token}` } })
  return { meta: meta.status, replay: replay.status }
}, { id: asset.id, preview: previewPath, token: tokenB })
log('另一个登录用户读不到对方素材', isolated.meta === 404 && isolated.replay === 403, JSON.stringify(isolated))
await pageB.screenshot({ path: `${out}/media-user-b.png` })

writeFileSync(`${out}/media-browser-evidence.json`, JSON.stringify({ emailA, emailB, workers, pasteReqs, againReqs, dropReqs, rangeRes, expired, ref, chunk, isolated, notes }, null, 2))
const failed = notes.filter((item) => !item.ok)
console.log(JSON.stringify({ passed: notes.length - failed.length, failed: failed.length }, null, 2))
await browser.close()
process.exit(failed.length ? 1 : 0)
