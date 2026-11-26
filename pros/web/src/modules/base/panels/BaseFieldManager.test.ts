// @vitest-environment happy-dom
/**
 * 字段管理面板的类型图标渲染。
 *
 * 回归点：类型图标曾经直接渲染成 `<component :is="opt.icon" />`，
 * 而 opt.icon 只是语义字符串，导致下拉列表里一个图标都没有。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseFieldManager from './BaseFieldManager.vue'
import type { FieldMeta, FieldTypeDefinition } from '../types'

vi.mock('../api', () => ({
  createField: vi.fn(),
  deleteField: vi.fn(),
  migrateField: vi.fn(),
  updateField: vi.fn(),
}))

const DEFINITIONS: FieldTypeDefinition[] = [
  { type: 'text', label: '文本', icon: 'text', version: 1, color: '#3390ec', description: '', configSchema: {}, capabilities: { editable: true, filterable: true, sortable: true, groupable: true, indexable: true, computed: false } },
  { type: 'single_select', label: '单选', icon: 'select', version: 1, color: '#e53935', description: '', configSchema: {}, capabilities: { editable: true, filterable: true, sortable: true, groupable: true, indexable: true, computed: false } },
  { type: 'rating', label: '评分', icon: 'star', version: 1, color: '#f7bc2f', description: '', configSchema: {}, capabilities: { editable: true, filterable: true, sortable: true, groupable: true, indexable: true, computed: false } },
]

const FIELDS: FieldMeta[] = [
  { id: 'f1', name: '负责人', type: 'user', config: {}, required: false, isPrimary: false, sortOrder: 0, version: 1 },
]

const stubs = {
  'el-dialog': { template: '<div><slot /></div>' },
  'el-icon': { template: '<i class="ic"><slot /></i>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div class="opt"><slot /></div>' },
  'el-checkbox': { template: '<span />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': { template: '<div />' },
  'el-divider': { template: '<hr />' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div class="menu"><slot /></div>' },
  'el-dropdown-item': { template: '<div class="menu-item"><slot /></div>' },
}

function mountPanel() {
  return mount(BaseFieldManager, {
    props: {
      projectId: 'p1',
      tableId: 't1',
      fields: FIELDS,
      definitions: DEFINITIONS,
    },
    global: { stubs },
  })
}

describe('字段管理面板', () => {
  it('字段行的类型图标可渲染', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.be-field-row__icon svg').exists()).toBe(true)
  })

  it('改类型下拉里每一项都带图标', () => {
    const wrapper = mountPanel()
    const items = wrapper.findAll('.menu-item')
    expect(items.length).toBe(DEFINITIONS.length)
    for (const item of items) {
      expect(item.find('.be-type-icon svg').exists()).toBe(true)
    }
  })

  it('新增字段的类型下拉每一项都带图标', () => {
    const wrapper = mountPanel()
    const options = wrapper.findAll('.opt')
    expect(options.length).toBe(DEFINITIONS.length)
    for (const option of options) {
      expect(option.find('.be-type-icon svg').exists()).toBe(true)
    }
  })
})
