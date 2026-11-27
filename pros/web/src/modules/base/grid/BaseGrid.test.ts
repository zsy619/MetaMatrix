// @vitest-environment happy-dom
/**
 * 网格列头的字段类型图标。
 *
 * 回归点：列头原本只有字段名，看不出这一列是什么类型。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseGrid from './BaseGrid.vue'
import type { FieldMeta, RecordRow } from '../types'

const FIELDS: FieldMeta[] = [
  { id: 'f1', name: '负责人', type: 'user', config: {}, required: false, isPrimary: true, sortOrder: 0, version: 1 },
  { id: 'f2', name: '预算', type: 'currency', config: {}, required: false, isPrimary: false, sortOrder: 1, version: 1 },
]

const ROWS: RecordRow[] = [
  { id: 'r1', tableId: 't1', fields: { f1: [], f2: 0 }, version: 1, createdAt: '', updatedAt: '' } as unknown as RecordRow,
]

/** 用轻量替身渲染列头插槽，避开 vxe-grid 的 DOM 依赖。 */
const stubs = {
  'vxe-grid': {
    props: ['columns'],
    template: `
      <div>
        <div v-for="col in columns" :key="col.field">
          <slot v-if="col.slots && col.slots.header" :name="col.slots.header" :column="col" />
        </div>
      </div>
    `,
  },
  'el-icon': { template: '<i class="ic"><slot /></i>' },
  'el-checkbox': { template: '<span />' },
  'el-button': { template: '<button><slot /></button>' },
}

describe('网格列头', () => {
  it('每列都渲染出类型图标和字段名', () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs, directives: { loading: {} } },
    })
    const heads = wrapper.findAll('.base-grid__head')
    expect(heads.length).toBe(FIELDS.length)
    for (const head of heads) {
      expect(head.find('.base-grid__head-icon svg').exists()).toBe(true)
      expect(head.find('.base-grid__head-title').text()).toBeTruthy()
    }
  })

  it('列头图标按字段类型着色', () => {
    const wrapper = mount(BaseGrid, {
      props: { fields: FIELDS, rows: ROWS },
      global: { stubs, directives: { loading: {} } },
    })
    const colors = wrapper.findAll('.base-grid__head-icon').map((el) => el.attributes('style'))
    expect(colors.length).toBe(FIELDS.length)
    for (const style of colors) {
      expect(style).toMatch(/color:\s*#/)
    }
  })
})
