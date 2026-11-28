import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const scopedCss = readFileSync(new URL('./styles/editor.scoped.css', import.meta.url), 'utf8')
const bodyVue = readFileSync(new URL('./RteDocumentBody.vue', import.meta.url), 'utf8')

describe('「+」块操作面板的面板形态', () => {
  it('基础区是四列格子，图标下面带可见名称', () => {
    expect(scopedCss).toMatch(/\.rte-block-quick-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
    expect(scopedCss).toMatch(/\.rte-block-quick-label\s*\{/)
    // 名称是可见文本，不再是 sr-only（否则只剩一排认不出的图标）
    expect(bodyVue).toMatch(/class="rte-block-quick-label"/)
    expect(bodyVue).not.toMatch(/class="rte-sr-only">\{\{ action\.label \}\}/)
  })

  it('分组标题之间有发丝线，子分组标题不画线', () => {
    expect(scopedCss).toMatch(/\.rte-block-menu-section\s*\{[^}]*border-top:\s*1px solid #f0f1f3/)
    expect(scopedCss).toMatch(/\.rte-block-menu-section:first-child\s*\{[^}]*border-top:\s*none/)
    expect(scopedCss).toMatch(/\.rte-block-menu-sublabel\s*\{/)
  })

  it('「在下方插入」归到块操作区，「转换为」降为子分组', () => {
    const blockOpsAt = bodyVue.indexOf('class="rte-block-menu-section">块操作</div>')
    const insertBelowAt = bodyVue.indexOf('在下方插入')
    expect(blockOpsAt).toBeGreaterThan(-1)
    expect(insertBelowAt).toBeGreaterThan(blockOpsAt)
    expect(bodyVue).toMatch(/class="rte-block-menu-sublabel">转换为<\/div>/)
  })
})
