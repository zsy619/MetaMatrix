/**
 * Login → workspace stats → create a canvas → save.
 * Set SMOKE_API=http://127.0.0.1:3000 when the API and Postgres are running.
 * Without that variable this script only checks the route file still has the path.
 */
import fs from 'node:fs'

const routerSrc = fs.readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const homeSrc = fs.readFileSync(new URL('../src/views/HomeView.vue', import.meta.url), 'utf8')
for (const path of ['/login', '/workspace', '/canvas/:templateId']) {
  if (!routerSrc.includes(`path: '${path}'`)) {
    console.error(`missing route ${path}`)
    process.exit(1)
  }
}
if (!homeSrc.includes('doSave')) {
  console.error('canvas save action is missing')
  process.exit(1)
}

const base = process.env.SMOKE_API
if (!base) {
  console.log('smoke-flow: routes ok; set SMOKE_API to exercise login → workspace → canvas → save')
  process.exit(0)
}

const email = `smoke-${Date.now()}@example.com`
const password = 'smoke-pass-1'

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
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
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  }
  return data
}

/**
 * 取一张图形验证码。答案需要人读图，自动化只能靠 API 把明文答案带出来：
 * - CAPTCHA_DEBUG=true：任何调用方都能读到（只在本机用）
 * - CAPTCHA_DEBUG_LOOPBACK=true：只有回环地址能读到（CI 用，CI 里自动打开）
 * 生产环境两个开关都不开，接口不返回答案。
 */
async function takeCaptcha() {
  const challenge = await call('/auth/captcha')
  if (!challenge?.captchaId || !challenge?.debugAnswer) {
    throw new Error(
      'captcha challenge has no answer; run the API with CAPTCHA_DEBUG=true, ' +
        'or CAPTCHA_DEBUG_LOOPBACK=true when the smoke test talks to it over 127.0.0.1',
    )
  }
  return { captchaId: challenge.captchaId, captchaCode: challenge.debugAnswer }
}

const registerCaptcha = await takeCaptcha()
const registered = await call('/auth/register', {
  method: 'POST',
  body: { email, password, displayName: 'Smoke', ...registerCaptcha },
})
const token = registered.token
if (!token) {
  console.error('register did not return a token')
  process.exit(1)
}
const loginCaptcha = await takeCaptcha()
await call('/auth/login', { method: 'POST', body: { email, password, ...loginCaptcha } })
const stats = await call('/documents/stats', { token })
if (stats.scope && stats.scope !== 'me' && stats.documents == null) {
  console.error('workspace stats payload was empty')
  process.exit(1)
}
const created = await call('/documents', {
  method: 'POST',
  token,
  body: {
    title: '烟雾画布',
    templateId: 'dual-triangle',
    canvasType: 'dual-triangle',
    data: { id: 'dual-triangle', type: 'dual-triangle', schemaVersion: 1, title: '烟雾画布' },
  },
})
const saved = await call(`/documents/${created.id}`, {
  method: 'PUT',
  token,
  body: {
    title: '烟雾画布',
    currentData: { id: 'dual-triangle', type: 'dual-triangle', schemaVersion: 1, title: '已保存' },
    expectedHeadRevisionId: created.headRevisionId,
  },
})
if (!saved.id || saved.title !== '烟雾画布') {
  console.error('save did not return the canvas')
  process.exit(1)
}

/** 克隆画布：服务端新建 canvas_documents 行（新 UUID），正文是源文档的深拷贝。 */
const cloned = await call(`/documents/${saved.id}/clone`, {
  method: 'POST',
  token,
  body: {},
})
if (!cloned.id || cloned.id === saved.id) {
  console.error(`clone did not create a new document: ${cloned.id}`)
  process.exit(1)
}
if (cloned.title !== '烟雾画布（副本）') {
  console.error(`clone title = ${cloned.title}`)
  process.exit(1)
}
if (
  JSON.stringify(cloned.currentData) !==
  JSON.stringify(saved.currentData)
) {
  console.error('clone payload differs from the source')
  process.exit(1)
}
const cloneBody = await call(`/documents/${cloned.id}`, { token })
if (JSON.stringify(cloneBody.currentData) !== JSON.stringify(saved.currentData)) {
  console.error('reloaded clone payload differs from the source')
  process.exit(1)
}
const sourceAfter = await call(`/documents/${saved.id}`, { token })
if (sourceAfter.title !== '烟雾画布') {
  console.error('clone modified the source document')
  process.exit(1)
}
console.log('smoke-flow ok: login → workspace → canvas → save → clone')

/**
 * 克隆（带面板素材）：面板条目、附件 DataURL 都在 current_data 里，
 * 克隆必须与「库里存着的源文档」完全一致（current_data 是 JSONB，
 * 写入时由 Postgres 规范化键序，所以这里比的是落库后的源文档）；
 * 同时副本要有一条 label=clone 的初始版本。
 */
const richData = {
  id: 'dual-triangle',
  type: 'dual-triangle',
  schemaVersion: 1,
  blocks: [
    {
      id: 'innovation',
      side: 'human',
      title: '创新',
      subtitle: '子标题',
      keyword: '创造力',
      items: [{ id: 'item_1', text: '保留我' }],
    },
  ],
  attachmentsByPanelId: {
    innovation: [
      {
        id: 'att_1',
        name: 'probe.png',
        kind: 'file',
        mimeType: 'image/png',
        size: 68,
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ],
  },
}
const rich = await call('/documents', {
  method: 'POST',
  token,
  body: {
    title: '带素材的画布',
    templateId: 'dual-triangle',
    canvasType: 'dual-triangle',
    data: richData,
  },
})
const richClone = await call(`/documents/${rich.id}/clone`, { method: 'POST', token, body: {} })
if (richClone.id === rich.id) {
  console.error('rich clone reused the source id')
  process.exit(1)
}
// 两侧都重新从库里读一次：POST 的响应体是内存里的原始字节，
// GET 才是落库（JSONB 规范化键序）后的样子。
const richSourceBody = await call(`/documents/${rich.id}`, { token })
const richCloneBody = await call(`/documents/${richClone.id}`, { token })
if (JSON.stringify(richCloneBody.currentData) !== JSON.stringify(richSourceBody.currentData)) {
  console.error('rich clone payload differs from the stored source')
  process.exit(1)
}
if (richCloneBody.currentData?.attachmentsByPanelId?.innovation?.[0]?.name !== 'probe.png') {
  console.error('rich clone lost the panel attachment')
  process.exit(1)
}
const richCloneRevisions = await call(`/documents/${richClone.id}/revisions`, { token })
if (!Array.isArray(richCloneRevisions) || richCloneRevisions.length !== 1) {
  console.error(`rich clone revisions = ${JSON.stringify(richCloneRevisions)}`)
  process.exit(1)
}
if (richCloneRevisions[0].label !== 'clone') {
  console.error(`rich clone revision label = ${richCloneRevisions[0].label}`)
  process.exit(1)
}
const richSourceAfter = await call(`/documents/${rich.id}`, { token })
if (JSON.stringify(richSourceAfter.currentData) !== JSON.stringify(richSourceBody.currentData)) {
  console.error('clone modified the rich source document')
  process.exit(1)
}
if (richSourceAfter.title !== '带素材的画布') {
  console.error(`clone changed the rich source title = ${richSourceAfter.title}`)
  process.exit(1)
}
console.log('smoke-flow ok: clone keeps panel items, attachments and writes a clone revision')
