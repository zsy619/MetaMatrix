import { describe, expect, it } from 'vitest'
import {
  CROP_ATTR_NAMES,
  cropAttrsStyle,
  cropFromPreset,
  cropIsActive,
  readCropFromAttrs,
  writeCropToAttrs,
} from './rteImageCropAttrs'
import { keepCropOnReplace } from './rteImageCrop'

describe('图片裁剪属性读写', () => {
  it('空属性读出默认裁剪', () => {
    const crop = readCropFromAttrs({})
    expect(crop.aspect).toBe(null)
    expect(crop.focusX).toBe(0.5)
    expect(crop.focusY).toBe(0.5)
    expect(crop.zoom).toBe(1)
  })

  it('写入后能读回', () => {
    const attrs = writeCropToAttrs({}, { aspect: '16/9', focusX: 0.25, focusY: 0.75, zoom: 2 })
    expect(attrs[CROP_ATTR_NAMES.aspect]).toBe('16/9')
    expect(attrs[CROP_ATTR_NAMES.focusX]).toBe(0.25)
    const crop = readCropFromAttrs(attrs)
    expect(crop.aspect).toBe('16/9')
    expect(crop.zoom).toBe(2)
  })

  it('没有有效裁剪时清掉属性', () => {
    const attrs = writeCropToAttrs(
      { src: 'a.png', [CROP_ATTR_NAMES.aspect]: '16/9' },
      { aspect: null, focusX: 0.5, focusY: 0.5, zoom: 1 },
    )
    expect(attrs.src).toBe('a.png')
    expect(CROP_ATTR_NAMES.aspect in attrs).toBe(false)
    expect(cropIsActive(attrs)).toBe(false)
  })

  it('有裁剪时产生 object-fit 样式', () => {
    const attrs = writeCropToAttrs({}, { aspect: '1/1', focusX: 0.5, focusY: 0.5, zoom: 1 })
    const style = cropAttrsStyle(attrs)
    expect(style['object-fit']).toBe('cover')
    expect(style['object-position']).toBe('50% 50%')
  })

  it('没有裁剪时不产生样式', () => {
    expect(cropAttrsStyle({ src: 'a.png' })).toEqual({})
  })

  it('换图后裁剪参数保留', () => {
    const attrs = writeCropToAttrs(
      { src: 'old.png', alt: '旧图' },
      { aspect: '4/3', focusX: 0.1, focusY: 0.2, zoom: 1.5 },
    )
    const next = keepCropOnReplace(attrs, 'new.png')
    expect(next.src).toBe('new.png')
    expect(next.alt).toBe('旧图')
    const crop = readCropFromAttrs(next)
    expect(crop.aspect).toBe('4/3')
    expect(crop.zoom).toBe(1.5)
  })

  it('预设能生成裁剪参数', () => {
    const preset = { id: '16-9', label: '16:9', aspect: '16/9', focusX: 0.5, focusY: 0.5 }
    const crop = cropFromPreset(preset)
    expect(crop.aspect).toBe('16/9')
    expect(crop.zoom).toBe(1)
  })
})
