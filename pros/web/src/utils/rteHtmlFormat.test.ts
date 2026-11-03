import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { formatHtml, tokenizeHtml } from './rteHtmlFormat.ts'

/** 去掉所有空白与标签，用于校验「格式化不改内容」。 */
function stripAll(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim()
}

describe('formatHtml', () => {
  it('空输入原样返回', () => {
    assert.equal(formatHtml(''), '')
    assert.equal(formatHtml('   '), '   ')
  })

  it('单段落保持一行', () => {
    assert.equal(formatHtml('<p>hello</p>'), '<p>hello</p>')
  })

  it('块级元素按层级缩进', () => {
    const out = formatHtml('<div><p>a</p><p>b</p></div>')
    assert.equal(out, ['<div>', '  <p>a</p>', '  <p>b</p>', '</div>'].join('\n'))
  })

  it('嵌套层级保持正确缩进', () => {
    const out = formatHtml('<ul><li><p>item</p></li></ul>')
    assert.equal(out, ['<ul>', '  <li>', '    <p>item</p>', '  </li>', '</ul>'].join('\n'))
  })

  it('行内元素与文字保持同行', () => {
    const out = formatHtml('<p>hello <b>world</b>!</p>')
    assert.equal(out, '<p>hello <b>world</b>!</p>')
  })

  it('保留属性与引号', () => {
    const out = formatHtml('<p class="a" data-x=\'1\'>t</p>')
    assert.equal(out, '<p class="a" data-x=\'1\'>t</p>')
  })

  it('保留自闭合与 void 元素', () => {
    const out = formatHtml('<p>a<br>b</p><img src="x.png">')
    assert.ok(out.includes('<br>'))
    assert.ok(out.includes('<img src="x.png">'))
  })

  it('注释与 doctype 独占一行', () => {
    const out = formatHtml('<!DOCTYPE html><!-- hi --><p>a</p>')
    assert.equal(out, ['<!DOCTYPE html>', '<!-- hi -->', '<p>a</p>'].join('\n'))
  })

  it('script 内容原样保留', () => {
    const src = '<div><script>var a = 1 < 2;</script></div>'
    const out = formatHtml(src)
    assert.ok(out.includes('var a = 1 < 2;'))
    assert.equal(stripAll(out), stripAll(src))
  })

  it('自定义缩进单位', () => {
    const out = formatHtml('<div><p>a</p></div>', { indent: '    ' })
    assert.equal(out, ['<div>', '    <p>a</p>', '</div>'].join('\n'))
  })

  it('不会丢内容（标签与文字一致）', () => {
    const src = '<div><p>标题</p><ul><li>一</li><li>二</li></ul><p>结尾 <b>加粗</b></p></div>'
    const out = formatHtml(src)
    assert.equal(stripAll(out), stripAll(src))
  })

  it('重复格式化结果稳定（幂等）', () => {
    const src = '<div><p>a</p><ul><li>x</li></ul></div>'
    const once = formatHtml(src)
    assert.equal(formatHtml(once), once)
  })

  it('未闭合标签不会抛错', () => {
    const out = formatHtml('<div><p>未闭合')
    assert.ok(out.includes('<p>未闭合'))
  })
})

describe('tokenizeHtml', () => {
  it('能切出标签与文本', () => {
    const toks = tokenizeHtml('<p>hi</p>')
    assert.deepEqual(toks.map((t) => t.kind), ['open', 'text', 'close'])
  })

  it('属性里的 > 不会截断标签', () => {
    const toks = tokenizeHtml('<a title="a > b">x</a>')
    assert.equal(toks[0].kind, 'open')
    assert.equal((toks[0] as { text: string }).text, '<a title="a > b">')
  })
})
