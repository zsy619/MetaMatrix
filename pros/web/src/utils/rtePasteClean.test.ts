import assert from 'node:assert/strict'
import {
  FEISHU_HIGHLIGHT_COLORS,
  FEISHU_TEXT_COLORS,
  isBareHttpUrl,
  plainTextToPasteContent,
  safePasteUrl,
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

const bypass = sanitizePastedHtml(
  '<p>正文</p><script>alert(1)</script>' +
    '<a href="&#106;avascript:alert(1)">实体链</a>' +
    '<a href="data:text/html,bad">数据链</a>' +
    '<img src="x" onerror="alert(1)"><img src="data:image/png;base64,aaaa" alt="图">' +
    '<ul><li>一项</li></ul><script>alert(2)',
)
assert.ok(!/<script/i.test(bypass))
assert.ok(!/javascript:/i.test(bypass))
assert.ok(!/data:text\/html/i.test(bypass))
assert.ok(!/onerror/i.test(bypass))
assert.ok(bypass.includes('实体链'))
assert.ok(bypass.includes('一项'))
assert.ok(/data:image\/png/i.test(bypass))
assert.equal(safePasteUrl('javascript:alert(1)', 'a'), null)
assert.equal(safePasteUrl('/media/asset-1', 'img'), '/media/asset-1')
assert.equal((plainTextToPasteContent('甲\n\n\n乙') as unknown[]).length, 3)
assert.deepEqual(plainTextToPasteContent('甲\n乙'), [
  { type: 'paragraph', content: [{ type: 'text', text: '甲' }] },
  { type: 'paragraph', content: [{ type: 'text', text: '乙' }] },
])
assert.equal(plainTextToPasteContent('<b>不是标签</b>'), '<b>不是标签</b>')

assert.equal(FEISHU_TEXT_COLORS.length, 8)
assert.equal(FEISHU_HIGHLIGHT_COLORS.length, 8)
assert.ok(FEISHU_TEXT_COLORS.includes('#245bdb'))

console.log('feishu paste clean ok')
