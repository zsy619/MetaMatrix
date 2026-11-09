import { describe, expect, it } from 'vitest'
import { appendAudit, AUDIT_LIMIT, normalizeAuditLog, writeAuditLog } from './rteAudit'

describe('审计记录', () => {
  it('丢掉没有动作或说明的条目，并按面板写回', () => {
    const list = normalizeAuditLog([
      { id: 'a1', at: 1, action: 'watermark', detail: '机密', actor: '甲' },
      { id: 'a2', at: 2, action: 'nope', detail: 'x', actor: '甲' },
      { id: '', at: 3, action: 'ai', detail: '润色', actor: '甲' },
    ])
    expect(list).toEqual([{ id: 'a1', at: 1, action: 'watermark', detail: '机密', actor: '甲' }])
    const stored = writeAuditLog(undefined, 'panel-a', list)
    expect(stored?.['panel-a']).toHaveLength(1)
    expect(writeAuditLog(stored, 'panel-a', [])).toBeUndefined()
  })

  it('只保留最近 80 条', () => {
    let list = [] as ReturnType<typeof appendAudit>
    for (let i = 0; i < AUDIT_LIMIT + 5; i += 1) {
      list = appendAudit(list, { at: i + 1, action: 'export', detail: `第 ${i} 次`, actor: '我', id: `id-${i}` })
    }
    expect(list).toHaveLength(AUDIT_LIMIT)
    expect(list[0]?.id).toBe('id-5')
    expect(list.at(-1)?.detail).toBe(`第 ${AUDIT_LIMIT + 4} 次`)
  })
})
