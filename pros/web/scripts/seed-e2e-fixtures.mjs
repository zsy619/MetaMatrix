#!/usr/bin/env node
/**
 * 端到端夹具播种：让依赖后端的 e2e 在「空的」本机环境里也能跑。
 *
 * 播两样东西：
 * 1. 测试账号 demo@metamatrix.local / demo123456（不存在就注册）；
 * 2. 一份「Y 模型」文档，文档 id 固定为 4d5f428c-a6e7-45a7-b29e-304120fccbb5，
 *    也就是 pros/web/scripts/rte-*.mjs 里写死的那一份样例文档。
 *
 * 为什么需要第 2 步：浏览器端脚本（rte-baseline / rte-echarts-e2e / rte-image-*）
 * 都直接 goto /canvas/y-model?documentId=4d5f428c-…，库里没有这份文档时
 * 页面只会渲染空模板，脚本连「最大化」按钮都点不到。
 *
 * 前置：
 *   API 已启动，并且开着图形验证码调试开关（CAPTCHA_DEBUG=true 或
 *   CAPTCHA_DEBUG_LOOPBACK=true，且调用方在回环地址上）：
 *   API=http://127.0.0.1:3000
 *   DATABASE_URL=postgresql://metamatrix:metamatrix@127.0.0.1:5434/metamatrix
 *
 * 文档本体走 psql 写入：API 的 POST /documents 不接受自定义 id。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')

const API = process.env.API || process.env.SMOKE_API || 'http://127.0.0.1:3000'
const DATABASE_URL = process.env.DATABASE_URL || ''
const EMAIL = process.env.E2E_EMAIL || 'demo@metamatrix.local'
const PASSWORD = process.env.E2E_PASSWORD || 'demo123456'
const DOCUMENT_ID = process.env.E2E_DOCUMENT_ID || '4d5f428c-a6e7-45a7-b29e-304120fccbb5'
const TEMPLATE = process.env.E2E_TEMPLATE || 'src/templates/y-model-v1.json'
/** 样例文档里「如何定性定量分析」那段的正文，rte-baseline 靠它找第一段。 */
const SAMPLE_PARAGRAPH = process.env.E2E_SAMPLE_PARAGRAPH || '第一段'

function fail(message) {
  console.error(`seed-e2e-fixtures: ${message}`)
  process.exit(1)
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

/** 取一张图形验证码。答案需要 API 的调试开关才会明文返回。 */
async function takeCaptcha() {
  const challenge = await call('/auth/captcha')
  if (!challenge?.captchaId || !challenge?.debugAnswer) {
    fail(
      'captcha challenge has no answer; start the API with CAPTCHA_DEBUG=true ' +
        '(or CAPTCHA_DEBUG_LOOPBACK=true when talking over 127.0.0.1)',
    )
  }
  return { captchaId: challenge.captchaId, captchaCode: challenge.debugAnswer }
}

async function login() {
  const captcha = await takeCaptcha()
  return call('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, ...captcha },
  })
}

async function register() {
  const captcha = await takeCaptcha()
  return call('/auth/register', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, displayName: 'Demo', ...captcha },
  })
}

/** 把 DATABASE_URL 拆成 psql 认识的参数，密码只进环境变量，不进命令行。 */
function psqlEnv(url) {
  const parsed = new URL(url)
  const env = { ...process.env }
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password)
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username)
  if (parsed.hostname) env.PGHOST = decodedHost(parsed.hostname)
  const port = parsed.port || '5432'
  env.PGPORT = port
  const database = parsed.pathname.replace(/^\//, '') || 'metamatrix'
  env.PGDATABASE = database
  const args = ['-v', 'ON_ERROR_STOP=1', '-h', env.PGHOST, '-p', env.PGPORT]
  if (env.PGUSER) args.push('-U', env.PGUSER)
  args.push('-d', env.PGDATABASE)
  return { env, args }
}

function decodedHost(host) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/** SQL 字面量：单引号翻倍。 */
function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Y 模型模板 → 样例文档正文：把「如何定性定量分析」那段换成可点的第一段。 */
function buildCurrentData() {
  const raw = readFileSync(resolve(webRoot, TEMPLATE), 'utf8')
  const doc = JSON.parse(raw)
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : []
  const target = blocks.find((block) => block.id === 'facts_analysis')
  if (!target) fail(`template ${TEMPLATE} has no facts_analysis block`)
  const items = Array.isArray(target.items) ? target.items : []
  if (items.length === 0) {
    target.items = [
      { id: 'item_facts_analysis_1', text: `<p>${SAMPLE_PARAGRAPH}</p>`, style: {} },
    ]
  } else {
    items[0] = { ...items[0], text: `<p>${SAMPLE_PARAGRAPH}</p>` }
  }
  return doc
}

function seedDocument(userId, currentData) {
  if (!DATABASE_URL) {
    fail('DATABASE_URL is required (the API creates documents with random ids, so the fixed id is written with psql)')
  }
  const { env, args } = psqlEnv(DATABASE_URL)
  const sql = [
    `INSERT INTO canvas_documents (id, owner_user_id, canvas_type, title, notes, schema_version, current_data, content_text, created_at, updated_at)`,
    `VALUES (${sqlText(DOCUMENT_ID)}::uuid, ${sqlText(userId)}::uuid, 'y_model', 'E2E Y 模型样例', NULL, 1, ${sqlText(JSON.stringify(currentData))}::jsonb, ${sqlText(SAMPLE_PARAGRAPH)}, now(), now())`,
    `ON CONFLICT (id) DO UPDATE SET current_data = EXCLUDED.current_data, updated_at = now();`,
  ].join('\n')
  try {
    execFileSync('psql', args, { env, input: sql, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    const stderr = err?.stderr ? String(err.stderr) : String(err)
    fail(`psql failed: ${stderr.trim()}`)
  }
}

let session = null
try {
  session = await login()
} catch {
  try {
    session = await register()
    console.log(`seed-e2e-fixtures: registered ${EMAIL}`)
  } catch (err) {
    fail(`login and register both failed: ${err?.message || err}`)
  }
}
const userId = session?.user?.id
if (!userId) fail('login did not return a user id')

const currentData = buildCurrentData()
seedDocument(userId, currentData)
console.log(
  `seed-e2e-fixtures ok: user=${EMAIL} document=${DOCUMENT_ID} (y_model, 第一段)`,
)
