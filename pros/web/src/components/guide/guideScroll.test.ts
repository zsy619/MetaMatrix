import { describe, expect, it } from 'vitest'
import {
  GUIDE_SCROLL_KEY,
  createGuideScrollMemory,
  readGuideScroll,
  writeGuideScroll,
  type GuideScroller,
} from './guideScroll'

function box(scrollTop: number, scrollHeight = 4000, clientHeight = 800): GuideScroller {
  return { scrollTop, scrollHeight, clientHeight }
}

describe('readGuideScroll / writeGuideScroll', () => {
  it('只接受正数，坏值当作顶部', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }
    expect(readGuideScroll(storage)).toBe(0)
    writeGuideScroll(storage, 842.4)
    expect(storage.getItem(GUIDE_SCROLL_KEY)).toBe('842')
    expect(readGuideScroll(storage)).toBe(842)
    writeGuideScroll(storage, Number.NaN)
    expect(readGuideScroll(storage)).toBe(0)
    storage.setItem(GUIDE_SCROLL_KEY, 'nope')
    expect(readGuideScroll(storage)).toBe(0)
  })
})

describe('createGuideScrollMemory', () => {
  it('内容够高时回到记下的位置，程序触发的滚动不覆盖', () => {
    const memory = createGuideScrollMemory(960)
    const scroller = box(0)
    expect(memory.apply(scroller)).toBe(true)
    expect(scroller.scrollTop).toBe(960)
    expect(memory.onScroll(scroller)).toBeNull()
    expect(memory.userMoved).toBe(false)
    expect(memory.snapshot(scroller)).toBe(960)
  })

  it('内容还不够高时先停在底部，并保留原来的位置', () => {
    const memory = createGuideScrollMemory(2200)
    const scroller = box(0, 1000, 800)
    expect(memory.apply(scroller)).toBe(false)
    expect(scroller.scrollTop).toBe(200)
    expect(memory.onScroll(scroller)).toBeNull()
    expect(memory.snapshot(null)).toBe(2200)

    scroller.scrollHeight = 4000
    expect(memory.apply(scroller)).toBe(true)
    expect(scroller.scrollTop).toBe(2200)
  })

  it('用户自己滚动后记下新位置，不再拽回旧值', () => {
    const memory = createGuideScrollMemory(960)
    const scroller = box(0)
    memory.apply(scroller)
    memory.onScroll(scroller)

    memory.armUserScroll()
    scroller.scrollTop = 240
    expect(memory.onScroll(scroller)).toBe(240)
    expect(memory.apply(scroller)).toBe(true)
    expect(scroller.scrollTop).toBe(240)
    expect(memory.snapshot(scroller)).toBe(240)
  })

  it('恢复位置时的滚动回声不覆盖原位置', () => {
    const memory = createGuideScrollMemory(960)
    const scroller = box(0, 1200, 800)
    memory.armUserScroll()
    expect(memory.apply(scroller)).toBe(false)
    expect(scroller.scrollTop).toBe(400)
    expect(memory.onScroll(scroller)).toBeNull()
    expect(memory.pinned).toBe(960)
    expect(memory.userMoved).toBe(false)
  })

  it('没有用户滚动时，离开页面仍保存进入时的位置', () => {
    const memory = createGuideScrollMemory(640)
    const scroller = box(0)
    expect(memory.snapshot(scroller)).toBe(640)
  })
})
