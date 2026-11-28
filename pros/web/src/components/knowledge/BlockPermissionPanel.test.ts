// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BlockPermissionPanel from './BlockPermissionPanel.vue'

describe('BlockPermissionPanel', () => {
  it('所有者可以改权限并发出选择', async () => {
    const wrapper = mount(BlockPermissionPanel, {
      props: {
        blockId: '11111111-1111-4111-8111-111111111111',
        permission: '',
        role: 'owner',
        canWrite: true,
      },
    })
    expect(wrapper.text()).toContain('块级权限')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(4)
    expect((radios[3]!.element as HTMLInputElement).disabled).toBe(false)
    await radios[3]!.setValue()
    expect(wrapper.emitted('change')?.[0]).toEqual(['readonly'])
    wrapper.unmount()
  })

  it('浏览者不能改权限', () => {
    const wrapper = mount(BlockPermissionPanel, {
      props: {
        blockId: '11111111-1111-4111-8111-111111111111',
        permission: 'owner',
        role: 'viewer',
        canWrite: false,
      },
    })
    expect(wrapper.text()).toContain('你没有权限修改这块的内容')
    expect(wrapper.text()).toContain('只有所有者或管理员可以更改块级权限')
    for (const radio of wrapper.findAll('input[type="radio"]')) {
      expect((radio.element as HTMLInputElement).disabled).toBe(true)
    }
    wrapper.unmount()
  })
})
