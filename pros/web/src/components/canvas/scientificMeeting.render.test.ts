// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('./YModelBlock.vue', () => ({
  default: defineComponent({
    name: 'YModelBlockCard',
    props: { block: { type: Object, required: true } },
    template: '<div class="ym-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import ScientificMeetingCanvas from './ScientificMeetingCanvas.vue'
import type { ScientificMeetingDocumentJSON } from '../../types/canvas'

describe('科学开会', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('会议类型和梳理人写回文档', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('scientific-meeting')
    const wrapper = mount(ScientificMeetingCanvas, {
      props: { doc: store.current_data as ScientificMeetingDocumentJSON },
    })

    expect(wrapper.text()).toContain('Step1. 目标')
    await wrapper.get('input[aria-label="会议类型"]').setValue('周会')
    await wrapper.get('input[aria-label="梳理人"]').setValue('林夏')
    const doc = store.current_data as ScientificMeetingDocumentJSON
    expect(doc.meetingType).toBe('周会')
    expect(doc.organizer).toBe('林夏')
    wrapper.unmount()
  })
})
