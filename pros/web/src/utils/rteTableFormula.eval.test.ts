/**
 * 表格公式解析 / 计算的纯函数单测：
 * 区域引用、错误码（#REF! / #VALUE! / #DIV/0! / #NAME?）、循环引用。
 */
import { describe, expect, it } from 'vitest'
import { remapFormulaRows } from './rteTableExtras'
import {
  evaluateCellFormula,
  evaluateFormula,
  evaluateTableFormulas,
  formatCellAddress,
  formulaReferences,
  isFormulaCell,
  parseCellAddress,
  parseCellNumber,
  recalculateTable,
  remapFormulaByAxis,
} from './rteTableFormula'

describe('表格结构变化后的公式', () => {
  const sameCol = (col: number) => col
  it('删掉的行写成 #REF!，区域会收掉这一行', () => {
    const mapRow = (row: number) => (row === 2 ? null : row > 2 ? row - 1 : row)
    expect(remapFormulaByAxis('=A2', mapRow, sameCol)).toBe('=#REF!')
    expect(remapFormulaByAxis('=SUM(A1:A3)', mapRow, sameCol)).toBe('=SUM(A1:A2)')
    expect(evaluateFormula('=#REF!', [['1']], 0, 0).error).toBe('#REF!')
    expect(evaluateFormula('=A1+#REF!', [['4']], 0, 1).error).toBe('#REF!')
  })

  it('中间插入一行时，求和区域把新行包进来', () => {
    const mapRow = (row: number) => (row >= 2 ? row + 1 : row)
    expect(remapFormulaByAxis('=SUM(A1:A3)', mapRow, sameCol)).toBe('=SUM(A1:A4)')
  })

  it('绝对引用跟着格子走，美元符号留着', () => {
    const mapRow = (row: number) => row + 1
    expect(remapFormulaByAxis('=$A$1', mapRow, sameCol)).toBe('=$A$2')
    expect(remapFormulaByAxis('=SUM($A$1:$A$3)', mapRow, sameCol)).toBe('=SUM($A$2:$A$4)')
  })
})

describe('排序后的公式行号', () => {
  it('行号按新位置改写', () => {
    const map = new Map<number, number>([[2, 4], [4, 2]])
    expect(remapFormulaRows('=A2+B4', map)).toBe('=A4+B2')
    expect(remapFormulaRows('不是公式', map)).toBe('不是公式')
  })
})

describe('公式引用', () => {
  it('列出单元格和区域，并去掉重复', () => {
    expect(formulaReferences('=SUM(A1:B2)+A1+C3')).toEqual(['A1:B2', 'A1', 'C3'])
    expect(formulaReferences('不是公式')).toEqual([])
  })
})

describe('单元格地址', () => {
  it('解析与格式化互为逆运算', () => {
    expect(parseCellAddress('B3')).toEqual({ col: 2, row: 3 })
    expect(parseCellAddress('a1')).toEqual({ col: 1, row: 1 })
    expect(parseCellAddress('AA2')).toEqual({ col: 27, row: 2 })
    expect(parseCellAddress('3B')).toBeNull()
    expect(parseCellAddress('')).toBeNull()
    expect(formatCellAddress({ col: 2, row: 3 })).toBe('B3')
    expect(formatCellAddress({ col: 27, row: 2 })).toBe('AA2')
  })

  it('数值解析忽略千分位与百分号', () => {
    expect(parseCellNumber('1,200')).toBe(1200)
    expect(parseCellNumber('50%')).toBe(0.5)
    expect(parseCellNumber('abc')).toBeNull()
    expect(isFormulaCell('=SUM(A1)')).toBe(true)
    expect(isFormulaCell('  =1')).toBe(true)
    expect(isFormulaCell('SUM')).toBe(false)
  })
})

describe('基础聚合函数', () => {
  const grid = [
    ['项目', '金额'],
    ['A', '10'],
    ['B', '20'],
    ['合计', '=SUM(ABOVE)'],
  ]

  it('SUM/AVERAGE/COUNT 只统计数字', () => {
    expect(evaluateCellFormula('=SUM(ABOVE)', grid, 3, 1)).toBe('30')
    expect(evaluateCellFormula('=AVERAGE(ABOVE)', grid, 3, 1)).toBe('15')
    expect(evaluateCellFormula('=COUNT(ABOVE)', grid, 3, 1)).toBe('2')
    expect(evaluateCellFormula('=MAX(ABOVE)', grid, 3, 1)).toBe('20')
    expect(evaluateCellFormula('=MIN(ABOVE)', grid, 3, 1)).toBe('10')
  })

  it('区域与列表引用', () => {
    const grid2 = [
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]
    expect(evaluateCellFormula('=SUM(A1:B2)', grid2, 0, 0)).toBe('12')
    expect(evaluateCellFormula('=SUM(A1,A2)', grid2, 0, 0)).toBe('5')
    expect(evaluateCellFormula('=MAX(A1:B2)', grid2, 0, 0)).toBe('5')
    expect(evaluateCellFormula('=MIN(A1:B2)', grid2, 0, 0)).toBe('1')
  })

  it('单元格引用参与算术，函数结果也能参与运算', () => {
    const grid2 = [
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]
    expect(evaluateCellFormula('=B2*3', grid2, 0, 0)).toBe('15')
    expect(evaluateCellFormula('=A1+1', grid2, 0, 0)).toBe('2')
    expect(evaluateCellFormula('=A2-1', grid2, 0, 0)).toBe('3')
    expect(evaluateCellFormula('=A2/2', grid2, 0, 0)).toBe('2')
    expect(evaluateCellFormula('=SUM(A1:B2)*2', grid2, 0, 0)).toBe('24')
    expect(evaluateCellFormula('=50%+1', grid2, 0, 0)).toBe('1.5')
  })
})

describe('错误码', () => {
  const grid = [
    ['1', '2'],
    ['abc', '4'],
  ]

  it('除零返回 #DIV/0!', () => {
    expect(evaluateFormula('=A1/0', grid, 0, 0)).toEqual({ ok: false, value: null, error: '#DIV/0!' })
  })

  it('语法非法返回 #VALUE!', () => {
    expect(evaluateFormula('=SUM(', grid, 0, 0).error).toBe('#VALUE!')
    expect(evaluateFormula('=1+', grid, 0, 0).error).toBe('#VALUE!')
    expect(evaluateFormula('B2', grid, 0, 0).error).toBe('#VALUE!')
  })

  it('未知函数返回 #NAME?', () => {
    expect(evaluateFormula('=MODE(A1)', grid, 0, 0).error).toBe('#NAME?')
    expect(evaluateFormula('=NOPE(', grid, 0, 0).error).toBe('#NAME?')
  })

  it('操作数不是数字返回 #VALUE!', () => {
    expect(evaluateFormula('=A2+1', grid, 1, 0).error).toBe('#VALUE!')
  })

  it('引用越界返回 #REF!', () => {
    expect(evaluateFormula('=Z9', grid, 0, 0).error).toBe('#REF!')
    expect(evaluateFormula('=SUM(Z1:Z3)', grid, 0, 0).error).toBe('#REF!')
  })

  it('错误单元格在重算结果里保留错误码', () => {
    const result = evaluateTableFormulas([
      ['1', '=A1/0'],
      ['=SUM(A1:B1)', '=NOPE('],
    ])
    expect(result.grid[0]![1]).toBe('#DIV/0!')
    expect(result.grid[1]![0]).toBe('#DIV/0!')
    expect(result.grid[1]![1]).toBe('#NAME?')
    expect(result.cells.map((c) => c.error)).toEqual(['#DIV/0!', '#DIV/0!', '#NAME?'])
  })
})

describe('循环引用', () => {
  it('自引用返回 #REF!', () => {
    const grid = [['=A1']]
    expect(evaluateFormula('=A1', grid, 0, 0).error).toBe('#REF!')
  })

  it('两格互相引用返回 #REF!', () => {
    const grid = [['=B1', '=A1']]
    expect(evaluateFormula('=A1', grid, 0, 0).error).toBe('#REF!')
    expect(evaluateFormula('=B1', grid, 0, 1).error).toBe('#REF!')
  })

  it('区域包含自身返回 #REF!', () => {
    const grid = [['1', '=SUM(A1:B1)']]
    expect(evaluateFormula('=SUM(A1:B1)', grid, 0, 1).error).toBe('#REF!')
  })

  it('重算整表时循环单元格写入 #REF!', () => {
    const result = evaluateTableFormulas([['=B1', '=A1']])
    expect(result.grid[0]![0]).toBe('#REF!')
    expect(result.grid[0]![1]).toBe('#REF!')
  })
})

describe('重算整表', () => {
  it('公式可以引用另一个公式单元格', () => {
    const grid = [
      ['10', '20'],
      ['=A1*2', '=B1+A1*2'],
    ]
    const recalculated = recalculateTable(grid)
    expect(recalculated[0]![0]).toBe('10')
    expect(recalculated[1]![0]).toBe('20')
    expect(recalculated[1]![1]).toBe('40')
  })

  it('非公式单元格原样保留', () => {
    expect(recalculateTable([['a', '=SUM(A1:A1)']])[0]![0]).toBe('a')
  })
})
