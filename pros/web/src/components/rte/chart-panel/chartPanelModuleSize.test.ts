// @vitest-environment node
/**
 * 「不堆积」守卫：图表属性面板相关的每个源文件都必须 < 300 行。
 *
 * 需求原文：「按区块拆分文件，单文件 < 300 行」。
 * 这个测试是为了防止后续改动把某个文件又撑大：一旦超标，CI 直接红。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const LIMIT = 300

/** 本仓库里需要检查的两个目录（面板组件 + 图表工具层）。 */
const WATCH_DIRS = [
  fileURLToPath(new URL('.', import.meta.url)),
  fileURLToPath(new URL('../../../utils/echarts', import.meta.url)),
]

/** 收集目录下的源文件（递归子目录，排除测试文件与声明文件）。 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      // templates/ 只是静态资源（JSON / TS 数据表），不算面板代码
      if (name === 'templates') continue
      out.push(...collectSourceFiles(full))
      continue
    }
    if (!/\.(ts|vue)$/.test(name)) continue
    if (/\.(test|d)\.ts$/.test(name)) continue
    out.push(full)
  }
  return out
}

describe('图表属性面板 · 文件规模守卫', () => {
  it('每个源文件都少于 300 行', () => {
    const offenders: string[] = []
    for (const dir of WATCH_DIRS) {
      for (const file of collectSourceFiles(dir)) {
        const lines = readFileSync(file, 'utf8').split('\n').length
        if (lines >= LIMIT) {
          offenders.push(`${relative(process.cwd(), file)}（${lines} 行）`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('面板区块确实拆成了多个文件（没有退化成一个大文件）', () => {
    const dir = WATCH_DIRS[0]!
    const files = collectSourceFiles(dir)
    // 面板区块组件 + composable 至少 10 个文件
    expect(files.length).toBeGreaterThanOrEqual(10)
  })
})
