import { describe, expect, it } from 'vitest'
import {
  htmlHasSuggestionMarks,
  htmlPreviewText,
  mergeConflictHtml,
  resolveConflictHtml,
} from './saveConflict'

const mark = '<span data-suggestion="insert" data-author-name="李四">新增句</span>'

describe('saveConflict', () => {
  it('预览去掉标签，保留纯文本', () => {
    expect(htmlPreviewText('<p>你好<strong>世界</strong></p>')).toBe('你好世界')
  })

  it('选择我的或对方的版本原样返回', () => {
    const versions = { mineHtml: '<p>我的</p>', theirsHtml: '<p>对方</p>' }
    expect(resolveConflictHtml('mine', versions)).toBe('<p>我的</p>')
    expect(resolveConflictHtml('theirs', versions)).toBe('<p>对方</p>')
  })

  it('合并两边并保留审阅标记', () => {
    const mine = `<p>本地${mark}</p>`
    const theirs = '<p>远端已有<span data-suggestion="delete">旧句</span></p>'
    const merged = mergeConflictHtml({ mineHtml: mine, theirsHtml: theirs, mineLabel: '我的', theirsLabel: '对方' })
    expect(merged).toContain(mine)
    expect(merged).toContain(theirs)
    expect(merged).toContain('data-conflict-merge="true"')
    expect(htmlHasSuggestionMarks(merged)).toBe(true)
    expect(merged).toContain('data-suggestion="insert"')
    expect(merged).toContain('data-suggestion="delete"')
    expect(resolveConflictHtml('merge', { mineHtml: mine, theirsHtml: theirs, mineLabel: '我的', theirsLabel: '对方' })).toBe(merged)
  })

  it('两边相同时合并不复制一份', () => {
    const html = `<p>${mark}</p>`
    expect(mergeConflictHtml({ mineHtml: html, theirsHtml: html })).toBe(html)
  })
})
