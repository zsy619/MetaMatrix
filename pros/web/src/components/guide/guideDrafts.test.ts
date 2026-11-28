import { describe, expect, it } from 'vitest'
import { draftWhen, readLocalDrafts } from './guideDrafts'

describe('readLocalDrafts', () => {
  it('只保留认识的模板，并按最近修改排在前面', () => {
    const drafts = readLocalDrafts([
      { key: 'metamatrix:doc:ten-check', value: '{}' },
      { key: 'metamatrix:doc-meta:ten-check', value: JSON.stringify({ title: '报价自检', updatedAt: '2026-11-12T02:00:00.000Z' }) },
      { key: 'metamatrix:doc-meta:not-a-canvas', value: JSON.stringify({ title: '无', updatedAt: '2026-11-12T08:00:00.000Z' }) },
      { key: 'metamatrix:doc-meta:fde-scenario', value: '{not json' },
      { key: 'metamatrix:doc-meta:swot', value: JSON.stringify({ title: '  ', updatedAt: '2026-11-12T06:00:00.000Z' }) },
    ])
    expect(drafts.map((draft) => draft.templateId)).toEqual(['swot', 'ten-check'])
    expect(drafts[0]?.title).toBe('SWOT 分析')
    expect(drafts[1]?.title).toBe('报价自检')
  })

  it('最多留六条', () => {
    const entries = ['swot', 'okr', 'pdca', 'rice', 'kano', 'soar', 'vrio'].map((id, index) => ({
      key: `metamatrix:doc-meta:${id}`,
      value: JSON.stringify({ title: id, updatedAt: `2026-11-12T0${index}:00:00.000Z` }),
    }))
    expect(readLocalDrafts(entries)).toHaveLength(6)
    expect(readLocalDrafts(entries)[0]?.templateId).toBe('vrio')
  })
})

describe('draftWhen', () => {
  it('按上海时间显示', () => {
    expect(draftWhen('2026-11-12T02:30:00.000Z')).toBe('11/12 10:30')
  })
})