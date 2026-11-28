// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import RaciMatrixCanvas from './RaciMatrixCanvas.vue'
import type { RaciMatrixDocumentJSON } from '../../types/canvas'
import { isRaciMatrixDoc } from '../../types/canvas'

describe('RACI 责任矩阵', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('点空格子变成执行，再点变成负责', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('raci-matrix')
    const wrapper = mount(RaciMatrixCanvas, { props: { doc: store.current_data as RaciMatrixDocumentJSON } })
    const cell = wrapper.get('[aria-label="版本交付 执行"]')
    expect(cell.get('.role-letter').text()).toBe('·')
    expect(cell.get('.role-name').text()).toBe('执行')
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'RaciMatrixCanvas.vue'), 'utf8')
    expect(source).toContain('justify-content: space-between')
    expect(source).toContain('.role-name { display: block; font-size: 15px; font-weight: 650; }')
    await cell.trigger('click')
    expect(wrapper.get('[aria-label="版本交付 执行"] .role-letter').text()).toBe('R')
    await wrapper.get('[aria-label="版本交付 执行"]').trigger('click')
    expect(wrapper.get('[aria-label="版本交付 执行"] .role-letter').text()).toBe('A')
    const doc = store.current_data
    expect(isRaciMatrixDoc(doc) && doc.tasks.find((task) => task.id === 'task_delivery')?.cells.role_do).toBe('A')
    wrapper.unmount()
  })
})
