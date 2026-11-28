import { describe, expect, it } from 'vitest'
import { buildPasteCells, cellToText, parseCellValue } from './clipboard'

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

/**
 * E-01：粘贴要按字段类型解析。
 *
 * 原来一律当字符串覆盖 —— 把 `2024-01-05` 写进日期列、把 `1,200` 写进金额列，
 * 服务端要么拒收、要么存成字符串，用户看到的是「粘进去了但值不对」。
 */
describe('粘贴按字段类型解析', () => {
  it('数字 / 金额：去千分位与货币符号', () => {
    expect(parseCellValue('1,200', 'number')).toBe(1200)
    expect(parseCellValue('￥1,200.50', 'currency')).toBe(1200.5)
    expect(parseCellValue('85%', 'percent')).toBe(85)
    expect(parseCellValue('3.5', 'rating')).toBe(3.5)
  })

  it('解析不出来的数字原样保留（不静默变成 0）', () => {
    expect(parseCellValue('待定', 'number')).toBe('待定')
    expect(parseCellValue('12个', 'number')).toBe('12个')
  })

  it('复选框：认中英文与符号', () => {
    expect(parseCellValue('是', 'checkbox')).toBe(true)
    expect(parseCellValue('否', 'checkbox')).toBe(false)
    expect(parseCellValue('TRUE', 'checkbox')).toBe(true)
    expect(parseCellValue('0', 'checkbox')).toBe(false)
    expect(parseCellValue('也许', 'checkbox')).toBe('也许')
  })

  it('日期与日期时间', () => {
    expect(parseCellValue('2024-01-05', 'date')).toBe('2024-01-05')
    expect(parseCellValue('2024/1/5', 'date')).toBe('2024-01-05')
    expect(parseCellValue('2024-01-05 13:45', 'datetime')).toBe('2024-01-05 13:45:00')
    expect(parseCellValue('2024-01-05T13:45:30', 'datetime')).toBe('2024-01-05 13:45:30')
    // 有歧义的写法不猜，原样保留。
    expect(parseCellValue('01/02/2024', 'date')).toBe('01/02/2024')
  })

  it('多选：按逗号 / 顿号 / 分号拆分', () => {
    expect(parseCellValue('销售,市场', 'multi_select')).toEqual(['销售', '市场'])
    expect(parseCellValue('销售、市场', 'multi_select')).toEqual(['销售', '市场'])
    expect(parseCellValue('销售;市场;研发', 'multi_select')).toEqual(['销售', '市场', '研发'])
  })

  it('文本类字段原样保留', () => {
    expect(parseCellValue('  你好  ', 'text')).toBe('你好')
    expect(parseCellValue('a@b.com', 'email')).toBe('a@b.com')
  })

  it('整块粘贴也按列类型分别解析', () => {
    const cells = buildPasteCells({
      text: '张三\t1200\t2024-01-05',
      rows: [{ id: 'r1' }],
      fields: [
        { id: 'f1', type: 'text' },
        { id: 'f2', type: 'number' },
        { id: 'f3', type: 'date' },
      ],
      startRow: 0,
      startCol: 0,
    })
    expect(cells.map((c) => c.value)).toEqual(['张三', 1200, '2024-01-05'])
  })
})
