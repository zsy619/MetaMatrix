import assert from 'node:assert/strict'
import {
  evaluateCellFormula,
  formatCellAddress,
  isFormulaCell,
  parseCellAddress,
  parseCellNumber,
  recalculateTable,
} from './rteTableFormula.ts'

// 地址解析与格式化
assert.deepEqual(parseCellAddress('B3'), { col: 2, row: 3 })
assert.deepEqual(parseCellAddress('a1'), { col: 1, row: 1 })
assert.deepEqual(parseCellAddress('AA2'), { col: 27, row: 2 })
assert.equal(parseCellAddress('3B'), null)
assert.equal(parseCellAddress(''), null)
assert.equal(formatCellAddress({ col: 2, row: 3 }), 'B3')
assert.equal(formatCellAddress({ col: 27, row: 2 }), 'AA2')

// 数值解析
assert.equal(parseCellNumber('1,200'), 1200)
assert.equal(parseCellNumber('50%'), 0.5)
assert.equal(parseCellNumber('abc'), null)
assert.equal(isFormulaCell('=SUM(A1)'), true)
assert.equal(isFormulaCell('  =1'), true)
assert.equal(isFormulaCell('SUM'), false)

// SUM(ABOVE)：文本单元格忽略
const grid = [
  ['项目', '金额'],
  ['A', '10'],
  ['B', '20'],
  ['合计', '=SUM(ABOVE)'],
]
assert.equal(evaluateCellFormula('=SUM(ABOVE)', grid, 3, 1), '30')

// AVERAGE 只算数字
assert.equal(evaluateCellFormula('=AVERAGE(ABOVE)', grid, 3, 1), '15')

// COUNT 只数数字
assert.equal(evaluateCellFormula('=COUNT(ABOVE)', grid, 3, 1), '2')

// 空白格在加减里当 0，文字仍然算不了。求和和计数跳过空白。
assert.equal(evaluateCellFormula('=A1+1', [['']], 0, 0), '1')
assert.equal(evaluateCellFormula('=A1+1', [['文字']], 0, 0), null)
assert.equal(evaluateCellFormula('=SUM(A1:A2)', [[''], ['5']], 0, 0), '5')
assert.equal(evaluateCellFormula('=COUNT(A1:A2)', [[''], ['5']], 0, 0), '1')
assert.equal(evaluateCellFormula('=AVERAGE(A1:A2)', [[''], ['5']], 0, 0), '5')

// 区域求和与列表求和
const grid2 = [
  ['1', '2', '3'],
  ['4', '5', '6'],
]
assert.equal(evaluateCellFormula('=SUM(A1:B2)', grid2, 0, 0), '12')
assert.equal(evaluateCellFormula('=SUM(A1,A2)', grid2, 0, 0), '5')

// 单元格引用参与算术
assert.equal(evaluateCellFormula('=B2*3', grid2, 0, 0), '15')
assert.equal(evaluateCellFormula('=A1+1', grid2, 0, 0), '2')
assert.equal(evaluateCellFormula('=A2-1', grid2, 0, 0), '3')
assert.equal(evaluateCellFormula('=A2/2', grid2, 0, 0), '2')

// 除零与非法公式
assert.equal(evaluateCellFormula('=A1/0', grid2, 0, 0), null)
assert.equal(evaluateCellFormula('=NOPE(', grid2, 0, 0), null)
assert.equal(evaluateCellFormula('=SUM(', grid2, 0, 0), null)
assert.equal(evaluateCellFormula('B2', grid2, 0, 0), null)

// 百分号
assert.equal(evaluateCellFormula('=50%+1', grid2, 0, 0), '1.5')

// 从 Excel 贴来的绝对引用，$ 不影响取值
assert.equal(evaluateCellFormula('=$A$1', grid2, 0, 0), '1')
assert.equal(evaluateCellFormula('=SUM($A$1:$B$1)', grid2, 0, 0), '3')

// 求和区域比表格长时，多出来的格子跳过，不把整段算成 #REF!
assert.equal(evaluateCellFormula('=A1>10', [['12']], 0, 0), '1')
assert.equal(evaluateCellFormula('=A1>10', [['8']], 0, 0), '0')
assert.equal(evaluateCellFormula('=A1>=8', [['8']], 0, 0), '1')
assert.equal(evaluateCellFormula('=A1<>8', [['9']], 0, 0), '1')
assert.equal(evaluateCellFormula('=A1=8', [['8']], 0, 0), '1')
assert.equal(evaluateCellFormula('=SUM（A1：A2）', [['1'], ['2']], 0, 0), '3')
assert.equal(evaluateCellFormula('=50％+1', grid2, 0, 0), '1.5')
assert.equal(evaluateCellFormula('=SUM(A1:A5)', [['1'], ['2'], ['3']], 0, 0), '6')
assert.equal(evaluateCellFormula('=A5', [['1'], ['2'], ['3']], 0, 0), null)

// 重算：公式引用另一个公式
const grid3 = [
  ['10', '20'],
  ['=A1*2', '=B1+A1*2'],
]
const recalculated = recalculateTable(grid3)
assert.equal(recalculated[0]![0], '10')
assert.equal(recalculated[1]![0], '20')
assert.equal(recalculated[1]![1], '40')

// 非公式单元格原样保留
const grid4 = [['a', '=SUM(A1:A1)']]
assert.equal(recalculateTable(grid4)[0]![0], 'a')

console.log('rteTableFormula ok')
