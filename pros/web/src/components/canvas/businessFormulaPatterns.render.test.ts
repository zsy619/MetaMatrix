// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import BusinessFormulaPatternsCanvas from './BusinessFormulaPatternsCanvas.vue'
import type { BusinessFormulaPatternsDocumentJSON } from '../../types/canvas'

function mountBfp() {
  const store = useDocumentStore()
  store.loadFromTemplate('business-formula-patterns')
  const wrapper = mount(BusinessFormulaPatternsCanvas, {
    props: { doc: store.current_data as BusinessFormulaPatternsDocumentJSON },
  })
  return { store, wrapper }
}

describe('业务公式十大经典范式', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('三个方向圆、十条范式与正中提问都画在图上', () => {
    const { wrapper } = mountBfp()
    const text = wrapper.text()

    for (const label of [
      '收入提升',
      '全局商业模式',
      '竞争提升',
      '稀缺竞争力',
      '运营提升',
      '运营数据提升',
      '最渴望提升什么？',
    ]) {
      expect(text, `缺少 ${label}`).toContain(label)
    }
    for (const name of [
      '流量变现型',
      '线索转化型',
      '门店收入型',
      '用户周期型',
      '脱离成本型',
      '工业生产型',
      '连续留存型',
      '留存节点型',
      '连续动作型',
      '动作节点型',
    ]) {
      expect(text, `缺少范式 ${name}`).toContain(name)
    }
    expect(wrapper.findAll('.bfp-circle')).toHaveLength(3)
    expect(wrapper.findAll('.bfp-entry')).toHaveLength(10)
    wrapper.unmount()
  })

  it('十条公式都能算出结果', async () => {
    const { wrapper } = mountBfp()
    const entries = wrapper.findAll('.bfp-entry')

    for (const entry of entries) {
      const name = entry.get('.bfp-entry-name').text()
      await entry.trigger('click')
      await wrapper.vm.$nextTick()
      const value = wrapper.get('.bfp-result-value').text()
      expect(value, `${name} 算不出结果`).not.toBe('—')
      await wrapper.get('.bfp-modal-close').trigger('click')
      await wrapper.vm.$nextTick()
    }
    wrapper.unmount()
  })

  it('改参数实时试算，保存后写回文档', async () => {
    const { store, wrapper } = mountBfp()
    const doc = store.current_data as BusinessFormulaPatternsDocumentJSON

    await wrapper.get('.bfp-entry').trigger('click')
    await wrapper.vm.$nextTick()
    const input = wrapper.get('.bfp-param-input')
    await input.setValue('20000')
    await wrapper.vm.$nextTick()
    // 20000 × 3% × 200 × 30% = 36000
    expect(wrapper.get('.bfp-result-value').text()).toBe('36,000')

    await wrapper.get('.bfp-btn--primary').trigger('click')
    expect(doc.savedParams[1]?.['流量']).toBe(20000)
    wrapper.unmount()
  })

  it('点方向圆聚焦，再点取消', async () => {
    const { wrapper } = mountBfp()
    const circle = wrapper.findAll('.bfp-circle')[1]!

    await circle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.bfp-entry.is-dimmed').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.bfp-circle.is-focused')).toHaveLength(1)

    await circle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.bfp-entry.is-dimmed')).toHaveLength(0)
    wrapper.unmount()
  })
})
