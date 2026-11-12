import { describe, expect, it } from 'vitest'
import { FDE_SHEET_IDS, FDE_SHEET_META, FDE_SHEET_TEMPLATES } from './fdeSheets'
import { isTemplateId, TEMPLATE_META } from '../stores/document'

describe('FDE 一页纸画布', () => {
  it('使用顺序和工具箱里的画布都登记了，而且归在 FDE', () => {
    expect(FDE_SHEET_IDS).toEqual([
      'fde-scenario',
      'fde-select',
      'fde-pilot',
      'fde-eval',
      'fde-launch',
      'fde-roi',
      'fde-pricing',
      'fde-org',
      'fde-self',
      'fde-interview',
      'fde-portfolio',
      'fde-requirements',
      'fde-acceptance',
      'fde-tooling',
      'fde-contract',
      'fde-kickoff',
    ])
    for (const id of FDE_SHEET_IDS) {
      expect(isTemplateId(id)).toBe(true)
      expect(TEMPLATE_META[id].category).toBe('fde')
      expect(TEMPLATE_META[id].name).toBe(FDE_SHEET_META[id].name)
      expect(FDE_SHEET_TEMPLATES[id].type).toBe('fde_sheet')
      expect(FDE_SHEET_TEMPLATES[id].blocks.length).toBeGreaterThan(0)
    }
  })
})
