/**
 * 运行监控面板浏览器实测（批次 M 前端接线）。
 *
 * 验证四组能力在**界面上**真的可用（不是只有接口）：
 *   1. 运行指标：能拉到 P50/P95/慢查询/死信等卡片；
 *   2. 事件死信：能列出死信（无死信时是空态，不报错）；
 *   3. 导入任务：能列出导入任务并显示进度；
 *   4. 通讯录分组：能新建分组、在表格里看到、成员可选。
 *
 * 前置：后端 http://127.0.0.1:3000、前端 http://127.0.0.1:5173 均已启动。
 * 用法：node scripts/base-ops-panel-e2e.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pw from 'playwright-core'

const { chromium } = pw
const api = process.env.BASE_E2E_API || 'http://127.0.0.1:3000'
const web = process.env.BASE_E2E_WEB || 'http://127.0.0.1:5173'
const out = process.env.BASE_E2E_OUT || path.join(os.tmpdir(), 'metamatrix-base-e2e')
fs.mkdirSync(out, { recursive: true })

let failures = 0
const log = (step, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ' — ' + detail : ''}`)
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
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

// —— 准备账号 / 空间 / Base ——
const email = `ops-${Date.now()}@example.com`
const challenge = await call('/auth/captcha')
const registered = await call('/auth/register', {
  method: 'POST',
  body: {
    email,
    password: 'ops-e2e-pass-1',
    displayName: 'OpsE2E',
    captchaId: challenge.captchaId,
    captchaCode: challenge.debugAnswer || '',
  },
})
const token = registered.token
const project = await call('/projects', { method: 'POST', token, body: { name: 'Ops E2E 空间' } })
const projectId = project.id
const basePath = `/projects/${projectId}/base`
const base = await call(`${basePath}/bases`, { method: 'POST', token, body: { name: 'Ops Base' } })
const tables = await call(`${basePath}/${base.id}/tables`, { token })
const tableId = tables[0].id
// 多维表格界面挂在知识库的「表格」节点上，先建一个 sheet 节点。
const sheetNode = await call(`/projects/${projectId}/knowledge/nodes`, {
  method: 'POST',
  token,
  body: { nodeType: 'sheet', title: 'Ops E2E 表格' },
})
log('准备账号与空间', !!token && !!projectId && !!base.id && !!sheetNode?.id, projectId)

// —— 浏览器 ——
const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

try {
  await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('metamatrix:auth:token', t), token)
  // 新用户首次进入会弹启动引导（LaunchSplash），它会拦截所有点击。
  await page.waitForTimeout(1200)
  const skip = page.locator('.splash button:has-text("跳过")')
  if (await skip.count()) {
    await skip.first().click().catch(() => {})
    await page.waitForTimeout(700)
  }
  await page.goto(`${web}/projects/${projectId}/knowledge`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const skip2 = page.locator('.splash button:has-text("跳过")')
  if (await skip2.count()) {
    await skip2.first().click().catch(() => {})
    await page.waitForTimeout(700)
  }

  // 打开刚建的表格节点，BaseEngineView 才会挂载。
  const treeNode = page.locator(`.kn-tree__node:has-text("${sheetNode.title}")`).first()
  if (await treeNode.count()) {
    await treeNode.click()
    await page.waitForTimeout(2500)
  }
  const hasOpsBtn = await page.locator('button:has-text("运行监控")').count()
  log('页面出现「运行监控」入口', hasOpsBtn > 0, `count=${hasOpsBtn}`)

  if (hasOpsBtn) {
    await page.locator('button:has-text("运行监控")').first().click()
    await page.waitForTimeout(1200)

    // 1) 运行指标
    const cards = await page.locator('.be-ops__card').count()
    log('运行指标页签渲染出指标卡片', cards >= 5, `${cards} 张卡片`)
    const cardText = await page.locator('.be-ops__card').first().innerText().catch(() => '')
    log('指标卡片含延迟数值', /ms/.test(cardText), cardText.replace(/\n/g, ' '))
    const shotMetrics = path.join(out, 'base-ops-metrics.png')
    await page.screenshot({ path: shotMetrics })
    log('指标页签截图', fs.existsSync(shotMetrics), shotMetrics)

    // 2) 事件死信
    await page.locator('.el-radio-button:has-text("事件死信")').click()
    await page.waitForTimeout(800)
    const deadEmpty = await page.locator('.el-empty').count()
    log('事件死信页签可切换', deadEmpty > 0 || (await page.locator('.el-table').count()) > 0)

    // 3) 导入任务
    await page.locator('.el-radio-button:has-text("导入任务")').click()
    await page.waitForTimeout(800)
    const jobsEmpty = await page.locator('.el-empty').count()
    log('导入任务页签可切换', jobsEmpty > 0 || (await page.locator('.el-table').count()) > 0)

    // 4) 通讯录分组（重点：真的能新建）
    await page.locator('.el-radio-button:has-text("通讯录分组")').click()
    await page.waitForTimeout(800)
    await page.locator('button:has-text("新建分组")').click()
    await page.waitForTimeout(600)
    const input = page.locator('.el-dialog input').first()
    await input.fill('销售一部')
    await page.locator('.el-dialog button:has-text("保存")').click()
    await page.waitForTimeout(1200)
    const groupRows = await page.locator('.el-table__row').count()
    log('新建通讯录分组后表格出现该分组', groupRows >= 1, `${groupRows} 行`)
    const groupText = await page.locator('.el-table').innerText().catch(() => '')
    log('分组名称正确写入', groupText.includes('销售一部'), groupText.replace(/\n/g, ' ').slice(0, 80))
    const shotGroups = path.join(out, 'base-ops-groups.png')
    await page.screenshot({ path: shotGroups })
    log('分组页签截图', fs.existsSync(shotGroups), shotGroups)
  }

  log('页面无 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
} catch (err) {
  log('浏览器实测', false, String(err))
} finally {
  await browser.close()
}

// —— 清理 ——
try {
  await call(`/projects/${projectId}`, { method: 'DELETE', token })
  log('清理 E2E 空间', true, projectId)
} catch (err) {
  log('清理 E2E 空间', false, String(err))
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
