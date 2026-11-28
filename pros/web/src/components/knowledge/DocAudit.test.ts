// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocAudit from './DocAudit.vue'
import type { DocAuditEvent } from '../../api/knowledge_v6'

const listDocAudit = vi.fn()

vi.mock('../../api/knowledge_v6', () => ({
  listDocAudit: (...args: unknown[]) => listDocAudit(...args),
}))

const sample: DocAuditEvent = {
  id: 'e1',
  documentId: 'doc-1',
  userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  action: 'save',
  blockId: '11111111-1111-1111-1111-111111111111',
  detail: '',
  createdAt: '2026-11-26T12:00:00.000Z',
}

describe('DocAudit 只读列表', () => {
  beforeEach(() => {
    listDocAudit.mockReset()
  })

  it('拉取并渲染谁、何时、动作和块 ID', async () => {
    listDocAudit.mockResolvedValue([sample])
    const wrapper = mount(DocAudit, { props: { documentId: 'doc-1' } })
    await flushPromises()
    expect(listDocAudit).toHaveBeenCalledWith('doc-1', 50)
    expect(wrapper.text()).toContain('保存')
    expect(wrapper.text()).toContain('aaaaaaaa')
    expect(wrapper.text()).toContain('块 11111111')
    expect(wrapper.text()).toMatch(/2026/)
    wrapper.unmount()
  })

  it('无权限或 404 时显示空态，不抛错', async () => {
    listDocAudit.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    const wrapper = mount(DocAudit, { props: { documentId: 'doc-missing' } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无可以查看的审计记录')
    expect(wrapper.findAll('.doc-audit__item')).toHaveLength(0)
    wrapper.unmount()
  })
})
