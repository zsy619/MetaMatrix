/**
 * 画布克隆（浏览器端到端）：登录 → 打开画布 → 页面设置面板点「克隆画布」
 * → URL 的 documentId 变成新 UUID → 副本渲染与源文档一致（正文文本 + 面板素材）。
 *
 * 需要：
 *   - API 已启动：CLONE_E2E_API（默认 http://127.0.0.1:31717）
 *   - 前端已启动：CLONE_E2E_WEB（默认 http://127.0.0.1:5177）
 *   - 浏览器：CHROME_PATH 可指定；否则用 playwright 自带的 chromium
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pw from 'playwright-core'

const { chromium } = pw
const here = path.dirname(fileURLToPath(import.meta.url))
const api = process.env.CLONE_E2E_API || 'http://127.0.0.1:31717'
const web = process.env.CLONE_E2E_WEB || 'http://127.0.0.1:5177'
const out = process.env.CLONE_E2E_OUT || path.join(os.tmpdir(), 'metamatrix-clone-e2e')
fs.mkdirSync(out, { recursive: true })

let failures = 0
const log = (step, ok, detail) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`)
}

async function call(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${api}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

/** 1x1 红色 PNG：用来验证附件素材在克隆后仍在。 */
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const template = JSON.parse(
  fs.readFileSync(path.join(here, '../src/templates/dual-triangle-v1.json'), 'utf8'),
)
const sourceData = {
  ...template,
  attachmentsByPanelId: {
    // 双三角画布的面板 key 形如 block:<blockId>（见 usePanelMaximize.panelMaximizeKey）
    'block:innovation': [
      {
        id: 'att_clone_probe',
        name: 'clone-probe.png',
        kind: 'file',
        mimeType: 'image/png',
        size: 68,
        dataUrl: PNG_1x1,
        createdAt: 1762000000000,
      },
    ],
  },
}

const email = `clone-e2e-${Date.now()}@example.com`
const password = 'clone-e2e-pass-1'
const registered = await call('/auth/register', {
  method: 'POST',
  body: { email, password, displayName: 'CloneE2E' },
})
const token = registered.token
const created = await call('/documents', {
  method: 'POST',
  token,
  body: {
    title: '克隆源画布',
    templateId: 'dual-triangle',
    canvasType: 'dual-triangle',
    data: sourceData,
  },
})
log('API 建档', !!created?.id, created?.id)

const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

try {
  await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('metamatrix:auth:token', t), token)

  await page.goto(`${web}/canvas/dual-triangle?documentId=${created.id}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.page-settings-panel', { timeout: 15000 })
  await page.waitForTimeout(1200)

  const sourceText = (await page.locator('main.main').innerText()).trim()
  log('源画布已渲染', sourceText.length > 0, `${sourceText.length} 字符`)
  const sourceHasAttachment = sourceText.includes('clone-probe.png')
  log('源画布渲染出面板附件', sourceHasAttachment)
  await page.screenshot({ path: path.join(out, '01-source.png'), fullPage: false })

  // 克隆前的源文档快照（从库里读，用于事后比对源文档是否被改动）。
  const sourceBefore = await call(`/documents/${created.id}`, { token })

  const cloneButton = page.getByRole('button', { name: '克隆画布' })
  await cloneButton.click()
  await page.waitForFunction(
    (old) => {
      const q = new URL(window.location.href).searchParams.get('documentId')
      return !!q && q !== old
    },
    created.id,
    { timeout: 20000 },
  )
  await page.waitForTimeout(1500)

  const newId = new URL(page.url()).searchParams.get('documentId')
  log('克隆后 documentId 变化', !!newId && newId !== created.id, `${created.id} → ${newId}`)
  await page.screenshot({ path: path.join(out, '02-clone.png'), fullPage: false })

  const cloneText = (await page.locator('main.main').innerText()).trim()
  log(
    '克隆后渲染正文与源一致',
    cloneText === sourceText,
    cloneText === sourceText ? '' : `源 ${sourceText.length} 字符 / 副本 ${cloneText.length} 字符`,
  )

  // 面板素材：副本文档里附件仍在，且内容与源一致。
  const sourceBody = await call(`/documents/${created.id}`, { token })
  const cloneBody = await call(`/documents/${newId}`, { token })
  log(
    '副本正文与源逐字段一致',
    JSON.stringify(cloneBody.currentData) === JSON.stringify(sourceBody.currentData),
  )
  log(
    '副本保留面板附件',
    cloneBody.currentData?.attachmentsByPanelId?.['block:innovation']?.[0]?.dataUrl === PNG_1x1,
  )
  log('副本渲染出面板附件', cloneText.includes('clone-probe.png'))
  log('副本标题带（副本）后缀', cloneBody.title === '克隆源画布（副本）', cloneBody.title)
  log(
    '源文档未被改动',
    sourceBody.title === '克隆源画布' &&
      JSON.stringify(sourceBody.currentData) === JSON.stringify(sourceBefore.currentData),
    sourceBody.title,
  )

  const revisions = await call(`/documents/${newId}/revisions`, { token })
  log(
    '副本有一条 clone 版本',
    Array.isArray(revisions) && revisions.length === 1 && revisions[0].label === 'clone',
    JSON.stringify(revisions?.map?.((r) => r.label)),
  )

  log('页面无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

if (failures > 0) {
  console.error(`clone-canvas-e2e failed: ${failures} 项未通过`)
  process.exit(1)
}
console.log(`clone-canvas-e2e ok，截图见 ${out}`)
