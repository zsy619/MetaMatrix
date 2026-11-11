// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  FIND_DIALOG_POS_KEY,
  clampFindDialogPos,
  readFindDialogPos,
  writeFindDialogPos,
} from './rteFindDialogPos'

describe('查找弹窗位置', () => {
  it('记住并读回上次坐标', () => {
    localStorage.removeItem(FIND_DIALOG_POS_KEY)
    expect(readFindDialogPos()).toBeNull()
    writeFindDialogPos({ left: 120.4, top: 40.6 })
    expect(readFindDialogPos()).toEqual({ left: 120, top: 41 })
    localStorage.setItem(FIND_DIALOG_POS_KEY, '{')
    expect(readFindDialogPos()).toBeNull()
  })

  it('拖出视口时收回来', () => {
    expect(clampFindDialogPos(-40, 900, 200, 100, { width: 800, height: 600 })).toEqual({
      left: 8,
      top: 492,
    })
    expect(clampFindDialogPos(700, 10, 200, 100, { width: 800, height: 600 })).toEqual({
      left: 592,
      top: 10,
    })
  })
})