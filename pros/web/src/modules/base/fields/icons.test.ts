// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { fieldTypeIcon } from './icons'
import type { FieldType } from '../types'

const ALL_TYPES: FieldType[] = [
  'text',
  'long_text',
  'number',
  'currency',
  'percent',
  'rating',
  'date',
  'datetime',
  'checkbox',
  'single_select',
  'multi_select',
  'email',
  'phone',
  'url',
  'user',
  'attachment',
  'formula',
  'link',
  'doc',
]

describe('多维表格字段类型图标', () => {
  it('每种字段类型都能解析出可渲染的组件', () => {
    for (const type of ALL_TYPES) {
      const icon = fieldTypeIcon(type)
      expect(icon, `类型 ${type} 缺少图标`).toBeTruthy()
      const wrapper = mount({ render: () => h(icon) })
      expect(wrapper.find('svg').exists(), `类型 ${type} 未渲染出图标`).toBe(true)
    }
  })

  it('未知类型回退到文本图标，不抛错', () => {
    const icon = fieldTypeIcon('not_a_real_type')
    expect(icon).toBeTruthy()
    expect(mount({ render: () => h(icon) }).find('svg').exists()).toBe(true)
  })
})
