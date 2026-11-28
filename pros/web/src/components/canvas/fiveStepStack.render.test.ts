// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('../RichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'RichTextEditor',
    props: { modelValue: { type: String, default: '' } },
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  }),
}))

vi.mock('./PanelAttachments.vue', () => ({
  default: defineComponent({
    name: 'PanelAttachments',
    template: '<div class="pa-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import FiveStepBasicCanvas from './FiveStepBasicCanvas.vue'
import FiveStepCanvas from './FiveStepCanvas.vue'
import FiveStepChallengeCanvas from './FiveStepChallengeCanvas.vue'
import FiveStepDivisionCanvas from './FiveStepDivisionCanvas.vue'
import FiveStepProCanvas from './FiveStepProCanvas.vue'
import type {
  FiveStepBasicDocumentJSON,
  FiveStepChallengeDocumentJSON,
  FiveStepDivisionDocumentJSON,
  FiveStepDocumentJSON,
  FiveStepProDocumentJSON,
} from '../../types/canvas'
import { isFiveStepBasicDoc } from '../../types/canvas'

const shell = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'five-step-shell.css'), 'utf8')

const STEPS = ['需求', '解决方案', '商业模式', '增长', '壁垒']

describe('五步法窄屏仍能按列阅读', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('基础版五列和做法都在，主题写完会留下', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('five-step-basic')
    const wrapper = mount(FiveStepBasicCanvas, { props: { doc: store.current_data as FiveStepBasicDocumentJSON } })
    for (const title of STEPS) expect(wrapper.text()).toContain(title)
    for (const label of ['逐级拆解', '全局预判', '专业选项', '努力定量', '动态更新']) {
      expect(wrapper.text()).toContain(label)
    }
    const topic = wrapper.get('.fsb-col input[aria-label="内容主题"]')
    await topic.setValue('先写用户')
    await topic.trigger('blur')
    const doc = store.current_data
    expect(isFiveStepBasicDoc(doc) && doc.blocks.find((block) => block.id === 'demand')?.keyword).toBe('先写用户')
    wrapper.unmount()
  })

  it('分工版五行标签和五列都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('five-step-division')
    const wrapper = mount(FiveStepDivisionCanvas, { props: { doc: store.current_data as FiveStepDivisionDocumentJSON } })
    for (const title of STEPS) expect(wrapper.text()).toContain(title)
    for (const label of ['定性取舍', '定量测量', '团队分工']) expect(wrapper.text()).toContain(label)
    expect(wrapper.findAll('.fsd-col')).toHaveLength(5)
    expect(wrapper.findAll('.fsd-cell')).toHaveLength(15)
    wrapper.unmount()
  })

  it('原版、进阶和挑战在窄屏改成单列卡片', () => {
    expect(shell).toContain('@media (max-width: 900px)')
    expect(shell).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(shell).toContain('min-width: 0')

    const store = useDocumentStore()
    store.loadFromTemplate('five-step')
    const original = mount(FiveStepCanvas, { props: { doc: store.current_data as FiveStepDocumentJSON } })
    expect(original.findAll('.fsx-col')).toHaveLength(5)
    expect(original.text()).toContain('定性')
    expect(original.text()).toContain('逐级拆解')
    original.unmount()

    store.loadFromTemplate('five-step-pro')
    const pro = mount(FiveStepProCanvas, { props: { doc: store.current_data as FiveStepProDocumentJSON } })
    expect(pro.findAll('.fsx-col')).toHaveLength(5)
    expect(pro.text()).toContain('在什么场景下遇到了什么问题？')
    pro.unmount()

    store.loadFromTemplate('five-step-challenge')
    const challenge = mount(FiveStepChallengeCanvas, { props: { doc: store.current_data as FiveStepChallengeDocumentJSON } })
    expect(challenge.findAll('.fsx-col')).toHaveLength(6)
    expect(challenge.text()).toContain('假设')
    challenge.unmount()
  })
})
