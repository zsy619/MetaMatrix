import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildXlsx, columnLetter } from './xlsx'

describe('xlsx 生成器', () => {
  it('列号转列名', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
    expect(columnLetter(27)).toBe('AB')
    expect(columnLetter(701)).toBe('ZZ')
  })

  it('生成的文件是合法 zip，且包含必要的 OOXML 部件', () => {
    const bytes = buildXlsx([
      {
        name: '客户管理',
        rows: [
          ['客户', '预算', '签约'],
          ['南山数科', 960000, true],
          ['华东智造 & "集团"', 1800000, false],
        ],
        columnWidths: [18, 14, 12],
      },
    ])
    // ZIP 魔数
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<pane ySplit="1"')
    expect(sheet).toContain('<t xml:space="preserve">南山数科</t>')
    expect(sheet).toContain('<v>960000</v>')
    // 特殊字符必须转义
    expect(sheet).toContain('&amp;')
    expect(sheet).not.toContain('"集团"')
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain('name="客户管理"')
  })

  it('空表也能生成合法文件', () => {
    const bytes = buildXlsx([])
    const files = unzipSync(bytes)
    expect(files['xl/workbook.xml']).toBeTruthy()
    expect(strFromU8(files['xl/workbook.xml'])).toContain('Sheet1')
  })

  it('工作表名里的非法字符被清洗、超长被截断', () => {
    const bytes = buildXlsx([{ name: 'a/b:c*d?e[f]g'.repeat(5), rows: [] }])
    const workbook = strFromU8(unzipSync(bytes)['xl/workbook.xml'])
    const matched = workbook.match(/name="([^"]*)"/)
    expect(matched).toBeTruthy()
    expect(matched![1].length).toBeLessThanOrEqual(31)
    expect(matched![1]).not.toContain('/')
  })
})
