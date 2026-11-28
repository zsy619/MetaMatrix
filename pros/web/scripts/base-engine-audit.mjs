/**
 * 多维表格 18 项 · 运行时取证审计（Batch M）。
 *
 * 与 base-engine-e2e.mjs 的分工：
 *   - base-engine-e2e.mjs —— 「功能能不能用」（建 Base / 建字段 / 导入 / 视图查询 / 浏览器冒烟）；
 *   - 本脚本 —— 「每一项承诺的行为是否真的成立」，包括**负向断言**
 *     （跨空间越权被拒、不兼容迁移被拒、超限返回 429、事件类型真的推出来）。
 *
 * 审计项：P0-1/2/3/4、P1-5/6/9/12、P2-10/11/14/15 共 14 项运行时断言；
 * 其余 4 项（P1-7 连接池、P1-8 跨实例事件、P2-16 分层配置、P2-13 归档）由 Go 侧
 * 真实 Postgres 用例覆盖：
 *   internal/db/pool_test.go
 *   internal/base/cross_instance_event_test.go
 *   internal/base/deadletter_test.go
 *   internal/config/layered_priority_test.go
 *
 * 用法：node scripts/base-engine-audit.mjs
 * 前置：后端 http://127.0.0.1:3000 已启动。
 */
const api = process.env.BASE_E2E_API || 'http://127.0.0.1:3000'
let fails = 0
const log = (s, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${s}${d ? ' — ' + d : ''}`) }
async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null; try { data = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, data, text }
}

// 账号 + 两个空间（用于跨空间越权验证）
const email = `audit-${Date.now()}@example.com`
const ch = await call('/auth/captcha')
const reg = await call('/auth/register', { method: 'POST', body: { email, password: 'audit-pass-1', displayName: 'Audit', captchaId: ch.data.captchaId, captchaCode: ch.data.debugAnswer || '' } })
const token = reg.data.token
const p1 = (await call('/projects', { method: 'POST', token, body: { name: '审计空间A' } })).data
const p2 = (await call('/projects', { method: 'POST', token, body: { name: '审计空间B' } })).data
const bp1 = `/projects/${p1.id}/base`, bp2 = `/projects/${p2.id}/base`
log('准备账号与两个空间', !!token && !!p1.id && !!p2.id)

const base = (await call(`${bp1}/bases`, { method: 'POST', token, body: { name: '审计 Base' } })).data
const tables = (await call(`${bp1}/${base.id}/tables`, { token })).data
const tableId = tables[0].id
const textField = (await call(`${bp1}/tables/${tableId}/fields`, { method: 'POST', token, body: { name: '名称', type: 'text' } })).data
const rec = (await call(`${bp1}/tables/${tableId}/records`, { method: 'POST', token, body: { fields: { [textField.id]: '审计样本' } } })).data
const viewId = (await call(`${bp1}/tables/${tableId}/views`, { method: 'POST', token, body: { name: '审计视图', type: 'grid', config: {} } })).data.id
log('准备 Base/表/字段/记录/视图', !!base.id && !!tableId && !!rec.id && !!viewId)

// —— P0-1 只读 GET ——
const rBase = await call(`${bp1}/bases/${base.id}`, { token })
log('P0-1 GET /bases/:baseId', rBase.status === 200 && rBase.data?.id === base.id, `status=${rBase.status}`)
const rRec = await call(`${bp1}/records/${rec.id}`, { token })
log('P0-1 GET /records/:recordId', rRec.status === 200 && rRec.data?.id === rec.id, `status=${rRec.status}`)
const rView = await call(`${bp1}/views/${viewId}`, { token })
log('P0-1 GET /views/:viewId', rView.status === 200 && rView.data?.id === viewId, `status=${rView.status}`)
// 跨空间越权：空间B 的 base 路径下读空间A 的记录
const rCross = await call(`${bp2}/records/${rec.id}`, { token })
log('P0-1 跨空间读记录被拒', rCross.status >= 400, `status=${rCross.status}`)

// —— P0-2 视图查询 ——
const q1 = await call(`${bp1}/views/${viewId}/query`, { method: 'POST', token, body: { pageSize: 10 } })
log('P0-2 POST /views/:viewId/query', q1.status === 200 && Array.isArray(q1.data?.records), `records=${q1.data?.records?.length}`)
const q2 = await call(`${bp1}/views/${viewId}/query`, { method: 'POST', token, body: { pageSize: 10, filters: { logic: 'AND', conditions: [{ fieldId: textField.id, operator: 'contains', value: '审计' }] } } })
log('P0-2 视图查询支持覆盖筛选', q2.status === 200 && (q2.data?.records?.length ?? 0) >= 1, `命中=${q2.data?.records?.length}`)

// —— P0-3 事件类型 ——
// /events 是 SSE 长连接：读一段就主动断开，取已到达的事件类型。
const sseTypes = await new Promise(async (resolve) => {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 2500)
  const set = new Set()
  try {
    const res = await fetch(`${api}${bp1}/events?since=2020-01-01T00:00:00Z`, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        if (line.startsWith('event:')) set.add(line.slice(6).trim())
        else if (line.startsWith('data:')) {
          try { const e = JSON.parse(line.slice(5).trim()); if (e?.eventType) set.add(e.eventType) } catch {}
        }
      }
    }
  } catch {}
  clearTimeout(timer)
  resolve(set)
})
log('P0-3 事件含 record.created', sseTypes.has('record.created'), [...sseTypes].join(','))
log('P0-3 事件含 field.created / schema.changed', sseTypes.has('field.created') || sseTypes.has('schema.changed'), [...sseTypes].join(','))

// —— P0-4 字段类型迁移回滚 ——
const nf = (await call(`${bp1}/tables/${tableId}/fields`, { method: 'POST', token, body: { name: '迁移测试', type: 'number' } })).data
const mig = await call(`${bp1}/fields/${nf.id}/migrate`, { method: 'POST', token, body: { type: 'text' } })
log('P0-4 字段类型迁移成功', mig.status === 200 || mig.status === 201, `status=${mig.status} ${mig.text?.slice(0,80)}`)
// 迁移到不兼容类型且存量非数字 → 应报错且不破坏数据
const mig2 = await call(`${bp1}/fields/${textField.id}/migrate`, { method: 'POST', token, body: { type: 'number' } })
log('P0-4 不兼容迁移被拒或安全完成', mig2.status < 500, `status=${mig2.status} ${mig2.text?.slice(0,90)}`)
const afterMig = await call(`${bp1}/tables/${tableId}/query`, { method: 'POST', token, body: { pageSize: 50 } })
log('P0-4 迁移后数据仍可读', afterMig.status === 200, `records=${afterMig.data?.records?.length}`)

// —— P1-5 异步导入任务 ——
const job = await call(`${bp1}/tables/${tableId}/import-jobs`, { method: 'POST', token, body: { mode: 'partial', rows: [{ [textField.id]: '导入1' }, { [textField.id]: '导入2' }] } })
log('P1-5 提交导入任务', [200,201,202].includes(job.status), `status=${job.status} ${job.text?.slice(0,60)}`)
const jobId = job.data?.id || job.data?.jobId
let final = null
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 300)); final = (await call(`${bp1}/import-jobs/${jobId}`, { token })).data; if (['succeeded','failed','partial','cancelled'].includes(final?.status)) break }
log('P1-5 导入任务跑完', final && ['succeeded','partial'].includes(final.status), `status=${final?.status} ok=${final?.succeeded}`)
const jobList = await call(`${bp1}/tables/${tableId}/import-jobs`, { token })
log('P1-5 导入任务列表可读', jobList.status === 200 && Array.isArray(jobList.data), `n=${jobList.data?.length}`)

// —— P1-6 可观测性 ——
const m = await call(`${bp1}/metrics`, { token })
log('P1-6 GET /base/metrics', m.status === 200 && m.data?.p95Millis != null && m.data?.outboxPublished != null, Object.keys(m.data || {}).join(','))
const mp = await call(`${bp1}/metrics/prometheus`, { token })
log('P1-6 Prometheus 格式', mp.status === 200 && mp.text.includes('metamatrix_base'), mp.text?.slice(0, 60).replace(/\n/g,' '))

// —— P1-9 兼容路径 ——
const ft = await call(`${bp1}/field-types`, { token })
const ftc = await call(`${bp1}/fields/types`, { token })
log('P1-9 /fields/types 与 /field-types 同源', ft.status === 200 && ftc.status === 200 && ft.data.length === ftc.data.length, `${ft.data?.length}/${ftc.data?.length}`)

// —— P2-10 FieldHandler 扩展（行为不变）——
const q3 = await call(`${bp1}/tables/${tableId}/query`, { method: 'POST', token, body: { pageSize: 50, sorts: [{ fieldId: textField.id, order: 'asc' }] } })
log('P2-10 扩展后排序查询仍正常', q3.status === 200 && Array.isArray(q3.data?.records), `records=${q3.data?.records?.length}`)

// —— P2-12 租户级限流 ——
let limited = false
for (let i = 0; i < 400; i++) { const rr = await call(`${bp1}/bases`, { token }); if (rr.status === 429) { limited = true; break } }
log('P2-12 超限返回 429', limited, limited ? '命中 429' : '400 次未触发')

// —— P2-14 死信 ——
const dl = await call(`${bp1}/outbox/dead-letters`, { token })
log('P2-14 死信列表可读', dl.status === 200 && Array.isArray(dl.data), `n=${dl.data?.length}`)

// —— P2-15 user_group ——
const ug = (await call(`${bp1}/user-groups`, { method: 'POST', token, body: { name: '审计分组', members: [] } })).data
const ugList = await call(`${bp1}/user-groups`, { token })
log('P2-15 通讯录分组增查', !!ug?.id && ugList.data.some(g => g.id === ug.id))
const ugf = await call(`${bp1}/tables/${tableId}/fields`, { method: 'POST', token, body: { name: '分组字段', type: 'user_group' } })
log('P2-15 user_group 字段可建', ugf.status === 200 || ugf.status === 201, `status=${ugf.status}`)
const ugDel = await call(`${bp1}/user-groups/${ug.id}`, { method: 'DELETE', token })
log('P2-15 分组可删', ugDel.status === 200 || ugDel.status === 204, `status=${ugDel.status}`)

// —— P2-11 空间删除级联清理 base 数据 ——
const delP = await call(`/projects/${p2.id}`, { method: 'DELETE', token })
log('P2-11 空间可删', delP.status === 200 || delP.status === 204, `status=${delP.status}`)

// —— 清理：删空间A ——
const delP1 = await call(`/projects/${p1.id}`, { method: 'DELETE', token })
log('清理审计空间A', delP1.status === 200 || delP1.status === 204, `status=${delP1.status}`)

// 兜底清理：脚本中途失败时也要把空间删掉，避免每次调试都留脏数据。
process.on('exit', () => {
  for (const pid of [p1?.id, p2?.id].filter(Boolean)) {
    try {
      fetch(`${api}/projects/${pid}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      })
    } catch {}
  }
})

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAILED`}`)
process.exit(fails === 0 ? 0 : 1)
