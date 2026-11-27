// @vitest-environment happy-dom
/**
 * 关联记录（link）单元格的展示与跳转。
 *
 * 回归点：关联记录原先直接显示裸 ID（记录 UUID），
 * 用户既看不懂也点不动；现在要显示目标记录标题，并可点击跳转。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseFieldCell from './BaseFieldCell.vue'
import type { FieldMeta } from '../types'

const FIELD: FieldMeta = {
  id: 'f-link',
  name: '关联合同',
  type: 'link',
  config: { targetTableId: 'table-b' },
  required: false,
  isPrimary: false,
  sortOrder: 1,
  version: 1,
}

const stubs = {
  'el-icon': { template: '<i class="ic"><slot /></i>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-select': { template: '<div class="sel"><slot /></div>' },
  'el-option': { template: '<span class="opt"><slot /></span>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-date-picker': { template: '<input />' },
  'el-checkbox': { template: '<span />' },
}

describe('关联记录单元格', () => {
  it('显示目标记录标题而不是裸 ID', () => {
    const wrapper = mount(BaseFieldCell, {
      props: {
        field: FIELD,
        modelValue: ['rec-1'],
        linkTitles: { 'rec-1': '星海科技 · 年度服务合同' },
        linkTargetTableId: 'table-b',
      },
      global: { stubs },
    })
    const chips = wrapper.findAll('.base-cell__link-chip')
    expect(chips.length).toBe(1)
    expect(chips[0].text()).toBe('星海科技 · 年度服务合同')
  })

  it('点击标题抛出跨表跳转事件', async () => {
    const wrapper = mount(BaseFieldCell, {
      props: {
        field: FIELD,
        modelValue: ['rec-1'],
        linkTitles: { 'rec-1': '星海科技 · 年度服务合同' },
        linkTargetTableId: 'table-b',
      },
      global: { stubs },
    })
    await wrapper.find('.base-cell__link-chip').trigger('click')
    const events = wrapper.emitted('open-record-ref')
    expect(events).toBeTruthy()
    expect((events?.[0]?.[0] as { tableId: string; recordId: string }).recordId).toBe('rec-1')
    expect((events?.[0]?.[0] as { tableId: string }).tableId).toBe('table-b')
  })

  it('没有标题映射时回退为可读短 ID', () => {
    const wrapper = mount(BaseFieldCell, {
      props: {
        field: FIELD,
        modelValue: ['12345678-abcd'],
        linkTargetTableId: 'table-b',
      },
      global: { stubs },
    })
    expect(wrapper.find('.base-cell__link-chip').text()).toContain('12345678')
  })
})

