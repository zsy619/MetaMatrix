/**
 * 框选矩形（marquee）的坐标换算。
 *
 * 拖拽记录的是世界坐标，而框选框画在屏幕坐标系里，
 * 必须按视口平移与缩放换算，否则方框会偏在视口之外、不跟手。
 */
import type { NodeGraphViewport } from '../../../types/nodeGraph'

export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

export function marqueeRect(
  startX: number,
  startY: number,
  curX: number,
  curY: number,
  viewport: NodeGraphViewport,
): MarqueeRect {
  const zoom = viewport.zoom || 1
  const left = Math.min(startX, curX)
  const top = Math.min(startY, curY)
  return {
    left: left * zoom + viewport.x,
    top: top * zoom + viewport.y,
    width: Math.abs(curX - startX) * zoom,
    height: Math.abs(curY - startY) * zoom,
  }
}
