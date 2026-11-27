import { describe, expect, it } from 'vitest'
import {
  calendarBuckets,
  calendarMonthDays,
  createField,
  defaultFilterOp,
  evaluateFormula,
  matchesFilter,
  parseCSV,
  summaryValues,
  toCSV,
  type SheetRow,
} from './sheetModel'

describe('evaluateFormula', () => {
  it('按同行的列引用计算', () => {
    const price = { ...createField('number', '单价'), id: 'p' }
    const qty = { ...createField('number', '数量'), id: 'q' }
    const row: SheetRow = { id: 'r1', cells: { p: 12.5, q: 4 } }
    expect(evaluateFormula('={单价}*{数量}', row, [price, qty])).toBe(50)
  })

  it('引用不存在的列时返回空串', () => {
    const row: SheetRow = { id: 'r1', cells: {} }
    expect(evaluateFormula('={缺失}+1', row, [])).toBe('')
  })
})

describe('summaryValues', () => {
  it('按聚合方式算列合计', () => {
    const field = { ...createField('number', '金额'), id: 'f1' }
    const rows: SheetRow[] = [
      { id: 'r1', cells: { f1: 10 } },
      { id: 'r2', cells: { f1: 20 } },
    ]
    expect(summaryValues(rows, [field], { f1: 'sum' }).f1).toBe('30')
    expect(summaryValues(rows, [field], { f1: 'avg' }).f1).toBe('15')
    expect(summaryValues(rows, [field], { f1: 'count' }).f1).toBe('2')
  })
})

describe('CSV', () => {
  it('解析带引号的 CSV', () => {
    const { fields, rows } = parseCSV('名称,备注\nA,"含,逗号"\nB,普通')
    expect(fields.map((f) => f.name)).toEqual(['名称', '备注'])
    expect(rows).toHaveLength(2)
    expect(Object.values(rows[0].cells)[1]).toBe('含,逗号')
  })

  it('导出 CSV 会给特殊字符加引号', () => {
    const field = createField('text', '名称')
    const data = {
      fields: [field],
      rows: [{ id: 'r1', cells: { [field.id]: 'a,b' } }],
      views: [],
    }
    expect(toCSV(data)).toContain('"a,b"')
  })
})

describe('calendar', () => {
  it('按日期字段分桶', () => {
    const rows: SheetRow[] = [{ id: 'r1', cells: { d: '2026-11-21' } }]
    expect(calendarBuckets(rows, 'd').get('2026-11-21')).toHaveLength(1)
  })

  it('月份天数以周一为起点补齐', () => {
    const days = calendarMonthDays(2026, 10)
    expect(days[0]).toBe('')
    expect(days.filter(Boolean)).toHaveLength(30)
  })
})

describe('defaultFilterOp 与 notContains', () => {
  it('按字段类型给出默认运算符', () => {
    expect(defaultFilterOp('text')).toBe('contains')
    expect(defaultFilterOp('number')).toBe('gte')
    expect(defaultFilterOp('date')).toBe('is')
    expect(defaultFilterOp('select')).toBe('is')
  })

  it('不包含能排除命中文本', () => {
    const row: SheetRow = { id: 'r1', cells: { n: '示例任务' } }
    expect(matchesFilter(row, { fieldId: 'n', op: 'notContains', value: '示例' })).toBe(false)
    expect(matchesFilter(row, { fieldId: 'n', op: 'notContains', value: '其他' })).toBe(true)
  })
})
