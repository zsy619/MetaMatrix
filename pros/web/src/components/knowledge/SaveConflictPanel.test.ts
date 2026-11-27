// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SaveConflictPanel from './SaveConflictPanel.vue'

describe('SaveConflictPanel', () => {
  it('展示两边预览，并在选择时发出 who 的版本或合并', async () => {
    const wrapper = mount(SaveConflictPanel, {
      props: {
        remoteVersion: 7,
        versions: {
          mineHtml: '<p>本地草稿<strong>加粗</strong></p>',
          theirsHtml: '<p>远端已保存</p>',
          mineLabel: '你的版本',
          theirsLabel: '云端版本',
        },
      },
    })
    expect(wrapper.text()).toContain('保存冲突')
    expect(wrapper.text()).toContain('版本 7')
    expect(wrapper.text()).toContain('本地草稿加粗')
    expect(wrapper.text()).toContain('远端已保存')
    expect(wrapper.text()).toContain('你的版本')
    expect(wrapper.text()).toContain('云端版本')
    expect(wrapper.text()).toContain('合并预览')
    expect(wrapper.get('[data-side="merge"]').text()).toContain('远端已保存')
    expect(wrapper.get('[data-side="merge"]').text()).toContain('本地草稿加粗')

    await wrapper.get('[data-action="mine"]').trigger('click')
    await wrapper.get('[data-action="theirs"]').trigger('click')
    await wrapper.get('[data-action="merge"]').trigger('click')
    expect(wrapper.emitted('choose')).toEqual([['mine'], ['theirs'], ['merge']])
    wrapper.unmount()
  })
})
