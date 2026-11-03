// @vitest-environment happy-dom
/**
 * 属性面板 schema 的覆盖测试：
 * - 39 个官方类别每个都有一份 schema；
 * - 每份 schema 至少包含「通用 / 系列 / 样式」三段；
 * - 字段路径合法（不出现空路径 / 数组下标以外的怪路径）；
 * - 3D·GL 类别也都有 schema。
 */
import { describe, expect, it } from 'vitest'
import { ECHARTS_CATEGORIES } from '../templates'
import {
  CHART_PANEL_SCHEMAS,
  FALLBACK_CHART_PANEL_SCHEMA,
  getChartPanelSchema,
} from './index'
import type { PanelField } from './types'

function checkFields(fields: PanelField[], where: string) {
  for (const field of fields) {
    expect(field.path, `${where} 字段路径不能为空`).toBeTruthy()
    expect(field.label, `${where} 字段要有中文标签`).toBeTruthy()
    expect(
      ['text', 'textarea', 'number', 'boolean', 'select', 'color', 'json'],
      `${where} / ${field.path} 的 kind 非法`,
    ).toContain(field.kind)
    if (field.kind === 'select') {
      expect(field.options?.length, `${where} / ${field.path} 的下拉要有选项`).toBeGreaterThan(0)
      for (const option of field.options || []) {
        expect(option.value).toBeTruthy()
        expect(option.label).toBeTruthy()
      }
    }
    if (field.kind === 'number') {
      if (field.min !== undefined && field.max !== undefined) {
        expect(field.min).toBeLessThanOrEqual(field.max)
      }
    }
  }
}

describe('图表属性面板 schema', () => {
  it('39 个官方类别每个都有一份 schema', () => {
    expect(ECHARTS_CATEGORIES).toHaveLength(39)
    for (const category of ECHARTS_CATEGORIES) {
      expect(CHART_PANEL_SCHEMAS[category.id], `${category.id} 缺 schema`).toBeTruthy()
      expect(CHART_PANEL_SCHEMAS[category.id]!.label).toBe(category.label)
    }
    expect(Object.keys(CHART_PANEL_SCHEMAS)).toHaveLength(39)
  })

  it('每份 schema 至少有通用 / 系列 / 样式三段，且字段合法', () => {
    for (const [id, schema] of Object.entries(CHART_PANEL_SCHEMAS)) {
      const ids = schema.sections.map((section) => section.id)
      expect(ids, `${id} 缺通用段`).toContain('general')
      expect(ids, `${id} 缺系列段`).toContain('series')
      expect(ids, `${id} 缺样式段`).toContain('style')
      for (const section of schema.sections) {
        expect(section.title).toBeTruthy()
        expect(section.fields.length, `${id} / ${section.id} 段没有字段`).toBeGreaterThan(0)
        checkFields(section.fields, `${id} / ${section.id}`)
      }
    }
  })

  it('笛卡尔类图表有坐标轴段，饼图 / 仪表盘没有', () => {
    expect(CHART_PANEL_SCHEMAS.line!.sections.map((s) => s.id)).toContain('axis')
    expect(CHART_PANEL_SCHEMAS.bar!.sections.map((s) => s.id)).toContain('axis')
    expect(CHART_PANEL_SCHEMAS.pie!.sections.map((s) => s.id)).not.toContain('axis')
    expect(CHART_PANEL_SCHEMAS.gauge!.sections.map((s) => s.id)).not.toContain('axis')
  })

  it('3D·GL 类别也都有 schema', () => {
    const gl = ECHARTS_CATEGORIES.filter((item) => item.section === 'gl')
    expect(gl.length).toBeGreaterThan(0)
    for (const category of gl) {
      expect(CHART_PANEL_SCHEMAS[category.id]).toBeTruthy()
    }
  })

  it('未知类型回落到通用 schema', () => {
    const fallback = getChartPanelSchema('not-a-real-type')
    expect(fallback).toBe(FALLBACK_CHART_PANEL_SCHEMA)
    expect(getChartPanelSchema('')).toBe(FALLBACK_CHART_PANEL_SCHEMA)
    expect(getChartPanelSchema('line')).toBe(CHART_PANEL_SCHEMAS.line)
  })
})
