// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  Timeline,
  TimelineItem,
  combineTimelineTime,
  isValidClock,
  isValidDate,
  normalizeDate,
  deleteTimelineItemAt,
  findTimelineContext,
  normalizeClock,
  parseTimelineTimeText,
  splitTimelineTime,
  todayDate,
} from './timeline'

function createEditor() {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [StarterKit, Timeline, TimelineItem],
    content: '<p>hello</p>',
  })
  return editor
}

/** 找到文档里第一个 timeline 节点的位置。 */
function firstTimelinePos(editor: Editor): number {
  let pos = -1
  editor.state.doc.descendants((node, at) => {
    if (pos < 0 && node.type.name === 'timeline') pos = at
    return pos < 0
  })
  return pos
}

describe('时间线：插入 / 增删节点', () => {
  it('插入时间线后默认带 3 个节点', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const pos = firstTimelinePos(editor)
    expect(pos).toBeGreaterThan(-1)
    const timeline = editor.state.doc.nodeAt(pos)
    expect(timeline?.type.name).toBe('timeline')
    expect(timeline?.childCount).toBe(3)
    editor.destroy()
  })

  it('新插入的时间线，第一个节点默认今天的日期', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const pos = firstTimelinePos(editor)
    const first = editor.state.doc.nodeAt(pos)?.child(0)
    expect(first?.attrs.time).toBe(todayDate())
    editor.destroy()
  })

  it('可指定时间与标题', () => {
    const editor = createEditor()
    editor
      .chain()
      .focus()
      .insertTimeline([{ time: '2026-11-25 09:30:00', title: '评审', body: '对齐口径' }])
      .run()
    const pos = firstTimelinePos(editor)
    const item = editor.state.doc.nodeAt(pos)?.child(0)
    expect(item?.attrs.time).toBe('2026-11-25 09:30:00')
    expect(item?.attrs.title).toBe('评审')
    editor.destroy()
  })

  it('在时间线里能追加节点', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const pos = firstTimelinePos(editor)
    editor.commands.setTextSelection(pos + 2)
    expect(editor.commands.addTimelineItem()).toBe(true)
    expect(editor.state.doc.nodeAt(pos)?.childCount).toBe(4)
    editor.destroy()
  })

  it('新增节点默认带今天的日期', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const pos = firstTimelinePos(editor)
    editor.commands.setTextSelection(pos + 2)
    editor.commands.addTimelineItem()
    const timeline = editor.state.doc.nodeAt(pos)
    // 光标在第一个节点里 → 新节点插在它下面（index 1）
    expect(timeline?.child(1).attrs.time).toBe(todayDate())
    editor.destroy()
  })

  it('能删除当前节点', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const pos = firstTimelinePos(editor)
    editor.commands.setTextSelection(pos + 2)
    expect(editor.commands.deleteTimelineItem()).toBe(true)
    expect(editor.state.doc.nodeAt(pos)?.childCount).toBe(2)
    editor.destroy()
  })

  it('只剩一个节点时删除整条时间线', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline([{ time: '2026-01-01', title: '只有我' }]).run()
    const pos = firstTimelinePos(editor)
    editor.commands.setTextSelection(pos + 2)
    expect(editor.commands.deleteTimelineItem()).toBe(true)
    expect(firstTimelinePos(editor)).toBe(-1)
    editor.destroy()
  })

  it('光标不在时间线里时，删除命令不生效', () => {
    const editor = createEditor()
    expect(editor.commands.deleteTimelineItem()).toBe(false)
    editor.destroy()
  })

  it('删掉最后一个节点会连同整条时间线一起删（不残留空节点）', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline([{ time: '2026-01-01', title: '只有我' }]).run()
    const pos = firstTimelinePos(editor)
    expect(deleteTimelineItemAt(editor.view, pos + 1)).toBe(true)
    expect(firstTimelinePos(editor)).toBe(-1)
    editor.destroy()
  })

  it('删除中间节点不会给剩下的节点塞默认值', () => {
    const editor = createEditor()
    editor
      .chain()
      .focus()
      .insertTimeline([
        { time: '2026-01-01', title: 'A' },
        { time: '2026-02-01', title: 'B' },
        { time: '2026-03-01', title: 'C' },
      ])
      .run()
    const pos = firstTimelinePos(editor)
    expect(deleteTimelineItemAt(editor.view, pos + 1)).toBe(true)
    const timeline = editor.state.doc.nodeAt(pos)
    expect(timeline?.childCount).toBe(2)
    expect(timeline?.child(0).attrs.title).toBe('B')
    expect(timeline?.child(1).attrs.title).toBe('C')
    editor.destroy()
  })
})

describe('findTimelineContext', () => {
  it('能定位时间线与所在节点', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const pos = firstTimelinePos(editor)
    editor.commands.setTextSelection(pos + 2)
    const ctx = findTimelineContext(editor.state.selection.$from)
    expect(ctx.timelinePos).toBe(pos)
    expect(ctx.itemPos).toBeGreaterThan(-1)
    editor.destroy()
  })
})

describe('时间字段：日期与时间可分别填写', () => {
  it('只填日期时只显示日期', () => {
    expect(combineTimelineTime('2026-11-25', '')).toBe('2026-11-25')
  })

  it('只填时间时只显示时间', () => {
    expect(combineTimelineTime('', '09:30')).toBe('09:30:00')
  })

  it('两者都填时显示 yyyy-MM-dd HH:mm:ss', () => {
    expect(combineTimelineTime('2026-11-25', '09:30')).toBe('2026-11-25 09:30:00')
    expect(combineTimelineTime('2026-11-25', '09:30:12')).toBe('2026-11-25 09:30:12')
  })

  it('都能为空', () => {
    expect(combineTimelineTime('', '')).toBe('')
  })

  it('splitTimelineTime 能拆回日期与时分秒', () => {
    expect(splitTimelineTime('2026-11-25 09:30:12')).toEqual({
      date: '2026-11-25',
      clock: '09:30:12',
    })
    expect(splitTimelineTime('2026-11-25T09:30')).toEqual({
      date: '2026-11-25',
      clock: '09:30:00',
    })
    expect(splitTimelineTime('2026-11-25')).toEqual({ date: '2026-11-25', clock: '' })
    expect(splitTimelineTime('09:30')).toEqual({ date: '', clock: '09:30:00' })
    expect(splitTimelineTime('')).toEqual({ date: '', clock: '' })
  })

  it('日期 / 时间合法性校验', () => {
    expect(isValidDate('2026-11-25')).toBe(true)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidClock('23:59:59')).toBe(true)
    expect(isValidClock('24:00:00')).toBe(false)
    expect(isValidClock('12:60')).toBe(false)
    expect(normalizeDate('2026-1-5')).toBe('2026-01-05')
  })

  it('时分秒补齐到 HH:mm:ss', () => {
    expect(normalizeClock('9:30')).toBe('09:30:00')
    expect(normalizeClock('09:30:05')).toBe('09:30:05')
    expect(normalizeClock('')).toBe('')
  })
})

describe('时间线节点视图（DOM 级）', () => {
  it('日期与时间合并为一个输入框，没有形态下拉', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    expect(dom.querySelector('select.rte-timeline-format')).toBeNull()
    const time = dom.querySelector('input.rte-timeline-time') as HTMLInputElement
    expect(time).toBeTruthy()
    // 旧的两个独立输入框已合并掉
    expect(dom.querySelector('input.rte-timeline-date')).toBeNull()
    expect(dom.querySelector('input.rte-timeline-clock')).toBeNull()
    // 文本框：显示格式固定为 yyyy-MM-dd HH:mm:ss，不随浏览器语言变化
    expect(time.type).toBe('text')
    expect(time.placeholder).toBe('yyyy-MM-dd HH:mm:ss')
    expect(time.value).toBe(todayDate())
    // 原生选择器仅作为取数面板（每个节点一组：日期 + 时间）
    const firstItem = dom.querySelector('.rte-timeline-item') as HTMLElement
    const pickers = firstItem.querySelectorAll('input.rte-timeline-picker')
    expect(pickers.length).toBe(2)
    expect((pickers[0] as HTMLInputElement).type).toBe('date')
    expect((pickers[1] as HTMLInputElement).type).toBe('time')
    editor.destroy()
  })

  it('底部「添加节点」按钮已隐藏', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    expect(dom.querySelector('.rte-timeline-add')).toBeNull()
    expect(dom.querySelector('.rte-timeline-tools')).toBeNull()
    editor.destroy()
  })

  it('非法输入标红且不写入文档，失焦回滚', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    const time = dom.querySelector('input.rte-timeline-time') as HTMLInputElement
    const pos = firstTimelinePos(editor)
    time.value = '2026-13-45'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    expect(time.classList.contains('is-invalid')).toBe(true)
    expect(editor.state.doc.nodeAt(pos)?.child(0).attrs.time).toBe(todayDate())
    time.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(time.value).toBe(todayDate())
    expect(time.classList.contains('is-invalid')).toBe(false)
    editor.destroy()
  })

  it('原生选择器选完会写回输入框与文档', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    const firstItem = dom.querySelector('.rte-timeline-item') as HTMLElement
    const pickers = firstItem.querySelectorAll('input.rte-timeline-picker')
    const time = dom.querySelector('input.rte-timeline-time') as HTMLInputElement
    ;(pickers[0] as HTMLInputElement).value = '2027-01-02'
    ;(pickers[0] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }))
    ;(pickers[1] as HTMLInputElement).value = '08:09'
    ;(pickers[1] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }))
    expect(time.value).toBe('2027-01-02 08:09:00')
    const pos = firstTimelinePos(editor)
    expect(editor.state.doc.nodeAt(pos)?.child(0).attrs.time).toBe('2027-01-02 08:09:00')
    editor.destroy()
  })

  it('每个节点都有添加与删除按钮', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    const items = dom.querySelectorAll('.rte-timeline-item')
    expect(items.length).toBe(3)
    for (const item of items) {
      expect(item.querySelector('.rte-timeline-add-item')).toBeTruthy()
      expect(item.querySelector('.rte-timeline-del')).toBeTruthy()
    }
    editor.destroy()
  })

  it('节点上的「添加」按钮把新节点插在当前节点下面', () => {
    const editor = createEditor()
    editor
      .chain()
      .focus()
      .insertTimeline([
        { time: '2026-01-01', title: 'A' },
        { time: '2026-02-01', title: 'B' },
        { time: '2026-03-01', title: 'C' },
      ])
      .run()
    const dom = editor.view.dom as HTMLElement
    const items = dom.querySelectorAll('.rte-timeline-item')
    ;(items[0].querySelector('.rte-timeline-add-item') as HTMLButtonElement).click()
    const pos = firstTimelinePos(editor)
    const timeline = editor.state.doc.nodeAt(pos)
    expect(timeline?.childCount).toBe(4)
    expect(timeline?.child(1).attrs.title).toBe('新节点')
    expect(timeline?.child(2).attrs.title).toBe('B')
    editor.destroy()
  })

  it('工具栏「加节点」在光标所在节点下面插入', () => {
    const editor = createEditor()
    editor
      .chain()
      .focus()
      .insertTimeline([
        { time: '2026-01-01', title: 'A' },
        { time: '2026-02-01', title: 'B' },
      ])
      .run()
    const pos = firstTimelinePos(editor)
    // 光标放在第一个节点里
    editor.commands.setTextSelection(pos + 2)
    editor.commands.addTimelineItem()
    const timeline = editor.state.doc.nodeAt(pos)
    expect(timeline?.childCount).toBe(3)
    expect(timeline?.child(1).attrs.title).toBe('新节点')
    expect(timeline?.child(2).attrs.title).toBe('B')
    editor.destroy()
  })

  it('同一个输入框里填日期与时间会合成 yyyy-MM-dd HH:mm:ss', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    const time = dom.querySelector('input.rte-timeline-time') as HTMLInputElement
    time.value = '2026-12-31 23:59:07'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    const pos = firstTimelinePos(editor)
    const item = editor.state.doc.nodeAt(pos)?.child(0)
    expect(item?.attrs.time).toBe('2026-12-31 23:59:07')
    expect((dom.querySelector('input.rte-timeline-time') as HTMLInputElement).value).toBe(
      '2026-12-31 23:59:07',
    )
    editor.destroy()
  })

  it('只填日期时只存日期，只填时间时只存时间', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    const time = dom.querySelector('input.rte-timeline-time') as HTMLInputElement
    const pos = firstTimelinePos(editor)

    time.value = '2026-12-31'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.state.doc.nodeAt(pos)?.child(0).attrs.time).toBe('2026-12-31')

    time.value = '08:00'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.state.doc.nodeAt(pos)?.child(0).attrs.time).toBe('08:00:00')

    time.value = ''
    time.dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.state.doc.nodeAt(pos)?.child(0).attrs.time).toBe('')
    editor.destroy()
  })

  it('单框文本解析：日期 / 时间 / 两者 / 非法', () => {
    expect(parseTimelineTimeText('2026-11-25')).toEqual({
      date: '2026-11-25',
      clock: '',
      valid: true,
    })
    expect(parseTimelineTimeText('09:30')).toEqual({
      date: '',
      clock: '09:30:00',
      valid: true,
    })
    expect(parseTimelineTimeText('2026-11-25 09:30:00')).toEqual({
      date: '2026-11-25',
      clock: '09:30:00',
      valid: true,
    })
    expect(parseTimelineTimeText('2026-11-25T09:30')).toEqual({
      date: '2026-11-25',
      clock: '09:30:00',
      valid: true,
    })
    expect(parseTimelineTimeText('2026-13-45').valid).toBe(false)
    expect(parseTimelineTimeText('abc').valid).toBe(false)
  })

  it('改标题会写回文档属性', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline().run()
    const dom = editor.view.dom as HTMLElement
    const title = dom.querySelector('input.rte-timeline-title') as HTMLInputElement
    title.value = '上线'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    const pos = firstTimelinePos(editor)
    expect(editor.state.doc.nodeAt(pos)?.child(0).attrs.title).toBe('上线')
    editor.destroy()
  })

  it('「删除」按钮删掉最后一个节点时整条时间线一起消失', () => {
    const editor = createEditor()
    editor.chain().focus().insertTimeline([{ time: '2026-01-01', title: '只有我' }]).run()
    const dom = editor.view.dom as HTMLElement
    const del = dom.querySelector('.rte-timeline-del') as HTMLButtonElement
    del.click()
    expect(firstTimelinePos(editor)).toBe(-1)
    editor.destroy()
  })
})
