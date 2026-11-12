import { describe, expect, it } from 'vitest'
import { FDE_SHEET_TEMPLATES } from '../../templates/fdeSheets'
import { fdeColumnTone, fdeColumnToneKnown } from './fdeTableTone'

describe('fde table column tones', () => {
  it('给每张对照表的每一列指定颜色，并且相邻列不同', () => {
    const tables = Object.values(FDE_SHEET_TEMPLATES).flatMap((doc) =>
      doc.blocks.filter((block) => block.kind === 'table'),
    )
    expect(tables.length).toBeGreaterThan(0)
    for (const table of tables) {
      expect(table.columns.length).toBeGreaterThan(1)
      for (const column of table.columns) {
        expect(fdeColumnToneKnown(table.id, column.id), `${table.id}:${column.id}`).toBe(true)
      }
      for (let index = 1; index < table.columns.length; index += 1) {
        const prev = table.columns[index - 1]
        const next = table.columns[index]
        expect(fdeColumnTone(table.id, prev.id), `${table.id} ${prev.id}/${next.id}`).not.toBe(
          fdeColumnTone(table.id, next.id),
        )
      }
    }
  })

  it('优点和缺点、风险和对策用相反的颜色', () => {
    expect(fdeColumnTone('tools', 'good')).toBe('verdict')
    expect(fdeColumnTone('tools', 'bad')).toBe('fail')
    expect(fdeColumnTone('risks', 'risk')).toBe('fail')
    expect(fdeColumnTone('risks', 'response')).toBe('verdict')
    expect(fdeColumnTone('candidates', 'cost')).toBe('fail')
  })
})
