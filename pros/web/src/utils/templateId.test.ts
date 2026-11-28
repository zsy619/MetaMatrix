import { describe, expect, it } from 'vitest'
import { resolveCanvasTemplateId } from './templateId'

const known = new Set(['ai-boundary', 'scene-three-high', 'dual-triangle'])

describe('resolveCanvasTemplateId', () => {
  it('原样收下登记过的 id', () => {
    expect(resolveCanvasTemplateId('ai-boundary', (id) => known.has(id))).toBe('ai-boundary')
  })

  it('剥掉数字后缀后仍能对上画布', () => {
    expect(resolveCanvasTemplateId('ai-boundary-4734', (id) => known.has(id))).toBe('ai-boundary')
    expect(resolveCanvasTemplateId('scene-three-high-12', (id) => known.has(id))).toBe('scene-three-high')
  })

  it('对不上时不要偷偷换成别的画布', () => {
    expect(resolveCanvasTemplateId('not-a-canvas', (id) => known.has(id))).toBeNull()
    expect(resolveCanvasTemplateId('ai-boundary-beta', (id) => known.has(id))).toBeNull()
    expect(resolveCanvasTemplateId('', (id) => known.has(id))).toBeNull()
  })
})
