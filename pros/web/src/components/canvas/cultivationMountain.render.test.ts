// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import CultivationMountainCanvas from './CultivationMountainCanvas.vue'
import type { CultivationMountainDocumentJSON } from '../../types/canvas'

function mountCm() {
  const store = useDocumentStore()
  store.loadFromTemplate('cultivation-mountain')
  const wrapper = mount(CultivationMountainCanvas, {
    props: { doc: store.current_data as CultivationMountainDocumentJSON },
  })
  return { store, wrapper }
}

describe('业务公式修炼爬山', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('六级段位、常见问题与提升路径都画在矩阵上', () => {
    const { wrapper } = mountCm()
    const text = wrapper.text()

    for (const label of [
      '入门',
      '进阶',
      '高阶',
      '只低头执行',
      '靠努力埋头执行',
      '缺假设驱动',
      '缺少欲望',
      '创新领先',
      '最佳实践',
      '有公式意识',
      '有稳定拆解',
      '有持续拆解',
      '激发大量高质量假设+无限进步',
    ]) {
      expect(text, `缺少 ${label}`).toContain(label)
    }
    expect(wrapper.findAll('.cm-column')).toHaveLength(6)
    expect(wrapper.findAll('.cm-level-label')).toHaveLength(6)
    // L1–L5 各三个问题盒，L6 一个最佳实践大盒
    expect(wrapper.findAll('.cm-problem-box')).toHaveLength(16)
    expect(wrapper.findAll('.cm-path-text')).toHaveLength(4)
    expect(wrapper.findAll('.cm-stage-label')).toHaveLength(3)
    wrapper.unmount()
  })

  it('点一列打开该级详情，能标记我的等级', async () => {
    const { store, wrapper } = mountCm()
    const doc = store.current_data as CultivationMountainDocumentJSON

    await wrapper.findAll('.cm-column')[2]!.trigger('click')
    await wrapper.vm.$nextTick()
    const modal = wrapper.get('.cm-modal')
    expect(modal.text()).toContain('有粗糙公式')
    expect(modal.text()).toContain('维度单一')
    expect(modal.text()).toContain('完善公式维度')

    await wrapper.get('.cm-modal .cm-btn--primary').trigger('click')
    expect(doc.currentLevel).toBe(3)
    wrapper.unmount()
  })

  it('标了等级就出现「你在这里」标记', async () => {
    const { store, wrapper } = mountCm()
    const doc = store.current_data as CultivationMountainDocumentJSON
    expect(wrapper.find('.cm-here').exists()).toBe(false)

    doc.currentLevel = 5
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cm-here').exists()).toBe(true)
    expect(wrapper.text()).toContain('你在这里')
    wrapper.unmount()
  })

  it('六题自评走完能定级并写回文档', async () => {
    const { store, wrapper } = mountCm()
    const doc = store.current_data as CultivationMountainDocumentJSON

    await wrapper.get('.cm-toolbar .cm-btn--primary').trigger('click')
    await wrapper.vm.$nextTick()
    // 每题都选最后一个（最高分）
    for (let i = 0; i < 6; i++) {
      const options = wrapper.findAll('.cm-option')
      await options[options.length - 1]!.trigger('click')
      await wrapper.vm.$nextTick()
    }
    expect(wrapper.get('.cm-result-badge').text()).toBe('L6')

    await wrapper.get('.cm-modal .cm-btn--primary').trigger('click')
    expect(doc.currentLevel).toBe(6)
    expect(doc.assessmentAnswers).toHaveLength(6)
    wrapper.unmount()
  })
})
