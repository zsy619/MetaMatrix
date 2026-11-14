import assert from 'node:assert/strict'
import {
  evaluateCellFormula,
  evaluateFormula,
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
assert.equal(evaluateCellFormula('=EXP(0)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=EXP(1)', [['0']], 0, 0), '2.7183')
assert.equal(evaluateCellFormula('=LN(1)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=LN(EXP(1))', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=LOG(100)', [['0']], 0, 0), '2')
assert.equal(evaluateCellFormula('=LOG(8,2)', [['0']], 0, 0), '3')
assert.equal(evaluateCellFormula('=LOG10(1000)', [['0']], 0, 0), '3')
assert.equal(evaluateCellFormula('=LOG10(1)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=FACT(5)', [['0']], 0, 0), '120')
assert.equal(evaluateCellFormula('=FACT(0)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=GCD(12,18)', [['0']], 0, 0), '6')
assert.equal(evaluateCellFormula('=GCD(12,18,24)', [['0']], 0, 0), '6')
assert.equal(evaluateCellFormula('=LCM(4,6)', [['0']], 0, 0), '12')
assert.equal(evaluateCellFormula('=LCM(3,5,6)', [['0']], 0, 0), '30')
assert.equal(evaluateCellFormula('=TRUNC(1.9)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=TRUNC(-1.9)', [['0']], 0, 0), '-1')
assert.equal(evaluateCellFormula('=TRUNC(1.28,1)', [['0']], 0, 0), '1.2')
assert.equal(evaluateCellFormula('=QUOTIENT(10,3)', [['0']], 0, 0), '3')
assert.equal(evaluateCellFormula('=QUOTIENT(-10,3)', [['0']], 0, 0), '-3')
assert.equal(evaluateCellFormula('=EVEN(1.5)', [['0']], 0, 0), '2')
assert.equal(evaluateCellFormula('=EVEN(2)', [['0']], 0, 0), '2')
assert.equal(evaluateCellFormula('=EVEN(-1)', [['0']], 0, 0), '-2')
assert.equal(evaluateCellFormula('=EVEN(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=ODD(1.5)', [['0']], 0, 0), '3')
assert.equal(evaluateCellFormula('=ODD(3)', [['0']], 0, 0), '3')
assert.equal(evaluateCellFormula('=ODD(-2)', [['0']], 0, 0), '-3')
assert.equal(evaluateCellFormula('=ODD(0)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=COMBIN(5,2)', [['0']], 0, 0), '10')
assert.equal(evaluateCellFormula('=COMBIN(5,0)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=COMBIN(6,3)', [['0']], 0, 0), '20')
assert.equal(evaluateCellFormula('=PERMUT(5,2)', [['0']], 0, 0), '20')
assert.equal(evaluateCellFormula('=PERMUT(5,0)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=PERMUT(4,3)', [['0']], 0, 0), '24')
assert.equal(evaluateCellFormula('=DEGREES(PI())', [['0']], 0, 0), '180')
assert.equal(evaluateCellFormula('=DEGREES(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=DEGREES(PI()/2)', [['0']], 0, 0), '90')
assert.equal(evaluateCellFormula('=RADIANS(180)', [['0']], 0, 0), '3.1416')
assert.equal(evaluateCellFormula('=RADIANS(90)', [['0']], 0, 0), '1.5708')
assert.equal(evaluateCellFormula('=RADIANS(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=SIN(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=SIN(PI()/2)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=SIN(PI()/6)', [['0']], 0, 0), '0.5')
assert.equal(evaluateCellFormula('=COS(0)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=COS(PI())', [['0']], 0, 0), '-1')
assert.equal(evaluateCellFormula('=COS(PI()/3)', [['0']], 0, 0), '0.5')
assert.equal(evaluateCellFormula('=TAN(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=TAN(PI()/4)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=ASIN(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=ASIN(1)', [['0']], 0, 0), '1.5708')
assert.equal(evaluateCellFormula('=ASIN(0.5)', [['0']], 0, 0), '0.5236')
assert.equal(evaluateCellFormula('=ACOS(1)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=ACOS(0)', [['0']], 0, 0), '1.5708')
assert.equal(evaluateCellFormula('=ACOS(0.5)', [['0']], 0, 0), '1.0472')
assert.equal(evaluateCellFormula('=ATAN(0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=ATAN(1)', [['0']], 0, 0), '0.7854')
assert.equal(evaluateCellFormula('=ATAN2(1,1)', [['0']], 0, 0), '0.7854')
assert.equal(evaluateCellFormula('=ATAN2(1,0)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=ATAN2(0,1)', [['0']], 0, 0), '1.5708')
assert.equal(evaluateCellFormula('=PI()', [['0']], 0, 0), '3.1416')
assert.equal(evaluateCellFormula('=ROUND(PI(),2)', [['0']], 0, 0), '3.14')
assert.equal(evaluateCellFormula('=ROUNDDOWN(A1)', [['1.9']], 0, 0), '1')
assert.equal(evaluateCellFormula('=ROUNDDOWN(A1,1)', [['1.29']], 0, 0), '1.2')
assert.equal(evaluateCellFormula('=ROUNDDOWN(A1)', [['-1.9']], 0, 0), '-1')
assert.equal(evaluateCellFormula('=ROUNDUP(A1)', [['1.2']], 0, 0), '2')
assert.equal(evaluateCellFormula('=ROUNDUP(A1,1)', [['1.21']], 0, 0), '1.3')
assert.equal(evaluateCellFormula('=ROUNDUP(A1)', [['-1.2']], 0, 0), '-2')
assert.equal(evaluateCellFormula('=COUNTA(A1:A3)', [['1'], [''], ['甲']], 0, 0), '2')
assert.equal(evaluateCellFormula('=COUNT(A1:A3)', [['1'], [''], ['甲']], 0, 0), '1')
assert.equal(evaluateCellFormula('=MEDIAN(A1:A3)', [['1'], ['9'], ['2']], 0, 0), '2')
assert.equal(evaluateCellFormula('=MEDIAN(A1:A4)', [['1'], ['2'], ['3'], ['4']], 0, 0), '2.5')
assert.deepEqual(evaluateFormula('=MEDIAN(A1)', [['']], 0, 0), { ok: false, value: null, error: '#DIV/0!' })
assert.equal(evaluateCellFormula('=PRODUCT(A1,B1)', [['2', '3']], 0, 0), '6')
assert.equal(evaluateCellFormula('=PRODUCT(A1:A2)', [['2', '']], 0, 0), '2')
assert.equal(evaluateCellFormula('=PRODUCT(A1)', [['']], 0, 0), '0')
assert.equal(evaluateCellFormula('=NOT(A1)', [['0']], 0, 0), '1')
assert.equal(evaluateCellFormula('=NOT(A1>0)', [['-2']], 0, 0), '1')
assert.equal(evaluateCellFormula('=NOT(A1)', [['3']], 0, 0), '0')
assert.equal(evaluateCellFormula('=FLOOR(A1)', [['3.2']], 0, 0), '3')
assert.equal(evaluateCellFormula('=FLOOR(A1)', [['-1.2']], 0, 0), '-2')
assert.equal(evaluateCellFormula('=FLOOR(A1,B1)', [['7', '3']], 0, 0), '6')
assert.deepEqual(evaluateFormula('=FLOOR(A1,0)', [['7']], 0, 0), { ok: false, value: null, error: '#DIV/0!' })
assert.equal(evaluateCellFormula('=CEILING(A1)', [['3.2']], 0, 0), '4')
assert.equal(evaluateCellFormula('=CEILING(A1)', [['-1.2']], 0, 0), '-1')
assert.equal(evaluateCellFormula('=CEILING(A1,B1)', [['7', '3']], 0, 0), '9')
assert.deepEqual(evaluateFormula('=CEILING(A1,0)', [['7']], 0, 0), { ok: false, value: null, error: '#DIV/0!' })
assert.equal(evaluateCellFormula('=SIGN(A1)', [['-4']], 0, 0), '-1')
assert.equal(evaluateCellFormula('=SIGN(A1)', [['0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=SIGN(A1)', [['3.2']], 0, 0), '1')
assert.equal(evaluateCellFormula('=SQRT(A1)', [['9']], 0, 0), '3')
assert.equal(evaluateCellFormula('=SQRT(0)', [['0']], 0, 0), '0')
assert.deepEqual(evaluateFormula('=SQRT(-1)', [['0']], 0, 0), { ok: false, value: null, error: '#VALUE!' })
assert.equal(evaluateCellFormula('=POWER(A1,B1)', [['2', '3']], 0, 0), '8')
assert.equal(evaluateCellFormula('=A1^B1', [['2', '3']], 0, 0), '8')
assert.equal(evaluateCellFormula('=2^3^2', [['0']], 0, 0), '512')
assert.equal(evaluateCellFormula('=-2^2', [['0']], 0, 0), '-4')
assert.deepEqual(evaluateFormula('=POWER(0,-1)', [['0']], 0, 0), { ok: false, value: null, error: '#DIV/0!' })
assert.equal(evaluateCellFormula('=MOD(A1,B1)', [['5', '2']], 0, 0), '1')
assert.equal(evaluateCellFormula('=MOD(A1,B1)', [['-5', '2']], 0, 0), '1')
assert.deepEqual(evaluateFormula('=MOD(A1,0)', [['5']], 0, 0), { ok: false, value: null, error: '#DIV/0!' })
assert.equal(evaluateCellFormula('=INT(A1)', [['3.7']], 0, 0), '3')
assert.equal(evaluateCellFormula('=INT(A1)', [['-1.2']], 0, 0), '-2')
assert.equal(evaluateCellFormula('=ABS(A1)', [['-3.5']], 0, 0), '3.5')
assert.equal(evaluateCellFormula('=ABS(A1-B1)', [['1', '4']], 0, 0), '3')
assert.equal(evaluateCellFormula('=AND(A1>0,B1>0)', [['1', '2']], 0, 0), '1')
assert.equal(evaluateCellFormula('=AND(A1>0,B1>0)', [['1', '0']], 0, 0), '0')
assert.equal(evaluateCellFormula('=OR(A1>0,B1>0)', [['0', '3']], 0, 0), '1')
assert.equal(evaluateCellFormula('=AND(A1,1/0)', [['0', '1']], 0, 0), '0')
assert.equal(evaluateCellFormula('=ROUND(A1)', [['1.6']], 0, 0), '2')
assert.equal(evaluateCellFormula('=ROUND(A1,1)', [['1.25']], 0, 0), '1.3')
assert.equal(evaluateCellFormula('=ROUND(1.234,2)', [['']], 0, 0), '1.23')
assert.equal(evaluateCellFormula('=IF(A1>10,A1,0)', [['12']], 0, 0), '12')
assert.equal(evaluateCellFormula('=IF(A1>10,A1,0)', [['8']], 0, 0), '0')
assert.equal(evaluateCellFormula('=IF(A1,1/0,5)', [['0']], 0, 0), '5')
assert.equal(evaluateCellFormula('=SUM(A1+A2)', [['1'], ['2']], 0, 0), '3')
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
