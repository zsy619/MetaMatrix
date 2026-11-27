import { describe, expect, it } from 'vitest'
import { buildPasteCells, cellToText } from './clipboard'

describe('base clipboard', () => {
  it('把单元格值转成可复制文本', () => {
    expect(cellToText(null)).toBe('')
    expect(cellToText(undefined)).toBe('')
    expect(cellToText(true)).toBe('是')
    expect(cellToText(['a', 'b'])).toBe('a, b')
    expect(cellToText(12000)).toBe('12000')
  })

  it('按 TSV 把多行多列映射到目标单元格', () => {
    const cells = buildPasteCells({
      text: '888888\t2027-01-15',
      rows: [{ id: 'r1' }, { id: 'r2' }],
      fields: [{ id: 'f1' }, { id: 'f2' }],
      startRow: 1,
      startCol: 0,
    })
    expect(cells).toEqual([
      { recordId: 'r2', fieldId: 'f1', value: '888888' },
      { recordId: 'r2', fieldId: 'f2', value: '2027-01-15' },
    ])
  })

  it('空值写 null，公式字段跳过', () => {
    const cells = buildPasteCells({
      text: 'x\t\ny',
      rows: [{ id: 'r1' }, { id: 'r2' }],
      fields: [{ id: 'f1' }, { id: 'formula' }],
      startRow: 0,
      startCol: 0,
      isReadonly: (id) => id === 'formula',
    })
    expect(cells).toEqual([
      { recordId: 'r1', fieldId: 'f1', value: 'x' },
      { recordId: 'r2', fieldId: 'f1', value: 'y' },
    ])
  })

  it('超出视图范围的行列被忽略', () => {
    const cells = buildPasteCells({
      text: 'a\tb\tc',
      rows: [{ id: 'r1' }],
      fields: [{ id: 'f1' }, { id: 'f2' }],
      startRow: 0,
      startCol: 0,
    })
    expect(cells).toHaveLength(2)
  })
})
