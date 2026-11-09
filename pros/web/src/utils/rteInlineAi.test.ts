import { describe, expect, it } from 'vitest'
import { rewriteWithContext } from './rteInlineAi'

describe('文内改写', () => {
  it('润色会收空格并补上中英文间距', () => {
    expect(rewriteWithContext('polish', '  使用 API  接口  \n\n  ')?.text).toBe('使用 API 接口')
  })

  it('缩写留第一句，扩写只复述选区和上文', () => {
    expect(rewriteWithContext('shorten', '第一句。第二句。')?.text).toBe('第一句。')
    const expanded = rewriteWithContext('expand', '交付范围。', '上周会议')
    expect(expanded?.text).toContain('交付范围')
    expect(expanded?.text).toContain('上周会议')
    expect(expanded?.text).not.toMatch(/。。/)
    expect(expanded?.text).not.toMatch(/根据公开资料|据研究表明/)
  })

  it('正式、要点和续写都只改现有文字', () => {
    expect(rewriteWithContext('formal', '咱们搞定了啥')?.text).toBe('我们完成了什么')
    const bullets = rewriteWithContext('bullets', '甲。乙。')
    expect(bullets?.html).toBe('<ul><li><p>甲。</p></li><li><p>乙。</p></li></ul>')
    expect(rewriteWithContext('continue', '说明范围。')?.text).toContain('说明范围')
    expect(rewriteWithContext('shorten', '已经很短。')).toBeNull()
  })
})