// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useUiStore } from './ui'

describe('页面设置开关', () => {
  it('默认收起，打开后记住', () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const first = useUiStore()
    expect(first.configPanelOpen).toBe(false)
    first.toggleConfigPanel()
    expect(localStorage.getItem('metamatrix:config-panel')).toBe('1')

    setActivePinia(createPinia())
    expect(useUiStore().configPanelOpen).toBe(true)
  })
})
