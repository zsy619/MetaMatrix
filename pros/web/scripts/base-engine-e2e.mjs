/**
 * 多维表格 Base Engine 端到端验收（技术文档 §15 验收清单）。
 *
 * 覆盖本轮补齐的 18 项里「可被用户观测到」的部分：
 *   1. 只读 GET：Base 详情 / 记录详情 / 视图详情；
 *   2. 视图查询接口：POST views/{viewId}/query（用视图自带的筛选 + 覆盖参数）；
 *   3. 事件类型补齐：schema.changed / field.created / record.created 等落到发件箱；
 *   4. 异步导入任务：提交 → 轮询 → 进度与失败明细；
 *   5. 可观测性指标：GET base/metrics（含 outbox / 幂等冲突计数）；
 *   6. 租户级限流：同一空间连续打接口仍可用（配额按空间动态放大）；
 *   7. 通讯录分组：user_groups 增删改查 + user_group 字段类型可注册；
 *   8. 死信治理：死信列表可读。
 *
 * 前置：后端 BASE_E2E_API（默认 http://127.0.0.1:3000）、前端 BASE_E2E_WEB（默认 http://127.0.0.1:5173）。
 * 输出：BASE_E2E_OUT（默认 /tmp/metamatrix-base-e2e）。
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
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// —— 1. 准备账号与空间 ——
const email = `base-e2e-${Date.now()}@example.com`
const password = 'base-e2e-pass-1'
// 注册需要验证码：开发环境 CAPTCHA_DEBUG=true 时挑战里会带明文答案。
const challenge = await call('/auth/captcha')
if (!challenge?.captchaId) throw new Error('获取验证码失败')
const registered = await call('/auth/register', {
  method: 'POST',
  body: {
    email,
    password,
    displayName: 'BaseE2E',
    captchaId: challenge.captchaId,
    captchaCode: challenge.debugAnswer || '',
  },
})
const token = registered.token
const project = await call('/projects', {
  method: 'POST',
  token,
  body: { name: 'Base E2E 空间' },
})
const projectId = project.id
log('创建空间', !!projectId, projectId)

const basePath = `/projects/${projectId}/base`

// —— 2. 建 Base / 表 / 字段 ——
const base = await call(`${basePath}/bases`, {
  method: 'POST',
  token,
  body: { name: 'E2E Base' },
})
log('创建 Base', !!base?.id, base?.id)
const baseId = base.id

const tables = await call(`${basePath}/${baseId}/tables`, { token })
log('默认数据表已播种', Array.isArray(tables) && tables.length > 0, `${tables?.length} 张表`)
const tableId = tables[0].id

const textField = await call(`${basePath}/tables/${tableId}/fields`, {
  method: 'POST',
  token,
  body: { name: '客户名称', type: 'text' },
})
log('创建文本字段', !!textField?.id, textField?.id)

const groupField = await call(`${basePath}/tables/${tableId}/fields`, {
  method: 'POST',
  token,
  body: { name: '所属分组', type: 'user_group' },
})
log('创建 user_group 字段', !!groupField?.id, groupField?.id)

// —— 3. 通讯录分组 ——
const group = await call(`${basePath}/user-groups`, {
  method: 'POST',
  token,
  body: { name: '销售一部', description: 'E2E', members: [] },
})
log('新建通讯录分组', !!group?.id, group?.id)
const groups = await call(`${basePath}/user-groups`, { token })
log('分组列表可读', Array.isArray(groups) && groups.length >= 1, `${groups?.length} 个分组`)
const patched = await call(`${basePath}/user-groups/${group.id}`, {
  method: 'PATCH',
  token,
  body: { name: '销售二部' },
})
log('修改通讯录分组', patched?.name === '销售二部', patched?.name)

// —— 4. 记录 + 只读 GET ——
const record = await call(`${basePath}/tables/${tableId}/records`, {
  method: 'POST',
  token,
  body: { fields: { [textField.id]: '北京科技有限公司', [groupField.id]: [group.id] } },
})
log('创建记录', !!record?.id, record?.id)
const fetchedRecord = await call(`${basePath}/records/${record.id}`, { token })
log('GET 记录详情', fetchedRecord?.id === record.id, fetchedRecord?.fields?.[textField.id])

const baseDetail = await call(`${basePath}/bases/${baseId}`, { token })
log('GET Base 详情', !!baseDetail?.base?.id || !!baseDetail?.id, JSON.stringify(baseDetail).slice(0, 80))

// —— 5. 视图 + 视图查询 ——
const view = await call(`${basePath}/tables/${tableId}/views`, {
  method: 'POST',
  token,
  body: { name: '网格视图', type: 'grid', config: {} },
})
log('创建视图', !!view?.id, view?.id)
const fetchedView = await call(`${basePath}/views/${view.id}`, { token })
log('GET 视图详情', fetchedView?.id === view.id, fetchedView?.name)
const viewQuery = await call(`${basePath}/views/${view.id}/query`, {
  method: 'POST',
  token,
  body: { pageSize: 10 },
})
log(
  'POST 视图查询',
  Array.isArray(viewQuery?.records) && viewQuery.records.length >= 1,
  `${viewQuery?.records?.length} 条记录`,
)
const filtered = await call(`${basePath}/views/${view.id}/query`, {
  method: 'POST',
  token,
  body: {
    pageSize: 10,
    filters: {
      logic: 'AND',
      conditions: [{ fieldId: textField.id, operator: 'contains', value: '北京' }],
    },
  },
})
log('视图查询支持覆盖筛选', filtered?.records?.length === 1, `${filtered?.records?.length} 条命中`)

// —— 6. 异步导入任务 ——
const rows = Array.from({ length: 25 }, (_, i) => ({ [textField.id]: `导入客户 ${i + 1}` }))
const job = await call(`${basePath}/tables/${tableId}/import-jobs`, {
  method: 'POST',
  token,
  body: { rows, mode: 'partial' },
})
log('提交异步导入任务', !!job?.id, `${job?.id} status=${job?.status}`)

let finalJob = job
for (let i = 0; i < 40; i += 1) {
  await new Promise((r) => setTimeout(r, 250))
  finalJob = await call(`${basePath}/import-jobs/${job.id}`, { token })
  if (['succeeded', 'partial', 'failed', 'cancelled'].includes(finalJob.status)) break
}
log(
  '导入任务跑完',
  finalJob?.status === 'succeeded' && finalJob?.succeeded === rows.length,
  `status=${finalJob?.status} succeeded=${finalJob?.succeeded}/${finalJob?.total}`,
)
const jobList = await call(`${basePath}/tables/${tableId}/import-jobs`, { token })
log('导入任务列表可读', Array.isArray(jobList) && jobList.length >= 1, `${jobList?.length} 个任务`)

// —— 7. 指标（等发件箱发布器跑一轮，确认事件确实被投递） ——
let metrics = null
for (let i = 0; i < 12; i += 1) {
  metrics = await call(`${basePath}/metrics`, { token })
  if ((metrics?.outboxPublished ?? 0) > 0) break
  await new Promise((r) => setTimeout(r, 400))
}
log(
  '指标快照可读',
  typeof metrics?.p95Millis === 'number' && metrics?.outboxPublished > 0,
  `p95=${metrics?.p95Millis}ms outboxPublished=${metrics?.outboxPublished} outboxDead=${metrics?.outboxDead}`,
)

// —— 8. 字段类型清单含 user_group ——
const fieldTypes = await call(`${basePath}/field-types`, { token })
const hasUserGroup = (fieldTypes || []).some((t) => t.type === 'user_group')
log('字段类型含 user_group', hasUserGroup, `${(fieldTypes || []).length} 种类型`)
const compatTypes = await call(`${basePath}/fields/types`, { token })
log('兼容路径 /fields/types 可用', Array.isArray(compatTypes) && compatTypes.length > 0)

// —— 9. 死信列表 ——
const dead = await call(`${basePath}/outbox/dead-letters`, { token })
log('死信列表可读', Array.isArray(dead), `${dead?.length} 条死信`)

// —— 10. 清理：删掉分组 ——
await call(`${basePath}/user-groups/${group.id}`, { method: 'DELETE', token })
const afterDelete = await call(`${basePath}/user-groups`, { token })
log('删除通讯录分组', !afterDelete.some((g) => g.id === group.id))

// —— 11. 浏览器冒烟：打开空间知识库页并截图 ——
const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
try {
  await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('metamatrix:auth:token', t), token)
  await page.goto(`${web}/projects/${projectId}/knowledge`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const shot = path.join(out, 'base-knowledge.png')
  await page.screenshot({ path: shot, fullPage: false })
  log('浏览器打开空间页面并截图', fs.existsSync(shot), shot)
  log('页面无 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
} catch (err) {
  log('浏览器冒烟', false, String(err))
} finally {
  await browser.close()
}

// —— 12. 清理：删除 E2E 空间（避免每次运行残留脏数据）——
try {
  await call(`/projects/${projectId}`, { method: 'DELETE', token })
  log('清理 E2E 空间', true, projectId)
} catch (err) {
  log('清理 E2E 空间', false, String(err))
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
