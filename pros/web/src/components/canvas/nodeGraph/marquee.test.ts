import { describe, expect, it } from 'vitest'
import { marqueeRect } from './marquee'

describe('框选矩形坐标换算', () => {
  it('按视口平移缩放换算成屏幕坐标', () => {
    const rect = marqueeRect(10, 20, 110, 120, { x: 80, y: 140, zoom: 1 })
    expect(rect).toEqual({ left: 90, top: 160, width: 100, height: 100 })
  })

  it('反向拖拽时左上角仍是较小的一边', () => {
    const rect = marqueeRect(110, 120, 10, 20, { x: 0, y: 0, zoom: 1 })
    expect(rect).toEqual({ left: 10, top: 20, width: 100, height: 100 })
  })

  it('缩放时宽高一起放大', () => {
    const rect = marqueeRect(0, 0, 100, 50, { x: 20, y: 30, zoom: 2 })
    expect(rect).toEqual({ left: 20, top: 30, width: 200, height: 100 })
  })
})
