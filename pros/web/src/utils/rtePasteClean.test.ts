import assert from 'node:assert/strict'
import {
  FEISHU_HIGHLIGHT_COLORS,
  FEISHU_TEXT_COLORS,
  isBareHttpUrl,
  sanitizePastedHtml,
} from './rtePasteClean.ts'

const cleaned = sanitizePastedHtml(
  '<p><strong>重点</strong> <span style="color: #d83931; mso-bidi-font-weight: bold" class="MsoNormal">红字</span></p>' +
    '<script>alert(1)</script><a href="javascript:alert(1)">坏链</a>' +
    '<font color="#245bdb">蓝</font>',
)
assert.ok(cleaned.includes('<strong>重点</strong>'))
assert.ok(/color:\s*#d83931/i.test(cleaned))
assert.ok(!cleaned.includes('mso-'))
assert.ok(!cleaned.includes('<script'))
assert.ok(!/javascript:/i.test(cleaned))
assert.ok(cleaned.includes('#245bdb'))

assert.equal(isBareHttpUrl('https://example.com/a'), true)
assert.equal(isBareHttpUrl('https://example.com/a b'), false)
assert.equal(isBareHttpUrl('javascript:alert(1)'), false)

assert.equal(FEISHU_TEXT_COLORS.length, 8)
assert.equal(FEISHU_HIGHLIGHT_COLORS.length, 8)
assert.ok(FEISHU_TEXT_COLORS.includes('#245bdb'))

console.log('feishu paste clean ok')
