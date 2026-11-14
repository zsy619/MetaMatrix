// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('./YModelBlock.vue', () => ({
  default: {
    name: 'YModelBlockCard',
    props: { block: { type: Object, required: true } },
    template: '<div class="ym-stub" />',
  },
}))

import { useDocumentStore } from '../../stores/document'
import IpoCanvas from './IpoCanvas.vue'
import type { IpoDocumentJSON } from '../../types/canvas'

describe('IPO 梳理画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('空白方块提示点击填写，写过的内容直接显示在图上', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('ipo')
    const doc = store.current_data as IpoDocumentJSON
    const input = doc.blocks.find((block) => block.id === 'input')
    expect(input).toBeTruthy()
    input!.items[0].text = '<p>用户访谈</p><p>工单记录</p>'
    const process = doc.blocks.find((block) => block.id === 'process')
    process!.items[0].text = '分类归档'

    const wrapper = mount(IpoCanvas, { props: { doc } })
    const previews = wrapper.findAll('.ipo-preview').map((node) => node.text())
    expect(previews).toContain('用户访谈\n工单记录')
    expect(previews).toContain('分类归档')
    expect(previews.filter((text) => text === '点击填写')).toHaveLength(4)
    expect(wrapper.get('.ipo-node--input .ipo-preview').classes()).not.toContain('is-short')
    expect(wrapper.get('.ipo-node--process .ipo-preview').classes()).toContain('is-short')
    wrapper.unmount()
  })
})
