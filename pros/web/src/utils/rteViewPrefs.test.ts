import { describe, expect, it } from 'vitest'
import { readRteViewPref, rteViewPrefKey, writeRteViewPref } from './rteViewPrefs'

function memoryStorage(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear: () => bag.clear(),
    getItem: (key) => bag.get(key) ?? null,
    key: (index) => [...bag.keys()][index] ?? null,
    removeItem: (key) => {
      bag.delete(key)
    },
    setItem: (key, value) => {
      bag.set(key, value)
    },
  }
}

describe('视图偏好按面板分开', () => {
  it('缺省不写键，另一个面板不受影响', () => {
    const storage = memoryStorage()
    storage.setItem('pageSizeByPanelId', 'keep')
    writeRteViewPref(storage, 'panel-a', { sticky: false, stickyCol: false, dark: false, zoom: 1 })
    expect(storage.getItem(rteViewPrefKey('panel-a'))).toBeNull()
    expect(storage.getItem('pageSizeByPanelId')).toBe('keep')

    writeRteViewPref(storage, 'panel-a', { sticky: true, stickyCol: false, dark: true, zoom: 1.25 })
    writeRteViewPref(storage, 'panel-b', { sticky: false, stickyCol: false, dark: false, zoom: 0.75 })
    expect(readRteViewPref(storage, 'panel-a')).toEqual({ sticky: true, stickyCol: false, dark: true, zoom: 1.25 })
    expect(readRteViewPref(storage, 'panel-b')).toEqual({ sticky: false, stickyCol: false, dark: false, zoom: 0.75 })
    expect(readRteViewPref(storage, 'panel-c')).toEqual({ sticky: false, stickyCol: false, dark: false, zoom: 1 })
  })

  it('不认识的缩放按 100%', () => {
    const storage = memoryStorage()
    storage.setItem(rteViewPrefKey('panel-a'), JSON.stringify({ zoom: 3, sticky: true }))
    expect(readRteViewPref(storage, 'panel-a').zoom).toBe(1)
    expect(readRteViewPref(storage, 'panel-a').sticky).toBe(true)
  })
})
