// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  describeBlockMerge,
  htmlHasSuggestionMarks,
  htmlPreviewText,
  listConflictBlocks,
  mergeConflictHtml,
  resolveConflictHtml,
  summarizeBlockMerge,
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

describe('saveConflict 按块合并', () => {
  it('相同 data-block-id 且内容相同只保留一份', () => {
    const html = '<p data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">同一段</p>'
    const merged = mergeConflictHtml({ mineHtml: html + '<p data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">仅本地</p>', theirsHtml: html })
    expect(merged.match(/同一段/g)).toHaveLength(1)
    expect(merged).toContain('仅本地')
    expect(merged).toContain('data-conflict-merge="true"')
  })

  it('同一块内容冲突时并排保留，且不清洗审阅标记', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const mine = `<p data-block-id="${id}">本地${mark}</p>`
    const theirs = `<p data-block-id="${id}">远端<span data-suggestion="delete">旧句</span></p>`
    const merged = mergeConflictHtml({ mineHtml: mine, theirsHtml: theirs, mineLabel: '我的', theirsLabel: '对方' })
    expect(merged).toContain(mine)
    expect(merged).toContain(theirs)
    expect(merged).toContain('data-conflict-block="'+id+'"')
    expect(htmlHasSuggestionMarks(merged)).toBe(true)
    expect(merged).toContain('data-suggestion="insert"')
    expect(merged).toContain('data-suggestion="delete"')
  })

  it('能统计相同、冲突和单边块', () => {
    const same = '<p data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">同一段</p>'
    const mineOnly = '<p data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">仅本地</p>'
    const conflictMine = '<p data-block-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc">本地改</p>'
    const conflictTheirs = '<p data-block-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc">远端改</p>'
    const summary = summarizeBlockMerge({
      mineHtml: same + mineOnly + conflictMine,
      theirsHtml: same + conflictTheirs,
    })
    expect(summary).toEqual({ hasBlockIds: true, same: 1, conflict: 1, onlyTheirs: 0, onlyMine: 1 })
    expect(describeBlockMerge(summary)).toContain('相同 1 块')
    expect(describeBlockMerge(summary)).toContain('内容冲突 1 块')
    expect(describeBlockMerge(summary)).toContain('仅你的 1 块')
  })

  it('可按冲突块选择保留我的或对方的版本', () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const mine = `<p data-block-id="${id}">本地改</p>`
    const theirs = `<p data-block-id="${id}">远端改</p>`
    const versions = { mineHtml: mine, theirsHtml: theirs }
    expect(listConflictBlocks(versions)).toEqual([{ id, mineHtml: mine, theirsHtml: theirs }])
    const keepMine = mergeConflictHtml(versions, { [id]: 'mine' })
    expect(keepMine).toContain('本地改')
    expect(keepMine).not.toContain('远端改')
    expect(keepMine).not.toContain('data-conflict-side')
    const keepTheirs = resolveConflictHtml('merge', versions, { [id]: 'theirs' })
    expect(keepTheirs).toContain('远端改')
    expect(keepTheirs).not.toContain('本地改')
  })

  it('顶层包装内仅一个块 ID 时按该块对照，并保留外包 HTML', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const mine = `<blockquote data-callout="note"><p data-block-id="${id}">本地${mark}</p></blockquote>`
    const theirs = `<blockquote data-callout="note"><p data-block-id="${id}">远端<span data-suggestion="delete">旧句</span></p></blockquote>`
    const versions = { mineHtml: mine, theirsHtml: theirs, mineLabel: '我的', theirsLabel: '对方' }
    const summary = summarizeBlockMerge(versions)
    expect(summary).toEqual({ hasBlockIds: true, same: 0, conflict: 1, onlyTheirs: 0, onlyMine: 0 })
    expect(listConflictBlocks(versions)).toEqual([{ id, mineHtml: mine, theirsHtml: theirs }])
    const merged = mergeConflictHtml(versions)
    expect(merged).toContain(mine)
    expect(merged).toContain(theirs)
    expect(merged).toContain('data-callout="note"')
    expect(htmlHasSuggestionMarks(merged)).toBe(true)
    expect(merged).toContain('data-suggestion="insert"')
    expect(merged).toContain('data-suggestion="delete"')
    const keepMine = mergeConflictHtml(versions, { [id]: 'mine' })
    expect(keepMine).toBe(
      `<p data-conflict-merge="true">以下为按块合并的结果：相同块只保留一份；有冲突的块按你的选择保留一方或并排保留。不是飞书级三方合并。</p>` + mine,
    )
    expect(htmlHasSuggestionMarks(keepMine)).toBe(true)
    expect(keepMine).toContain('data-suggestion="insert"')
    expect(keepMine).not.toContain('data-suggestion="delete"')
  })

  it('首尾冲突块可分别选择，且预览 HTML 与落地主函数一致', () => {
    const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const mid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const last = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const mine = [
      `<p data-block-id="${first}">首本地${mark}</p>`,
      `<p data-block-id="${mid}">中间相同</p>`,
      `<p data-block-id="${last}">尾本地</p>`,
    ].join('')
    const theirs = [
      `<p data-block-id="${first}">首对方</p>`,
      `<p data-block-id="${mid}">中间相同</p>`,
      `<p data-block-id="${last}">尾对方<span data-suggestion="delete">旧句</span></p>`,
    ].join('')
    const versions = { mineHtml: mine, theirsHtml: theirs, mineLabel: '我的', theirsLabel: '对方' }
    expect(summarizeBlockMerge(versions)).toEqual({ hasBlockIds: true, same: 1, conflict: 2, onlyTheirs: 0, onlyMine: 0 })
    const choices = { [first]: 'mine' as const, [last]: 'theirs' as const }
    const applied = resolveConflictHtml('merge', versions, choices)
    const previewSource = mergeConflictHtml(versions, choices)
    expect(applied).toBe(previewSource)
    expect(htmlPreviewText(applied, 360)).toBe(htmlPreviewText(previewSource, 360))
    expect(applied).toContain('首本地')
    expect(applied).toContain('data-suggestion="insert"')
    expect(applied).not.toContain('首对方')
    expect(applied).toContain('尾对方')
    expect(applied).toContain('data-suggestion="delete"')
    expect(applied).not.toContain('尾本地')
    expect(applied).toContain('中间相同')
    expect(applied.match(/中间相同/g)).toHaveLength(1)
    expect(htmlHasSuggestionMarks(applied)).toBe(true)
  })

  it('同一包装内多个不同块 ID 时不误判为单块', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const mine = `<div class="wrap"><p data-block-id="${a}">甲本地</p><p data-block-id="${b}">乙本地</p></div>`
    const theirs = `<div class="wrap"><p data-block-id="${a}">甲对方</p><p data-block-id="${b}">乙对方</p></div>`
    const summary = summarizeBlockMerge({ mineHtml: mine, theirsHtml: theirs })
    expect(summary.hasBlockIds).toBe(false)
    expect(listConflictBlocks({ mineHtml: mine, theirsHtml: theirs })).toEqual([])
  })
})
